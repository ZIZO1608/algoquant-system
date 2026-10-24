import { getLang, getLocale, translate, translateData } from '../i18n/core';
import { STATUS_MAPS } from './statusMaps';

/* ------------------------------------------------------------------ */
/* Status labels (derived from the single source of truth).            */
/* Labels translate when read, so read them while rendering.           */
/* ------------------------------------------------------------------ */

export const LEAD_STATUSES = Object.fromEntries(
  Object.entries(STATUS_MAPS.lead).map(([id, info]) => [
    id,
    {
      id,
      get label() {
        return info.label;
      },
      tone: info.tone,
      color: `var(--lead-${id})`,
    },
  ])
);

function liveStatusLabels(kind) {
  const labels = {};
  for (const [value, info] of Object.entries(STATUS_MAPS[kind])) {
    Object.defineProperty(labels, value, { enumerable: true, get: () => info.label });
  }
  return labels;
}

export const COURSE_STATUS_LABELS = liveStatusLabels('course');
export const TASK_STATUS_LABELS = liveStatusLabels('task');
export const ENROLLMENT_STATUS_LABELS = liveStatusLabels('enrollment');
export const PAYMENT_STATUS_LABELS = liveStatusLabels('payment');
export const WITHDRAWAL_STATUS_LABELS = liveStatusLabels('withdrawal');

const specialty = (label, className) => ({
  get label() {
    return translate(label);
  },
  className,
});

export const SPECIALTY_LABELS = {
  sales: specialty('مبيعات', 'dept-sales'),
  media: specialty('ميديا', 'dept-media'),
  operation: specialty('عمليات', 'dept-ops'),
  logistics: specialty('لوجستيات', 'dept-logistics'),
  accountant: specialty('محاسبة', 'dept-accountant'),
};

const SOURCE_LABELS = {
  instagram_dm: 'إنستغرام (رسالة)',
  instagram_comment: 'إنستغرام (تعليق)',
  instagram_ad: 'إعلان إنستغرام',
  instagram: 'إنستغرام',
  whatsapp: 'واتساب',
  bot: 'بوت التأهيل',
  manual: 'يدوي',
  social_media: 'سوشال ميديا',
  sales: 'مبيعات',
  reference: 'إحالة',
};

export function getSourceLabel(source) {
  if (!source) return '—';
  if (typeof source === 'object') {
    // Arabic keeps the label an admin may have edited in Settings.
    if (getLang() === 'ar') return source.labelAr || source.code;
    const known = SOURCE_LABELS[source.code];
    return known ? translate(known) : translateData(source.labelAr) || source.code;
  }
  return SOURCE_LABELS[source] ? translate(SOURCE_LABELS[source]) : source;
}

/** A course track's name in the current language (tracks store nameAr and an optional nameEn). */
export function trackName(track) {
  if (!track) return '';
  if (getLang() === 'en') return track.nameEn || translateData(track.nameAr) || '';
  return track.nameAr || track.nameEn || '';
}

/* ------------------------------------------------------------------ */
/* Dates — Gregorian, Latin digits, month names in the UI language     */
/* ------------------------------------------------------------------ */

const DATE_OPTIONS = {
  date: { year: 'numeric', month: 'short', day: 'numeric' },
  dateTime: { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' },
  time: { hour: '2-digit', minute: '2-digit' },
  weekday: { weekday: 'long', day: 'numeric', month: 'long' },
};
const intlCache = new Map();

function dateFormat(kind) {
  const locale = getLocale();
  const key = `${locale}|${kind}`;
  if (!intlCache.has(key)) {
    const options = DATE_OPTIONS[kind];
    // English keeps the 12-hour clock the Arabic UI uses.
    const withClock = options.hour && getLang() === 'en' ? { ...options, hour12: true } : options;
    intlCache.set(key, new Intl.DateTimeFormat(locale, withClock));
  }
  return intlCache.get(key);
}

function relativeFormat() {
  const locale = getLocale();
  const key = `${locale}|relative`;
  if (!intlCache.has(key)) {
    const supported = typeof Intl !== 'undefined' && Intl.RelativeTimeFormat;
    intlCache.set(key, supported ? new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }) : null);
  }
  return intlCache.get(key);
}

function toDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 12 أيلول 2026 · 12 Sept 2026 */
export function formatDate(value) {
  const d = toDate(value);
  return d ? dateFormat('date').format(d) : '—';
}

/** 12 أيلول 2026، 02:30 م · 12 Sept 2026, 02:30 pm */
export function formatDateTime(value) {
  const d = toDate(value);
  return d ? dateFormat('dateTime').format(d) : '—';
}

export function formatTime(value) {
  const d = toDate(value);
  return d ? dateFormat('time').format(d) : '—';
}

/** الخميس، 12 أيلول · Thursday 12 September */
export function formatWeekday(value) {
  const d = toDate(value);
  return d ? dateFormat('weekday').format(d) : '—';
}

/** "قبل 3 ساعات", "أمس" · "3 hours ago", "yesterday" — Latin digits. */
export function formatRelativeTime(value) {
  const d = toDate(value);
  if (!d) return '—';
  const diffSec = Math.round((d.getTime() - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 45) return translate('الآن');
  const units = [
    ['minute', 60],
    ['hour', 3600],
    ['day', 86400],
    ['week', 604800],
    ['month', 2592000],
    ['year', 31536000],
  ];
  let unit = 'minute';
  let divisor = 60;
  for (const [u, secs] of units) {
    if (abs >= secs) {
      unit = u;
      divisor = secs;
    }
  }
  const val = Math.round(diffSec / divisor);
  const rtf = relativeFormat();
  if (rtf) return rtf.format(val, unit);
  return formatDate(d);
}

/** Days until a date, relative to local midnight (negative = overdue). */
export function daysUntil(value) {
  const d = toDate(value);
  if (!d) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

/** "اليوم" | "غداً" | "أمس" | "بعد يومين" | "متأخر يومين" | "متأخر 3 أيام" | "بعد 5 أيام" | date */
export function formatDueLabel(value) {
  const days = daysUntil(value);
  if (days === null) return null;
  if (days === 0) return translate('اليوم');
  if (days === 1) return translate('غداً');
  if (days === -1) return translate('أمس');
  // Arabic uses the dual for two: يومين, not "2 أيام"
  if (days === 2) return translate('بعد يومين');
  if (days === -2) return translate('متأخر يومين');
  if (days < 0) {
    const n = Math.abs(days);
    return translate(n <= 10 ? 'متأخر {n} أيام' : 'متأخر {n} يوماً', { n });
  }
  if (days <= 7) return translate('بعد {n} أيام', { n: days });
  return formatDate(value);
}

/* ------------------------------------------------------------------ */
/* Money                                                              */
/* ------------------------------------------------------------------ */

let currencyLabel = 'ل.س';

/** Called once settings load; every formatMinor() call picks it up. */
export function setCurrencyLabel(label) {
  if (label && typeof label === 'string') currencyLabel = label;
}

/** The currency label from settings; the default "ل.س" reads "SYP" in English. */
export function getCurrencyLabel() {
  return translateData(currencyLabel);
}

/** The currency label exactly as saved in settings (printed documents translate it themselves). */
export function getRawCurrencyLabel() {
  return currencyLabel;
}

/** Format integers with Western thousand commas: 1000 → "1,000" */
export function formatAmount(amount) {
  const n = Number(amount ?? 0);
  if (!Number.isFinite(n)) return '0';
  return Math.round(n).toLocaleString('en-US');
}

/** Format money for display: 100000 → "100,000 ل.س" */
export function formatMinor(amount, label = getCurrencyLabel()) {
  return `${formatAmount(amount)} ${label}`;
}

/** Live-format an amount input string with commas while typing. */
export function formatAmountInput(value) {
  if (value === null || value === undefined || value === '') return '';
  const digits = String(value).replace(/[^\d]/g, '');
  if (!digits) return '';
  return formatAmount(digits);
}

/** Parse a formatted amount input ("1,000" / "1000") into an integer. */
export function parseMinorInput(value) {
  if (value === null || value === undefined || value === '') return 0;
  const digits = String(value).replace(/[^\d]/g, '');
  return Math.round(Number(digits) || 0);
}

/* ------------------------------------------------------------------ */
/* Derived helpers                                                     */
/* ------------------------------------------------------------------ */

export function calcTaskProgress(tasks) {
  if (!tasks?.length) return 0;
  const done = tasks.filter((t) => t.status === 'done').length;
  return Math.round((done / tasks.length) * 100);
}

export function studentBalance(enrollments) {
  if (!enrollments?.length) return 0;
  return enrollments.reduce((sum, e) => {
    const total = Number(e.totalPriceMinor ?? 0);
    const paid = Number(e.amountPaidMinor ?? 0);
    return sum + Math.max(0, total - paid);
  }, 0);
}

export function studentCourseNames(enrollments) {
  return (enrollments ?? []).map((e) => e.course?.name).filter(Boolean).join(translate('، ')) || '—';
}

export function initials(name) {
  if (!name) return translate('؟');
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2);
  return `${parts[0][0]}${parts[parts.length - 1][0]}`;
}

export function pluralAr(n, one, two, many) {
  if (n === 1) return one;
  if (n === 2) return two;
  return many;
}
