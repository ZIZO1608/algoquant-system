import { Prisma, SiteConversation } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { getSocketIO } from '../lib/socket.js';
import { normalizeSearchText } from '../lib/crypto.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import { BOT_EXTRA_DATA_KEYS } from '../config/index.js';
import { createLead } from './lead.service.js';
import { createNotification } from './notification.service.js';

/**
 * Website bot conversations (algoquant.vip).
 *
 * The site keeps one `site_conversations` row per visitor session and bot. This service turns
 * that row into a SiteConversation here, links a CRM lead once the visitor leaves contact
 * details, and tells every signed-in employee about it over the `staff` socket room.
 * Rows arrive from the sync job (pull) and from the site's push webhook; both are idempotent.
 */

/** A visitor counts as "talking now" while their last message is this recent. */
export const LIVE_WINDOW_MS = 5 * 60 * 1000;
/** Older activity is history (first import, a laptop that was off): stored without toasts or notifications. */
const ANNOUNCE_WINDOW_MS = 30 * 60 * 1000;

export const SITE_CHAT_CHANNELS = ['workshop', 'proposal', 'elevator'] as const;
const ANSWER_KEYS = ['profession', 'goal', 'pain_type', 'intent', 'has_work', 'tool_level'] as const;
const MAX_MESSAGES = 300;
const MAX_MESSAGE_CHARS = 4000;
const BOT_SOURCE_CODE = 'bot';
const FALLBACK_VISITOR_NAME = 'زائر من الموقع';

// ─── Normalisation (pure) ────────────────────────────────────────────────────

const optionalText = z.union([z.string(), z.number()]).nullish();

const remoteConversationSchema = z.object({
  id: z.string().trim().min(1).max(100),
  session_id: z.string().max(200).nullish(),
  channel: z.string().max(40),
  lang: z.string().max(10).nullish(),
  page: z.string().max(500).nullish(),
  status: z.string().max(20).nullish(),
  started_at: z.string().nullish(),
  last_activity_at: z.string().nullish(),
  updated_at: z.string(),
  messages: z.array(z.unknown()).nullish(),
  visitor: z
    .object({
      name: optionalText,
      contact: optionalText,
      contact_method: optionalText,
      note: optionalText,
    })
    .partial()
    .nullish(),
  answers: z.record(z.unknown()).nullish(),
  recommendation: z.record(z.unknown()).nullish(),
  lead: z
    .object({
      table: z.string().max(60),
      id: z.string().max(100),
      fields: z.record(z.unknown()).nullish(),
    })
    .nullish(),
});

export type RemoteConversation = z.input<typeof remoteConversationSchema>;

export interface SiteChatMessage {
  role: 'user' | 'assistant';
  content: string;
  at: string | null;
}

export interface NormalizedConversation {
  externalId: string;
  sessionId: string;
  channel: string;
  lang: string;
  page: string | null;
  siteStatus: 'active' | 'completed';
  messages: SiteChatMessage[];
  visitorName: string | null;
  visitorContact: string | null;
  contactMethod: string | null;
  visitorNote: string | null;
  answers: Record<string, string> | null;
  recommendation: Record<string, string | number> | null;
  leadSnapshot: { table: string; id: string; fields: Record<string, string | number | boolean> } | null;
  startedAt: Date;
  lastActivityAt: Date;
  remoteUpdatedAt: Date;
}

function text(value: unknown, max: number): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s ? s.slice(0, max) : null;
}

function date(value: unknown): Date | null {
  if (typeof value !== 'string' || !value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * The site's bots end a finished chat with a hidden `<<SUMMARY_JSON>> {…} <<END>>` block that visitors
 * never see; the fields in it already arrive in `lead.fields`, so staff should not see it either.
 */
const SUMMARY_BLOCK = /<<SUMMARY_JSON>>[\s\S]*?(?:<<END>>|$)/g;

/**
 * Elevator answers saved before the site sent labels hold the option value. These are the labels
 * the site's questions show for each value (Lovable src/data/questions.ts).
 */
const ANSWER_VALUE_LABELS: Record<string, Record<string, string>> = {
  profession: {
    student: 'طالب',
    employee: 'موظف',
    freelance: 'فريلانسر',
    owner: 'صاحب بزنس',
    creator: 'صانع محتوى',
    other: 'غير ذلك',
  },
  pain_type: {
    repetitive: 'شغل متكرر بياكل وقتي',
    visual: 'بحتاج محتوى بصري',
    organize: 'بدي أنظّم شغلي بالـAI',
    showcase: 'عندي شغل وما عندي مكان أعرضه',
    unclear: 'مو واضح — بحتاج أفهم',
  },
  intent: { self: 'لنفسي', sell: 'أبيعها كخدمة', both: 'الاثنين' },
  has_work: { yes: 'نعم', partial: 'جزئياً', no: 'لأ' },
  tool_level: { basic: 'بسيط', medium: 'متوسط', none: 'ولا شي' },
};

function normalizeMessages(raw: unknown[] | null | undefined): SiteChatMessage[] {
  const out: SiteChatMessage[] = [];
  for (const item of raw ?? []) {
    if (!item || typeof item !== 'object') continue;
    const m = item as Record<string, unknown>;
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    const body = m.role === 'assistant' && typeof m.content === 'string'
      ? m.content.replace(SUMMARY_BLOCK, '')
      : m.content;
    const content = text(body, MAX_MESSAGE_CHARS);
    if (!content) continue;
    out.push({ role: m.role, content, at: date(m.at)?.toISOString() ?? null });
  }
  return out.slice(-MAX_MESSAGES);
}

/** Keep flat values only; transcripts and nested objects already live elsewhere. */
function flatFields(raw: Record<string, unknown> | null | undefined) {
  const out: Record<string, string | number | boolean> = {};
  if (!raw) return out;
  for (const [key, value] of Object.entries(raw)) {
    if (Object.keys(out).length >= 60) break;
    if (key === 'transcript' || key === 'messages' || value === null || value === undefined) continue;
    if (typeof value === 'boolean' || typeof value === 'number') out[key] = value;
    else if (typeof value === 'string' && value.trim()) out[key] = value.trim().slice(0, 2000);
  }
  return out;
}

function pickField(fields: Record<string, unknown> | undefined, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = text(fields?.[key], 200);
    if (value) return value;
  }
  return null;
}

/** Validate a conversation from the site and shape it for storage. Throws ValidationError. */
export function normalizeRemoteConversation(input: unknown): NormalizedConversation {
  const parsed = remoteConversationSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError('Invalid site conversation', parsed.error.flatten());
  }
  const c = parsed.data;
  const remoteUpdatedAt = date(c.updated_at);
  if (!remoteUpdatedAt) throw new ValidationError('Invalid site conversation: updated_at');

  const channelRaw = c.channel.trim().toLowerCase();
  const channel = /^[a-z_]{1,40}$/.test(channelRaw) ? channelRaw : 'other';
  const messages = normalizeMessages(c.messages);

  const leadFields = flatFields(c.lead?.fields);
  const leadSnapshot = c.lead?.table && c.lead?.id
    ? { table: c.lead.table.slice(0, 60), id: c.lead.id.slice(0, 100), fields: leadFields }
    : null;

  const answers: Record<string, string> = {};
  for (const key of ANSWER_KEYS) {
    const value = text(c.answers?.[key], 300);
    if (value) answers[key] = ANSWER_VALUE_LABELS[key]?.[value] ?? value;
  }

  const recommendation: Record<string, string | number> = {};
  for (const key of ['floor', 'secondary_floor'] as const) {
    const n = Number(c.recommendation?.[key]);
    if (c.recommendation?.[key] !== null && c.recommendation?.[key] !== undefined && Number.isFinite(n)) {
      recommendation[key] = Math.trunc(n);
    }
  }
  for (const key of ['title', 'reason'] as const) {
    const value = text(c.recommendation?.[key], 1000);
    if (value) recommendation[key] = value;
  }

  const firstAt = date(messages[0]?.at);
  const lastAt = date(messages[messages.length - 1]?.at);
  const startedAt = date(c.started_at) ?? firstAt ?? remoteUpdatedAt;
  const lastActivityAt = date(c.last_activity_at) ?? lastAt ?? remoteUpdatedAt;

  return {
    externalId: c.id,
    sessionId: text(c.session_id, 200) ?? c.id,
    channel,
    lang: c.lang === 'en' ? 'en' : 'ar',
    page: text(c.page, 500),
    siteStatus: c.status === 'completed' ? 'completed' : 'active',
    messages,
    visitorName: text(c.visitor?.name, 200) ?? pickField(leadFields, 'full_name', 'name'),
    visitorContact:
      text(c.visitor?.contact, 200) ?? pickField(leadFields, 'whatsapp', 'contact', 'phone'),
    contactMethod: text(c.visitor?.contact_method, 60) ?? pickField(leadFields, 'contact_method'),
    visitorNote: text(c.visitor?.note, 2000) ?? pickField(leadFields, 'note'),
    answers: Object.keys(answers).length ? answers : null,
    recommendation: Object.keys(recommendation).length ? recommendation : null,
    leadSnapshot,
    startedAt,
    lastActivityAt: lastActivityAt < startedAt ? startedAt : lastActivityAt,
    remoteUpdatedAt,
  };
}

/** Bot-side lead field → the extra_data key the CRM and reports already read. */
const EXTRA_DATA_ALIASES: Record<string, string> = {
  preferred_times: 'preferred_contact_times',
  contact_method: 'preferred_contact_method',
  needs_call: 'needs_a_call',
  ai_experience_level: 'ai_experience_score',
};
const EXTRA_DATA_PASSTHROUGH = [
  'recommended_workshop',
  'preferred_workshop',
  'field',
  'used_ai_tools',
  'workshop_title',
  'idea_description',
  'problem_to_solve',
  'target_audience',
  'agent_summary',
];

/** extra_data for the CRM lead: the known bot keys, a few useful extras, and where it came from. */
export function leadExtraDataFor(conv: NormalizedConversation): Record<string, unknown> {
  const fields = conv.leadSnapshot?.fields ?? {};
  const extra: Record<string, unknown> = {};
  const known = new Set<string>(BOT_EXTRA_DATA_KEYS);
  for (const [key, value] of Object.entries(fields)) {
    const canonical = EXTRA_DATA_ALIASES[key] ?? key;
    if (known.has(canonical) || EXTRA_DATA_PASSTHROUGH.includes(key)) {
      if (extra[canonical] === undefined) extra[canonical] = value;
    }
  }
  if (!extra.interest_area && conv.answers?.goal) extra.interest_area = conv.answers.goal;
  if (!extra.preferred_contact_method && conv.contactMethod) {
    extra.preferred_contact_method = conv.contactMethod;
  }
  if (conv.recommendation?.title && !extra.recommended_workshop) {
    extra.recommended_workshop = conv.recommendation.title;
  }
  if (conv.recommendation?.floor !== undefined) extra.recommended_floor = conv.recommendation.floor;
  if (conv.visitorNote) extra.visitor_note = conv.visitorNote;
  extra.site_channel = conv.channel;
  extra.site_conversation_id = conv.externalId;

  // Keep the lead row small: trim the longest free text first if needed.
  for (const key of ['agent_summary', 'idea_description', 'visitor_note']) {
    if (JSON.stringify(extra).length <= 8192) break;
    if (typeof extra[key] === 'string') extra[key] = (extra[key] as string).slice(0, 500);
  }
  return extra;
}

function requestedCourseTextFor(conv: NormalizedConversation): string | undefined {
  const fields = conv.leadSnapshot?.fields ?? {};
  const value =
    pickField(fields, 'interest_area', 'main_goal', 'workshop_title', 'recommended_workshop') ??
    (typeof conv.recommendation?.title === 'string' ? conv.recommendation.title : null) ??
    conv.answers?.goal ??
    null;
  return value ?? undefined;
}

function searchTextFor(conv: NormalizedConversation): string {
  const userWords = conv.messages
    .filter((m) => m.role === 'user')
    .map((m) => m.content)
    .join(' ')
    .slice(0, 4000);
  return normalizeSearchText(conv.visitorName, conv.visitorContact, conv.visitorNote, userWords);
}

// ─── Storage ─────────────────────────────────────────────────────────────────

/** One writer at a time: pull and push may deliver the same conversation together. */
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

export interface UpsertResult {
  id: string;
  created: boolean;
  changed: boolean;
}

export function upsertSiteConversation(input: unknown): Promise<UpsertResult> {
  const conv = normalizeRemoteConversation(input);
  return serial(() => storeConversation(conv));
}

async function storeConversation(conv: NormalizedConversation): Promise<UpsertResult> {
  const existing = await prisma.siteConversation.findUnique({ where: { externalId: conv.externalId } });
  // Pull and push can arrive out of order; never let an older copy overwrite a newer one.
  if (existing && existing.remoteUpdatedAt >= conv.remoteUpdatedAt) {
    return { id: existing.id, created: false, changed: false };
  }

  const data = {
    sessionId: conv.sessionId,
    channel: conv.channel,
    lang: conv.lang,
    page: conv.page,
    siteStatus: conv.siteStatus,
    messages: conv.messages as unknown as Prisma.InputJsonValue,
    messageCount: conv.messages.length,
    // A later copy without contact details must not erase ones the visitor already gave.
    visitorName: conv.visitorName ?? existing?.visitorName ?? null,
    visitorContact: conv.visitorContact ?? existing?.visitorContact ?? null,
    contactMethod: conv.contactMethod ?? existing?.contactMethod ?? null,
    visitorNote: conv.visitorNote ?? existing?.visitorNote ?? null,
    answers: (conv.answers ?? existing?.answers ?? Prisma.JsonNull) as Prisma.InputJsonValue,
    recommendation: (conv.recommendation ?? existing?.recommendation ?? Prisma.JsonNull) as Prisma.InputJsonValue,
    leadSnapshot: (conv.leadSnapshot ?? existing?.leadSnapshot ?? Prisma.JsonNull) as Prisma.InputJsonValue,
    startedAt: conv.startedAt,
    lastActivityAt: conv.lastActivityAt,
    remoteUpdatedAt: conv.remoteUpdatedAt,
    searchText: searchTextFor(conv),
  };

  const row = existing
    ? await prisma.siteConversation.update({ where: { id: existing.id }, data })
    : await prisma.siteConversation.create({ data: { externalId: conv.externalId, ...data } });

  const merged: NormalizedConversation = {
    ...conv,
    visitorName: row.visitorName,
    visitorContact: row.visitorContact,
    contactMethod: row.contactMethod,
    visitorNote: row.visitorNote,
  };
  const leadId = await linkLead(row, merged);
  const saved = leadId !== row.leadId
    ? await prisma.siteConversation.update({ where: { id: row.id }, data: { leadId } })
    : row;

  const announce = Date.now() - saved.lastActivityAt.getTime() < ANNOUNCE_WINDOW_MS;
  const created = !existing;
  const contactAdded = Boolean(saved.visitorContact) && !existing?.visitorContact;

  if (announce && contactAdded) {
    await notifyContactLeft(saved);
  }
  emitUpdate(saved, created && announce);

  return { id: saved.id, created, changed: true };
}

/** sourceSystem/externalLeadId match the old lead webhook, so both paths land on one lead. */
function leadKeysFor(conv: NormalizedConversation) {
  return {
    sourceSystem: `${conv.channel}_bot`,
    externalLeadId: conv.leadSnapshot?.id ?? `site-${conv.externalId}`,
  };
}

async function linkLead(row: SiteConversation, conv: NormalizedConversation): Promise<string | null> {
  const contact = conv.visitorContact;
  if (!contact) return row.leadId;

  if (row.leadId) {
    await mergeLeadExtraData(row.leadId, conv);
    return row.leadId;
  }

  const keys = leadKeysFor(conv);
  const bySource = await prisma.lead.findFirst({ where: keys, select: { id: true, deletedAt: true } });
  if (bySource) {
    // Staff deleted this lead on purpose; do not bring it back.
    if (bySource.deletedAt) return null;
    await mergeLeadExtraData(bySource.id, conv);
    return bySource.id;
  }

  const byPhone = await prisma.lead.findFirst({
    where: { phone: contact, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  if (byPhone) {
    await prisma.leadActivity.create({
      data: {
        leadId: byPhone.id,
        type: 'site_chat',
        body: `تحدث مع بوت الموقع (${conv.channel})`,
        actorType: 'bot_webhook',
      },
    });
    return byPhone.id;
  }

  const source = await prisma.leadSource.findUnique({ where: { code: BOT_SOURCE_CODE } });
  if (!source) {
    console.warn('[site-chat] lead source "bot" is missing; conversation kept without a lead');
    return null;
  }
  try {
    const lead = await createLead(
      {
        fullName: conv.visitorName ?? FALLBACK_VISITOR_NAME,
        phone: contact,
        sourceId: source.id,
        requestedCourseText: requestedCourseTextFor(conv),
        extraData: leadExtraDataFor(conv),
        ...keys,
      },
      'bot_webhook'
    );
    return lead.id;
  } catch (err) {
    // The old lead webhook may have created it a moment ago.
    if ((err as { code?: string }).code === 'P2002') {
      const again = await prisma.lead.findFirst({ where: { ...keys, deletedAt: null }, select: { id: true } });
      return again?.id ?? null;
    }
    throw err;
  }
}

/** Add keys the lead does not have yet; never overwrite what is there. */
async function mergeLeadExtraData(leadId: string, conv: NormalizedConversation) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { extraData: true } });
  if (!lead) return;
  const current = (lead.extraData ?? {}) as Record<string, unknown>;
  const incoming = leadExtraDataFor(conv);
  const additions = Object.fromEntries(
    Object.entries(incoming).filter(([key, value]) => current[key] === undefined && value !== undefined)
  );
  if (!Object.keys(additions).length) return;
  await prisma.lead.update({
    where: { id: leadId },
    data: { extraData: { ...current, ...additions } as Prisma.InputJsonValue },
  });
}

async function notifyContactLeft(row: SiteConversation) {
  const employees = await prisma.employee.findMany({
    where: { isActive: true, deletedAt: null },
    select: { id: true },
  });
  const who = row.visitorName ?? FALLBACK_VISITOR_NAME;
  for (const { id } of employees) {
    await createNotification({
      employeeId: id,
      type: 'site_chat_contact',
      title: 'زائر من الموقع ترك بيانات التواصل',
      body: `${who} — ${row.visitorContact}`,
      payload: { siteChatId: row.id, leadId: row.leadId },
    });
  }
}

function emitUpdate(row: SiteConversation, isNew: boolean) {
  try {
    getSocketIO()?.to('staff').emit('site_chat:update', { conversation: toListItem(row), isNew });
  } catch {
    // Socket may not be initialised in tests
  }
}

// ─── Reading ─────────────────────────────────────────────────────────────────

function messagesOf(row: { messages: Prisma.JsonValue }): SiteChatMessage[] {
  return Array.isArray(row.messages) ? (row.messages as unknown as SiteChatMessage[]) : [];
}

export function toListItem(row: SiteConversation) {
  const messages = messagesOf(row);
  const last = messages[messages.length - 1];
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const answers = (row.answers ?? null) as Record<string, string> | null;
  return {
    id: row.id,
    channel: row.channel,
    lang: row.lang,
    siteStatus: row.siteStatus,
    visitorName: row.visitorName,
    visitorContact: row.visitorContact,
    messageCount: row.messageCount,
    userMessageCount: messages.filter((m) => m.role === 'user').length,
    answeredCount: answers ? Object.keys(answers).length : 0,
    preview: (lastUser ?? last)?.content.slice(0, 160) ?? null,
    lastRole: last?.role ?? null,
    startedAt: row.startedAt,
    lastActivityAt: row.lastActivityAt,
    leadId: row.leadId,
  };
}

export interface SiteChatListFilters {
  filter?: string;
  channel?: string;
  q?: string;
  before?: string;
  limit?: number;
}

export async function listSiteConversations(filters: SiteChatListFilters) {
  const limit = Math.min(Math.max(Number(filters.limit) || 30, 1), 100);
  const where: Prisma.SiteConversationWhereInput = {};
  const and: Prisma.SiteConversationWhereInput[] = [];

  if (filters.filter === 'live') and.push({ lastActivityAt: { gte: new Date(Date.now() - LIVE_WINDOW_MS) } });
  if (filters.filter === 'contact') and.push({ visitorContact: { not: null } });
  if (filters.filter === 'anonymous') and.push({ visitorContact: null });
  if (filters.channel) and.push({ channel: filters.channel });
  const q = filters.q?.trim();
  if (q) and.push({ searchText: { contains: normalizeSearchText(q) } });

  if (filters.before) {
    const [iso, id] = filters.before.split('|');
    const at = date(iso);
    if (!at || !id) throw new ValidationError('Invalid cursor');
    and.push({ OR: [{ lastActivityAt: { lt: at } }, { lastActivityAt: at, id: { lt: id } }] });
  }
  if (and.length) where.AND = and;

  const rows = await prisma.siteConversation.findMany({
    where,
    orderBy: [{ lastActivityAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  });
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: page.map(toListItem),
    nextBefore: rows.length > limit && last ? `${last.lastActivityAt.toISOString()}|${last.id}` : null,
  };
}

export async function getSiteConversation(id: string) {
  const row = await prisma.siteConversation.findUnique({
    where: { id },
    include: {
      lead: {
        select: {
          id: true,
          fullName: true,
          status: true,
          deletedAt: true,
          assignedEmployee: { select: { id: true, fullName: true } },
        },
      },
    },
  });
  if (!row) throw new NotFoundError('Conversation not found');
  const { searchText: _searchText, lead, ...rest } = row;
  return {
    ...rest,
    messages: messagesOf(row),
    lead: lead && !lead.deletedAt ? { ...lead, deletedAt: undefined } : null,
    live: Date.now() - row.lastActivityAt.getTime() < LIVE_WINDOW_MS,
  };
}

export async function getSiteChatStats() {
  const now = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const [live, today, contactToday, total, settings] = await Promise.all([
    prisma.siteConversation.count({ where: { lastActivityAt: { gte: new Date(now - LIVE_WINDOW_MS) } } }),
    prisma.siteConversation.count({ where: { startedAt: { gte: startOfToday } } }),
    prisma.siteConversation.count({
      where: { startedAt: { gte: startOfToday }, visitorContact: { not: null } },
    }),
    prisma.siteConversation.count(),
    prisma.settingsSiteChat.findUnique({
      where: { id: 'singleton' },
      select: { enabled: true, lastSuccessAt: true, lastPushAt: true, lastError: true, lastErrorAt: true },
    }),
  ]);
  const lastContact = [settings?.lastSuccessAt, settings?.lastPushAt]
    .filter((d): d is Date => Boolean(d))
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const failing = Boolean(
    settings?.lastErrorAt && (!settings.lastSuccessAt || settings.lastErrorAt > settings.lastSuccessAt)
  );
  return {
    live,
    today,
    contactToday,
    total,
    liveWindowMinutes: LIVE_WINDOW_MS / 60000,
    connection: {
      enabled: Boolean(settings?.enabled),
      lastContactAt: lastContact,
      failing,
    },
  };
}
