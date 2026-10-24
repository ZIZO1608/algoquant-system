/** Fixed course lifecycle stages for task-path templates. */

export const COURSE_LIFECYCLE_STAGES = [
  {
    key: 'before_start',
    labelAr: 'قبل البداية',
    descriptionAr: 'تحضير قبل انطلاق الدورة',
    sortOrder: 0,
  },
  {
    key: 'start',
    labelAr: 'البداية',
    descriptionAr: 'الجلسة الأولى / انطلاق الدورة',
    sortOrder: 1,
  },
  {
    key: 'during',
    labelAr: 'أثناء التنفيذ',
    descriptionAr: 'مهام طوال جلسات الدورة',
    sortOrder: 2,
  },
  {
    key: 'end',
    labelAr: 'النهاية',
    descriptionAr: 'الجلسة الأخيرة (يمكن عدة مهام)',
    sortOrder: 3,
  },
  {
    key: 'after_end',
    labelAr: 'بعد النهاية',
    descriptionAr: 'ما بعد انتهاء الدورة (شهادات، تقارير...)',
    sortOrder: 4,
  },
] as const;

export type CourseLifecycleStageKey = (typeof COURSE_LIFECYCLE_STAGES)[number]['key'];

export const COURSE_LIFECYCLE_STAGE_KEYS = COURSE_LIFECYCLE_STAGES.map((s) => s.key);

export function isLifecycleStageKey(key: string): key is CourseLifecycleStageKey {
  return (COURSE_LIFECYCLE_STAGE_KEYS as readonly string[]).includes(key);
}

export function getLifecycleStage(key: string) {
  return COURSE_LIFECYCLE_STAGES.find((s) => s.key === key) ?? null;
}

/** Default offset fields stored on template items for a given stage. */
export function defaultOffsetForStage(stageKey: string): {
  offsetType: 'days_from_start' | 'session_number';
  offsetValue: number;
} {
  switch (stageKey) {
    case 'before_start':
      return { offsetType: 'days_from_start', offsetValue: 1 }; // days before start
    case 'start':
      return { offsetType: 'session_number', offsetValue: 1 };
    case 'during':
      return { offsetType: 'session_number', offsetValue: 1 }; // specific session number
    case 'end':
      return { offsetType: 'session_number', offsetValue: -1 };
    case 'after_end':
      return { offsetType: 'days_from_start', offsetValue: 1 }; // days after last session
    default:
      return { offsetType: 'days_from_start', offsetValue: 0 };
  }
}

export function stageTimingHint(stageKey: string): string {
  switch (stageKey) {
    case 'before_start':
      return 'تُجدول تلقائياً قبل تاريخ بداية الدورة';
    case 'start':
      return 'تُربط تلقائياً بالجلسة الأولى';
    case 'during':
      return 'اختر رقم الجلسة التي تُستحق عندها المهمة';
    case 'end':
      return 'تُربط تلقائياً بالجلسة الأخيرة';
    case 'after_end':
      return 'تُجدول تلقائياً بعد آخر جلسة';
    default:
      return '';
  }
}

/** Status order for automatic lifecycle progression. */
export const COURSE_STATUS_ORDER = [
  'draft',
  'planned',
  'enrollment_open',
  'active',
  'completed',
] as const;
