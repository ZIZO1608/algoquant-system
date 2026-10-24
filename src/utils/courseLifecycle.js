import { translate } from '../i18n/core';

/** Fixed course lifecycle stages — keep in sync with backend/src/config/lifecycle.ts */

const stage = (key, labelAr, descriptionAr, sortOrder) => ({
  key,
  labelAr,
  descriptionAr,
  sortOrder,
  /** In the current language. */
  get label() {
    return translate(labelAr);
  },
  get description() {
    return translate(descriptionAr);
  },
});

export const COURSE_LIFECYCLE_STAGES = [
  stage('before_start', 'قبل البداية', 'تحضير قبل انطلاق الدورة', 0),
  stage('start', 'البداية', 'الجلسة الأولى / انطلاق الدورة', 1),
  stage('during', 'أثناء التنفيذ', 'مهام طوال جلسات الدورة', 2),
  stage('end', 'النهاية', 'الجلسة الأخيرة (يمكن عدة مهام)', 3),
  stage('after_end', 'بعد النهاية', 'ما بعد انتهاء الدورة (شهادات، تقارير...)', 4),
];

export const COURSE_LIFECYCLE_STAGE_KEYS = COURSE_LIFECYCLE_STAGES.map((s) => s.key);

export function getLifecycleStage(key) {
  return COURSE_LIFECYCLE_STAGES.find((s) => s.key === key) ?? null;
}

export function lifecycleStageLabel(key) {
  return getLifecycleStage(key)?.label || key || '—';
}

export function defaultOffsetForStage(stageKey) {
  switch (stageKey) {
    case 'before_start':
      return { offsetType: 'days_from_start', offsetValue: 1 };
    case 'start':
      return { offsetType: 'session_number', offsetValue: 1 };
    case 'during':
      return { offsetType: 'session_number', offsetValue: 1 };
    case 'end':
      return { offsetType: 'session_number', offsetValue: -1 };
    case 'after_end':
      return { offsetType: 'days_from_start', offsetValue: 1 };
    default:
      return { offsetType: 'days_from_start', offsetValue: 0 };
  }
}

export function stageTimingHint(stageKey) {
  switch (stageKey) {
    case 'before_start':
      return translate('تُجدول تلقائياً قبل تاريخ بداية الدورة');
    case 'start':
      return translate('تُربط تلقائياً بالجلسة الأولى');
    case 'during':
      return translate('اختر رقم الجلسة التي تُستحق عندها المهمة');
    case 'end':
      return translate('تُربط تلقائياً بالجلسة الأخيرة');
    case 'after_end':
      return translate('تُجدول تلقائياً بعد آخر جلسة');
    default:
      return '';
  }
}

export function formatStageTiming(item) {
  const stageKey = item.phaseKey;
  if (stageKey === 'before_start') {
    const n = Math.abs(Number(item.offsetValue) || 1);
    return translate('قبل البداية بـ {n} يوم', { n });
  }
  if (stageKey === 'start') return translate('الجلسة الأولى');
  if (stageKey === 'during') {
    const session = Number(item.offsetValue) || 0;
    return session > 0 ? translate('الجلسة {n}', { n: session }) : translate('أثناء الجلسات (تلقائي)');
  }
  if (stageKey === 'end') return translate('الجلسة الأخيرة');
  if (stageKey === 'after_end') {
    const n = Math.max(1, Number(item.offsetValue) || 1);
    return translate('بعد النهاية بـ {n} يوم', { n });
  }
  return formatLegacyOffset(item);
}

function formatLegacyOffset(item) {
  if (item.offsetType === 'session_number') {
    if (item.offsetValue === -1) return translate('الجلسة الأخيرة');
    if (item.offsetValue === 1) return translate('الجلسة الأولى');
    return translate('الجلسة {n}', { n: item.offsetValue });
  }
  return translate('+{n} يوم من البداية', { n: item.offsetValue });
}
