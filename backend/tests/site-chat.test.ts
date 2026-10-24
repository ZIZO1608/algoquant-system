import { describe, it, expect } from 'vitest';
import {
  leadExtraDataFor,
  normalizeRemoteConversation,
} from '../src/services/site-chat.service.js';
import { normalizeSiteUrl } from '../src/services/site-chat-sync.service.js';

const base = {
  id: '6f1c0000-0000-4000-8000-000000000001',
  session_id: 'sess-1',
  channel: 'workshop',
  updated_at: '2026-09-27T10:05:00.000Z',
};

describe('normalizeRemoteConversation', () => {
  it('keeps user/assistant turns and drops anything else', () => {
    const conv = normalizeRemoteConversation({
      ...base,
      messages: [
        { role: 'assistant', content: 'أهلاً! شو اسمك؟', at: '2026-09-27T10:00:00Z' },
        { role: 'user', content: '  رامي  ', at: '2026-09-27T10:01:00Z' },
        { role: 'system', content: 'hidden' },
        { role: 'user', content: '   ' },
        'garbage',
      ],
    });
    expect(conv.messages).toEqual([
      { role: 'assistant', content: 'أهلاً! شو اسمك؟', at: '2026-09-27T10:00:00.000Z' },
      { role: 'user', content: 'رامي', at: '2026-09-27T10:01:00.000Z' },
    ]);
    // No explicit timestamps: the first and last message stand in for them.
    expect(conv.startedAt.toISOString()).toBe('2026-09-27T10:00:00.000Z');
    expect(conv.lastActivityAt.toISOString()).toBe('2026-09-27T10:01:00.000Z');
  });

  it('fills visitor details from the saved lead row when the visitor block is empty', () => {
    const conv = normalizeRemoteConversation({
      ...base,
      lead: {
        table: 'workshop_leads',
        id: 'lead-9',
        fields: { full_name: 'Rami K', whatsapp: '+963 944 000 111', transcript: [{ a: 1 }], city: 'Damascus' },
      },
    });
    expect(conv.visitorName).toBe('Rami K');
    expect(conv.visitorContact).toBe('+963 944 000 111');
    expect(conv.leadSnapshot?.fields).not.toHaveProperty('transcript');
    expect(conv.leadSnapshot?.fields.city).toBe('Damascus');
  });

  it('normalises channel, language, status and elevator answers', () => {
    const conv = normalizeRemoteConversation({
      ...base,
      channel: 'Elevator',
      lang: 'fr',
      status: 'completed',
      answers: { profession: 'مصمم', goal: 'أتعلم الأتمتة', unknown_key: 'x', intent: null },
      recommendation: { floor: '3', secondary_floor: null, title: 'الطابق 3' },
    });
    expect(conv.channel).toBe('elevator');
    expect(conv.lang).toBe('ar');
    expect(conv.siteStatus).toBe('completed');
    expect(conv.answers).toEqual({ profession: 'مصمم', goal: 'أتعلم الأتمتة' });
    expect(conv.recommendation).toEqual({ floor: 3, title: 'الطابق 3' });
  });

  it("hides the bot's summary block and drops a message that was only that block", () => {
    const conv = normalizeRemoteConversation({
      ...base,
      messages: [
        { role: 'user', content: 'رقمي 0944' },
        {
          role: 'assistant',
          content: 'تمام، رح نتواصل معك 🙌\n<<SUMMARY_JSON>>\n{ "full_name": "رامي", "needs_call": true }\n<<END>>',
        },
        { role: 'assistant', content: '<<SUMMARY_JSON>>{ "full_name": "x" }' },
        { role: 'user', content: 'شو يعني <<SUMMARY_JSON>>؟' },
      ],
    });
    expect(conv.messages.map((m) => m.content)).toEqual([
      'رقمي 0944',
      'تمام، رح نتواصل معك 🙌',
      'شو يعني <<SUMMARY_JSON>>؟', // a visitor's own words are never edited
    ]);
  });

  it('shows elevator answers saved as option values with the label the visitor picked', () => {
    const conv = normalizeRemoteConversation({
      ...base,
      channel: 'elevator',
      answers: { profession: 'owner', goal: 'دخل زيادة', pain_type: 'repetitive', intent: 'sell', has_work: 'yes', tool_level: 'basic' },
    });
    expect(conv.answers).toEqual({
      profession: 'صاحب بزنس',
      goal: 'دخل زيادة',
      pain_type: 'شغل متكرر بياكل وقتي',
      intent: 'أبيعها كخدمة',
      has_work: 'نعم',
      tool_level: 'بسيط',
    });
  });

  it('rejects a row without an id or a valid updated_at', () => {
    expect(() => normalizeRemoteConversation({ ...base, id: '' })).toThrow();
    expect(() => normalizeRemoteConversation({ ...base, updated_at: 'yesterday' })).toThrow();
    expect(() => normalizeRemoteConversation(null)).toThrow();
  });

  it('caps very long conversations to the latest messages', () => {
    const messages = Array.from({ length: 350 }, (_, i) => ({ role: 'user', content: `m${i}` }));
    const conv = normalizeRemoteConversation({ ...base, messages });
    expect(conv.messages).toHaveLength(300);
    expect(conv.messages[0].content).toBe('m50');
  });
});

describe('leadExtraDataFor', () => {
  it('maps bot field names onto the keys the CRM and reports read', () => {
    const conv = normalizeRemoteConversation({
      ...base,
      lead: {
        table: 'workshop_leads',
        id: 'lead-9',
        fields: {
          interest_area: 'أتمتة',
          preferred_times: 'مساءً',
          needs_call: true,
          ai_experience_level: 3,
          recommended_workshop: 'الطابق 2',
          whatsapp: '0944',
          webhook_status: 'failed',
        },
      },
    });
    const extra = leadExtraDataFor(conv);
    expect(extra).toMatchObject({
      interest_area: 'أتمتة',
      preferred_contact_times: 'مساءً',
      needs_a_call: true,
      ai_experience_score: 3,
      recommended_workshop: 'الطابق 2',
      site_channel: 'workshop',
      site_conversation_id: base.id,
    });
    expect(extra).not.toHaveProperty('webhook_status');
    expect(extra).not.toHaveProperty('whatsapp');
  });

  it('uses the elevator goal when there is no lead row', () => {
    const conv = normalizeRemoteConversation({
      ...base,
      channel: 'elevator',
      answers: { goal: 'أبيع خدمات' },
      visitor: { contact: '@rami', contact_method: 'تيليغرام' },
    });
    expect(leadExtraDataFor(conv)).toMatchObject({
      interest_area: 'أبيع خدمات',
      preferred_contact_method: 'تيليغرام',
    });
  });
});

describe('normalizeSiteUrl', () => {
  it('accepts a bare domain and keeps only the origin', () => {
    expect(normalizeSiteUrl('algoquant.vip')).toBe('https://algoquant.vip');
    expect(normalizeSiteUrl('https://algoquant.vip/elevator?x=1')).toBe('https://algoquant.vip');
  });

  it('rejects something that is not a web address', () => {
    expect(() => normalizeSiteUrl('ftp://algoquant.vip')).toThrow();
    expect(() => normalizeSiteUrl('')).toThrow();
  });
});
