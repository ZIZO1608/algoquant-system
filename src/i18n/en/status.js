/**
 * English for src/utils: status labels (statusMaps.js), privileges, specialties, lead sources,
 * course lifecycle (courseLifecycle.js) and the date/amount formatters (formatters.js).
 */

const days = (n) => `${n} ${Number(n) === 1 ? 'day' : 'days'}`;

export default {
  // Lead statuses
  'جديد': 'New',
  'تم التواصل': 'Contacted',
  'مهتم': 'Interested',
  'دفع|lead-status': 'Paid',
  'مسجّل': 'Enrolled',
  'مؤرشف': 'Archived',
  'خسارة': 'Lost',

  // Course statuses
  'مسودة': 'Draft',
  'مخطط|course-status': 'Planned',
  'التسجيل مفتوح': 'Enrollment open',
  'نشط': 'Active',
  'مكتمل': 'Completed',

  // Task statuses
  'قيد الانتظار': 'Pending',
  'قيد التنفيذ': 'In progress',
  'متأخر': 'Late',

  // Enrollment statuses
  'يحضر': 'Attending',
  'أكمل|enrollment-status': 'Completed',
  'حاصل على شهادة': 'Certified',
  'منسحب': 'Dropped',

  // Payment statuses
  'غير مدفوع': 'Unpaid',
  'مدفوع جزئياً': 'Partially paid',
  'مدفوع بالكامل': 'Paid in full',

  // Withdrawal statuses
  'مطلوب|withdrawal-status': 'Requested',
  'قيد المراجعة': 'Under review',
  'موافق عليه': 'Approved',
  'مدفوع': 'Paid',
  'مرفوض': 'Rejected',
  'ملغى': 'Cancelled',

  // Salary advance statuses
  'معتمدة': 'Approved',
  'مرفوضة': 'Rejected',
  'مخصومة من الراتب': 'Deducted from salary',

  // Session, attendance, certificate, evaluation and profit-share statuses
  'قادمة': 'Upcoming',
  'منتهية': 'Completed',
  'ملغاة': 'Cancelled',
  'حاضر': 'Present',
  'غائب': 'Absent',
  'بعذر': 'Excused',
  'قيد الإصدار': 'Pending issue',
  'صادرة': 'Issued',
  'ملغاة|certificate-status': 'Revoked',
  'تم الإرسال|evaluation-status': 'Submitted',
  'بانتظار الرد': 'Awaiting response',
  'منتهي': 'Expired',
  'بانتظار الاعتماد': 'Pending approval',
  'معتمد': 'Approved',

  // Privileges and specialties
  'مدير': 'Admin',
  'مبيعات': 'Sales',
  'ميديا': 'Media',
  'عمليات': 'Operations',
  'مدرّب': 'Instructor',
  'محاسبة': 'Accounting',
  'لوجستيات': 'Logistics',
  'موظف': 'Employee',

  // Lead sources (the rest are in server.js)
  'إنستغرام (رسالة)': 'Instagram (DM)',
  'إنستغرام (تعليق)': 'Instagram (comment)',
  'إعلان إنستغرام': 'Instagram ad',
  'إنستغرام': 'Instagram',
  'واتساب': 'WhatsApp',
  'يدوي': 'Manual',

  // Course lifecycle stages
  'قبل البداية': 'Before start',
  'تحضير قبل انطلاق الدورة': 'Preparation before the course starts',
  'البداية': 'Start',
  'الجلسة الأولى / انطلاق الدورة': 'First session / course kickoff',
  'أثناء التنفيذ': 'During the course',
  'مهام طوال جلسات الدورة': 'Tasks across the course sessions',
  'النهاية': 'End',
  'الجلسة الأخيرة (يمكن عدة مهام)': 'Last session (can have several tasks)',
  'بعد النهاية': 'After end',
  'ما بعد انتهاء الدورة (شهادات، تقارير...)': 'After the course ends (certificates, reports…)',
  'تُجدول تلقائياً قبل تاريخ بداية الدورة': 'Scheduled automatically before the course start date',
  'تُربط تلقائياً بالجلسة الأولى': 'Linked automatically to the first session',
  'اختر رقم الجلسة التي تُستحق عندها المهمة': 'Choose the session number the task is due at',
  'تُربط تلقائياً بالجلسة الأخيرة': 'Linked automatically to the last session',
  'تُجدول تلقائياً بعد آخر جلسة': 'Scheduled automatically after the last session',
  'قبل البداية بـ {n} يوم': ({ n }) => `${days(n)} before start`,
  'الجلسة الأولى': 'First session',
  'الجلسة {n}': 'Session {n}',
  'أثناء الجلسات (تلقائي)': 'During sessions (automatic)',
  'الجلسة الأخيرة': 'Last session',
  'بعد النهاية بـ {n} يوم': ({ n }) => `${days(n)} after end`,
  '+{n} يوم من البداية': ({ n }) => `+${days(n)} from start`,

  // Formatters
  'الآن': 'just now',
  'اليوم': 'Today',
  'غداً': 'Tomorrow',
  'أمس': 'Yesterday',
  'بعد يومين': 'In 2 days',
  'متأخر يومين': '2 days overdue',
  'متأخر {n} أيام': ({ n }) => `${days(n)} overdue`,
  'متأخر {n} يوماً': ({ n }) => `${days(n)} overdue`,
  'بعد {n} أيام': ({ n }) => `In ${days(n)}`,
  'ل.س': 'SYP',
  '، ': ', ',
  '؟': '?',

  // Student status
  'نشط|student-status': 'Active',
  'مجمّد': 'Frozen',
  'خرّيج': 'Graduate',
  'منسحب|student-status': 'Withdrawn',
  'محظور': 'Blocked',
  // Refund status
  'بانتظار المراجعة': 'Awaiting review',
  'تم الصرف': 'Paid out',
  // A voided receipt
  'ملغى|receipt': 'Void',
};
