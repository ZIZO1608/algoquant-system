import http from 'http';
import { AddressInfo } from 'net';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { prisma } from '../src/lib/prisma.js';
import { createApp } from '../src/app.js';
import { signAccessToken } from '../src/services/auth.service.js';
import { PrivilegeCode } from '../src/config/index.js';
import {
  getSiteChatSettingsRow,
  syncSiteChatsOnce,
} from '../src/services/site-chat-sync.service.js';
import { resetDb, disconnectTestDb } from './helpers/db.js';
import { createEmployee } from './helpers/factories.js';

const app = createApp();

function bearer(employee: { id: string; email: string }, privileges: PrivilegeCode[]) {
  return `Bearer ${signAccessToken({ sub: employee.id, email: employee.email, privileges })}`;
}

function minutesAgo(n: number) {
  return new Date(Date.now() - n * 60_000).toISOString();
}

function conversation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'site-conv-1',
    session_id: 'sess-1',
    channel: 'workshop',
    lang: 'ar',
    status: 'active',
    started_at: minutesAgo(3),
    last_activity_at: minutesAgo(1),
    updated_at: minutesAgo(1),
    messages: [
      { role: 'assistant', content: 'أهلاً! شو اسمك؟', at: minutesAgo(3) },
      { role: 'user', content: 'بدي ورشة أتمتة', at: minutesAgo(1) },
    ],
    visitor: null,
    ...overrides,
  };
}

async function enable() {
  const s = await getSiteChatSettingsRow();
  await prisma.settingsSiteChat.update({ where: { id: s.id }, data: { enabled: true } });
  return s.token;
}

describe('Website bot conversations (integration)', () => {
  let admin: Awaited<ReturnType<typeof createEmployee>>;
  let instructor: Awaited<ReturnType<typeof createEmployee>>;

  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    await resetDb();
    admin = await createEmployee({ privileges: ['admin'], fullName: 'Admin' });
    instructor = await createEmployee({ privileges: ['instructor'], fullName: 'Instructor' });
    await createEmployee({ privileges: ['sales'], isActive: false, fullName: 'Former' });
    await prisma.leadSource.create({ data: { code: 'bot', labelAr: 'بوت التأهيل', isSystem: true } });
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  it('push: refuses a missing or wrong token, and a disabled connection', async () => {
    const s = await getSiteChatSettingsRow();
    const body = { conversation: conversation() };

    await request(app).post('/api/v1/webhooks/site-chat').send(body).expect(401);
    await request(app)
      .post('/api/v1/webhooks/site-chat')
      .set('Authorization', 'Bearer nope')
      .send(body)
      .expect(401);
    await request(app)
      .post('/api/v1/webhooks/site-chat')
      .set('Authorization', `Bearer ${s.token}`)
      .send(body)
      .expect(503);
    expect(await prisma.siteConversation.count()).toBe(0);
  });

  it('push: stores a conversation once and ignores an older copy', async () => {
    const token = await enable();
    const push = (payload: unknown) =>
      request(app).post('/api/v1/webhooks/site-chat').set('Authorization', `Bearer ${token}`).send(payload);

    const res = await push({ conversation: conversation() });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, received: 1 });
    await push({ conversation: conversation() }).expect(200);
    expect(await prisma.siteConversation.count()).toBe(1);

    const newer = conversation({
      updated_at: minutesAgo(0),
      messages: [...conversation().messages, { role: 'assistant', content: 'تمام', at: minutesAgo(0) }],
    });
    await push({ conversations: [newer] }).expect(200);
    await push({ conversation: conversation() }).expect(200); // stale copy arrives late
    const row = await prisma.siteConversation.findUniqueOrThrow({ where: { externalId: 'site-conv-1' } });
    expect(row.messageCount).toBe(3);
    expect(await prisma.lead.count()).toBe(0); // no contact details yet
  });

  it('creates one CRM lead when the visitor leaves contact details and tells every active employee', async () => {
    const token = await enable();
    const push = (payload: unknown) =>
      request(app).post('/api/v1/webhooks/site-chat').set('Authorization', `Bearer ${token}`).send(payload);

    await push({ conversation: conversation() }).expect(200);
    await push({
      conversation: conversation({
        updated_at: minutesAgo(0.5),
        lead: {
          table: 'workshop_leads',
          id: 'wl-1',
          fields: { full_name: 'رامي', whatsapp: '+963944000111', interest_area: 'أتمتة', needs_call: true },
        },
      }),
    }).expect(200);

    const lead = await prisma.lead.findFirstOrThrow({ include: { source: true } });
    expect(lead).toMatchObject({
      fullName: 'رامي',
      phone: '+963944000111',
      sourceSystem: 'workshop_bot',
      externalLeadId: 'wl-1',
      requestedCourseText: 'أتمتة',
    });
    expect(lead.source.code).toBe('bot');
    expect(lead.extraData).toMatchObject({ interest_area: 'أتمتة', needs_a_call: true, site_channel: 'workshop' });

    const row = await prisma.siteConversation.findFirstOrThrow();
    expect(row.leadId).toBe(lead.id);

    const notes = await prisma.notification.findMany({ where: { type: 'site_chat_contact' } });
    expect(notes.map((n) => n.employeeId).sort()).toEqual([admin.id, instructor.id].sort());
    expect(notes[0].payload).toMatchObject({ siteChatId: row.id, leadId: lead.id });

    // Later turns add missing details to the same lead and do not notify again.
    await push({
      conversation: conversation({
        updated_at: minutesAgo(0),
        status: 'completed',
        lead: {
          table: 'workshop_leads',
          id: 'wl-1',
          fields: { full_name: 'رامي', whatsapp: '+963944000111', interest_area: 'شي تاني', city: 'حمص', lead_classification: 'hot' },
        },
      }),
    }).expect(200);
    expect(await prisma.lead.count()).toBe(1);
    const updated = await prisma.lead.findFirstOrThrow();
    expect(updated.extraData).toMatchObject({ interest_area: 'أتمتة', city: 'حمص', lead_classification: 'hot' });
    expect(await prisma.notification.count({ where: { type: 'site_chat_contact' } })).toBe(2);
  });

  it('links a returning visitor to their existing lead instead of duplicating it', async () => {
    const token = await enable();
    const source = await prisma.leadSource.create({ data: { code: 'reference', labelAr: 'إحالة' } });
    const existing = await prisma.lead.create({
      data: { fullName: 'سارة', phone: '0999111222', sourceId: source.id },
    });

    await request(app)
      .post('/api/v1/webhooks/site-chat')
      .set('Authorization', `Bearer ${token}`)
      .send({
        conversation: conversation({
          channel: 'elevator',
          visitor: { name: 'سارة', contact: '0999111222', contact_method: 'واتساب' },
          answers: { goal: 'أتعلم' },
        }),
      })
      .expect(200);

    expect(await prisma.lead.count()).toBe(1);
    const row = await prisma.siteConversation.findFirstOrThrow();
    expect(row.leadId).toBe(existing.id);
    const activity = await prisma.leadActivity.findFirst({ where: { leadId: existing.id, type: 'site_chat' } });
    expect(activity?.body).toContain('elevator');
  });

  it('stores old conversations quietly (first import, laptop was off)', async () => {
    const token = await enable();
    await request(app)
      .post('/api/v1/webhooks/site-chat')
      .set('Authorization', `Bearer ${token}`)
      .send({
        conversation: conversation({
          started_at: minutesAgo(3000),
          last_activity_at: minutesAgo(2990),
          updated_at: minutesAgo(2990),
          visitor: { name: 'قديم', contact: '0911000000' },
        }),
      })
      .expect(200);
    expect(await prisma.lead.count()).toBe(1);
    expect(await prisma.notification.count()).toBe(0);
  });

  it('every role can read the list, stats and transcript; only admins see the connection settings', async () => {
    const token = await enable();
    const push = (payload: unknown) =>
      request(app).post('/api/v1/webhooks/site-chat').set('Authorization', `Bearer ${token}`).send(payload);
    await push({ conversation: conversation() }).expect(200);
    await push({
      conversation: conversation({
        id: 'site-conv-old',
        session_id: 'sess-old',
        started_at: minutesAgo(120),
        last_activity_at: minutesAgo(100),
        updated_at: minutesAgo(100),
        messages: [{ role: 'user', content: 'مرحبا', at: minutesAgo(100) }],
        visitor: { name: 'Lina', contact: '0933' },
      }),
    }).expect(200);

    const auth = bearer(instructor, ['instructor']);
    const list = await request(app).get('/api/v1/site-chats').set('Authorization', auth).expect(200);
    expect(list.body.items.map((i: { visitorName: string | null }) => i.visitorName)).toEqual([null, 'Lina']);
    expect(list.body.items[0]).toMatchObject({ userMessageCount: 1, preview: 'بدي ورشة أتمتة' });

    const live = await request(app).get('/api/v1/site-chats?filter=live').set('Authorization', auth).expect(200);
    expect(live.body.items).toHaveLength(1);
    const withContact = await request(app).get('/api/v1/site-chats?filter=contact').set('Authorization', auth);
    expect(withContact.body.items.map((i: { visitorName: string }) => i.visitorName)).toEqual(['Lina']);
    const search = await request(app).get('/api/v1/site-chats?q=أتمتة').set('Authorization', auth);
    expect(search.body.items).toHaveLength(1);

    const page1 = await request(app).get('/api/v1/site-chats?limit=1').set('Authorization', auth);
    expect(page1.body.nextBefore).toBeTruthy();
    const page2 = await request(app)
      .get(`/api/v1/site-chats?limit=1&before=${encodeURIComponent(page1.body.nextBefore)}`)
      .set('Authorization', auth);
    expect(page2.body.items[0].visitorName).toBe('Lina');
    expect(page2.body.nextBefore).toBeNull();

    const stats = await request(app).get('/api/v1/site-chats/stats').set('Authorization', auth).expect(200);
    expect(stats.body).toMatchObject({ live: 1, total: 2, connection: { enabled: true } });
    expect(JSON.stringify(stats.body)).not.toContain(token);

    const detail = await request(app)
      .get(`/api/v1/site-chats/${list.body.items[0].id}`)
      .set('Authorization', auth)
      .expect(200);
    expect(detail.body.messages).toHaveLength(2);
    expect(detail.body.live).toBe(true);
    expect(detail.body).not.toHaveProperty('searchText');

    await request(app).get('/api/v1/site-chats').expect(401);
    await request(app).get('/api/v1/settings/site-chat').set('Authorization', auth).expect(403);
    const settings = await request(app)
      .get('/api/v1/settings/site-chat')
      .set('Authorization', bearer(admin, ['admin']))
      .expect(200);
    expect(settings.body).toMatchObject({ enabled: true, token, conversations: 2 });
  });

  describe('pull sync against a website', () => {
    let server: http.Server;
    let baseUrl: string;
    let seen: { auth?: string; cursor: string | null }[];
    let status = 200;

    const feed = [
      conversation({ id: 'a', updated_at: minutesAgo(3) }),
      conversation({ id: 'b', updated_at: minutesAgo(2) }),
      conversation({ id: 'c', updated_at: minutesAgo(1), visitor: { name: 'Omar', contact: '0955' } }),
    ];

    beforeAll(async () => {
      server = http.createServer((req, res) => {
        const url = new URL(req.url ?? '/', 'http://x');
        seen.push({ auth: req.headers.authorization, cursor: url.searchParams.get('cursor') });
        res.setHeader('content-type', 'application/json');
        if (status !== 200) {
          res.statusCode = status;
          res.end(JSON.stringify({ error: 'unauthorized' }));
          return;
        }
        if (url.pathname === '/api/erp/ping') {
          res.end(JSON.stringify({ ok: true, version: 1, conversations: feed.length }));
          return;
        }
        // Two per page; the cursor is the index to continue from.
        const start = Number(url.searchParams.get('cursor') ?? 0);
        const page = feed.slice(start, start + 2);
        const next = start + page.length;
        res.end(JSON.stringify({ conversations: page, next_cursor: String(next), has_more: next < feed.length }));
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });

    afterAll(async () => {
      await new Promise((resolve) => server.close(resolve));
    });

    beforeEach(async () => {
      seen = [];
      status = 200;
      const s = await getSiteChatSettingsRow();
      await prisma.settingsSiteChat.update({ where: { id: s.id }, data: { enabled: true, siteUrl: baseUrl } });
    });

    it('reads every page, saves the cursor, and continues from it next time', async () => {
      const s = await getSiteChatSettingsRow();
      const result = await syncSiteChatsOnce();
      expect(result).toEqual({ received: 3, skipped: 0, pages: 2 });
      expect(seen.map((r) => r.cursor)).toEqual([null, '2']);
      expect(seen[0].auth).toBe(`Bearer ${s.token}`);
      expect(await prisma.siteConversation.count()).toBe(3);
      expect(await prisma.lead.count()).toBe(1);

      const after = await getSiteChatSettingsRow();
      expect(after).toMatchObject({ cursor: '3', lastError: null, totalReceived: 3 });
      expect(after.lastSuccessAt).toBeTruthy();

      seen = [];
      await syncSiteChatsOnce();
      expect(seen.map((r) => r.cursor)).toEqual(['3']);
      expect(await prisma.siteConversation.count()).toBe(3);
    });

    it('records why a sync failed, and the admin test reports it', async () => {
      status = 401;
      await expect(syncSiteChatsOnce()).rejects.toThrow(/rejected the token/);
      const s = await getSiteChatSettingsRow();
      expect(s.lastError).toMatch(/HTTP 401/);

      const adminAuth = bearer(admin, ['admin']);
      const test = await request(app).post('/api/v1/settings/site-chat/test').set('Authorization', adminAuth);
      expect(test.body).toMatchObject({ ok: false });

      status = 200;
      const ok = await request(app).post('/api/v1/settings/site-chat/test').set('Authorization', adminAuth);
      expect(ok.body).toMatchObject({ ok: true, version: 1, conversations: 3 });
      const sync = await request(app)
        .post('/api/v1/settings/site-chat/sync')
        .set('Authorization', adminAuth)
        .send({ full: true });
      expect(sync.body).toMatchObject({ ok: true, received: 3 });
      expect(sync.body.settings.lastError).toBeNull();
    });
  });
});
