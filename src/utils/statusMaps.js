import { translate, translateIn, translatedMap } from '../i18n/core';

/**
 * Every status value the backend emits, with its label and a tone. Labels are Arabic source
 * text translated when read ("label|context" marks a word with more than one English meaning),
 * so read them while rendering rather than copying them into module-level constants.
 * Tones map to .badge.tone-* in tokens.css: neutral | brand | success | warning | danger | muted
 */

const m = (label, tone) => ({
  get label() {
    return translate(label);
  },
  /** The Arabic source key, for translating into a language other than the UI's. */
  source: label,
  tone,
});

export const STATUS_MAPS = {
  lead: {
    new: m('جديد', 'neutral'),
    contacted: m('تم التواصل', 'brand'),
    interested: m('مهتم', 'brand'),
    paid: m('دفع|lead-status', 'warning'),
    enrolled: m('مسجّل', 'success'),
    archived: m('مؤرشف', 'muted'),
    lost: m('خسارة', 'danger'),
  },
  course: {
    draft: m('مسودة', 'muted'),
    planned: m('مخطط|course-status', 'neutral'),
    enrollment_open: m('التسجيل مفتوح', 'brand'),
    active: m('نشط', 'success'),
    completed: m('مكتمل', 'neutral'),
    archived: m('مؤرشف', 'muted'),
  },
  task: {
    pending: m('قيد الانتظار', 'neutral'),
    in_progress: m('قيد التنفيذ', 'brand'),
    done: m('مكتمل', 'success'),
    late: m('متأخر', 'danger'),
  },
  enrollment: {
    enrolled: m('مسجّل', 'brand'),
    attending: m('يحضر', 'brand'),
    completed: m('أكمل|enrollment-status', 'success'),
    certified: m('حاصل على شهادة', 'success'),
    dropped: m('منسحب', 'danger'),
  },
  student: {
    active: m('نشط|student-status', 'success'),
    frozen: m('مجمّد', 'warning'),
    graduated: m('خرّيج', 'brand'),
    withdrawn: m('منسحب|student-status', 'muted'),
    blocked: m('محظور', 'danger'),
  },
  refund: {
    initiated: m('بانتظار المراجعة', 'neutral'),
    under_review: m('قيد المراجعة', 'warning'),
    approved: m('موافق عليه', 'brand'),
    processed: m('تم الصرف', 'success'),
    rejected: m('مرفوض', 'danger'),
  },
  payment: {
    unpaid: m('غير مدفوع', 'danger'),
    partially_paid: m('مدفوع جزئياً', 'warning'),
    paid_in_full: m('مدفوع بالكامل', 'success'),
  },
  withdrawal: {
    requested: m('مطلوب|withdrawal-status', 'neutral'),
    under_review: m('قيد المراجعة', 'warning'),
    approved: m('موافق عليه', 'brand'),
    paid: m('مدفوع', 'success'),
    rejected: m('مرفوض', 'danger'),
    cancelled: m('ملغى', 'muted'),
  },
  advance: {
    requested: m('قيد المراجعة', 'warning'),
    approved: m('معتمدة', 'success'),
    rejected: m('مرفوضة', 'danger'),
    deducted: m('مخصومة من الراتب', 'neutral'),
  },
  session: {
    scheduled: m('قادمة', 'neutral'),
    completed: m('منتهية', 'success'),
    cancelled: m('ملغاة', 'danger'),
  },
  attendance: {
    present: m('حاضر', 'success'),
    absent: m('غائب', 'danger'),
    late: m('متأخر', 'warning'),
    excused: m('بعذر', 'neutral'),
  },
  certificate: {
    pending: m('قيد الإصدار', 'warning'),
    issued: m('صادرة', 'success'),
    revoked: m('ملغاة|certificate-status', 'danger'),
  },
  evalRow: {
    submitted: m('تم الإرسال|evaluation-status', 'success'),
    pending: m('بانتظار الرد', 'warning'),
    expired: m('منتهي', 'muted'),
  },
  profitShare: {
    pending: m('بانتظار الاعتماد', 'warning'),
    approved: m('معتمد', 'success'),
    rejected: m('مرفوض', 'danger'),
  },
};

export function statusInfo(kind, value) {
  const info = STATUS_MAPS[kind]?.[value];
  return info ? { label: info.label, tone: info.tone } : { label: value || '—', tone: 'neutral' };
}

export function statusLabel(kind, value) {
  return statusInfo(kind, value).label;
}

/** A status label in a given language (printed documents). */
export function statusLabelIn(lang, kind, value) {
  const info = STATUS_MAPS[kind]?.[value];
  return info ? translateIn(lang, info.source) : value || '—';
}

/** { value: label } for one status kind, in the current language. */
export function labelsOf(kind) {
  return Object.fromEntries(Object.entries(STATUS_MAPS[kind] || {}).map(([k, v]) => [k, v.label]));
}

/** Privilege codes → labels (the backend has no roles, only these six codes). */
export const PRIVILEGE_LABELS = translatedMap({
  admin: 'مدير',
  sales: 'مبيعات',
  media: 'ميديا',
  operation: 'عمليات',
  instructor: 'مدرّب',
  accountant: 'محاسبة',
});

export function privilegeLabel(code) {
  return PRIVILEGE_LABELS[code] || code;
}
