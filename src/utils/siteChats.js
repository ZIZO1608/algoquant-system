import { translate } from '../i18n/core';

/** Website bot conversations (algoquant.vip). Labels translate when read, like the other label helpers. */

/** Matches LIVE_WINDOW_MS in backend/src/services/site-chat.service.ts; the stats endpoint reports it too. */
export const DEFAULT_LIVE_MINUTES = 5;

const CHANNEL_LABELS = {
  workshop: 'مستشار الورشات',
  proposal: 'اقتراح دورة',
  elevator: 'المصعد',
};

export function channelLabel(channel) {
  return translate(CHANNEL_LABELS[channel] || 'بوت الموقع');
}

export function channelOptions() {
  return Object.keys(CHANNEL_LABELS).map((value) => ({ value, label: channelLabel(value) }));
}

/** The elevator's six qualification questions, in the order the site asks them. */
const ANSWER_LABELS = {
  profession: 'العمل الحالي',
  goal: 'النتيجة المطلوبة',
  pain_type: 'نوع المشكلة',
  intent: 'لنفسه أم لتقديمها كخدمة',
  has_work: 'لديه أعمال جاهزة',
  tool_level: 'مستواه في الأدوات',
};

export function answerRows(answers) {
  if (!answers) return [];
  return Object.keys(ANSWER_LABELS)
    .filter((key) => answers[key])
    .map((key) => ({ key, label: translate(ANSWER_LABELS[key]), value: answers[key] }));
}

/** Lead fields worth showing staff, in reading order. Everything else stays in the CRM record. */
const LEAD_FIELD_LABELS = {
  interest_area: 'مجال الاهتمام',
  main_goal: 'الهدف الرئيسي',
  recommended_workshop: 'الورشة المقترحة',
  recommendation_reason: 'سبب الاقتراح',
  workshop_title: 'عنوان الدورة المقترحة',
  idea_description: 'وصف الفكرة',
  target_audience: 'الجمهور المستهدف',
  problem_to_solve: 'المشكلة التي تحلها',
  city: 'المدينة',
  field: 'المجال',
  occupation_type: 'طبيعة العمل',
  lead_classification: 'التصنيف',
  seriousness_level: 'مستوى الجدية',
  preferred_times: 'أوقات التواصل المفضلة',
};

export function leadFieldRows(snapshot) {
  const fields = snapshot?.fields;
  if (!fields) return [];
  return Object.keys(LEAD_FIELD_LABELS)
    .filter((key) => fields[key] !== undefined && fields[key] !== null && String(fields[key]).trim() !== '')
    .map((key) => ({ key, label: translate(LEAD_FIELD_LABELS[key]), value: String(fields[key]) }));
}

export function isLive(lastActivityAt, liveMinutes = DEFAULT_LIVE_MINUTES, now = Date.now()) {
  if (!lastActivityAt) return false;
  return now - new Date(lastActivityAt).getTime() < liveMinutes * 60_000;
}

export function visitorName(item) {
  return item?.visitorName || translate('زائر مجهول');
}

/** A wa.me link when the contact looks like a phone number; handles like @name get none. */
export function whatsappLink(contact) {
  const digits = String(contact || '').replace(/[^\d]/g, '');
  if (digits.length < 8 || /[a-z@]/i.test(String(contact))) return null;
  const international = digits.startsWith('00') ? digits.slice(2) : digits.startsWith('0') ? `963${digits.slice(1)}` : digits;
  return `https://wa.me/${international}`;
}
