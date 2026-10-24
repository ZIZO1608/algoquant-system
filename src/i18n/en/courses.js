/**
 * English for src/pages/CoursesList.jsx, src/components/PhaseStepper.jsx and
 * src/components/ProgressSummary.jsx. Strings shared with the tasks board live in tasks.js.
 */

const count = (n, one, many) => `${n} ${Number(n) === 1 ? one : many}`;

export default {
  // Header, counts and filters
  'دورة واحدة': '1 course',
  'دورتان': '2 courses',
  '{n} دورات': ({ n }) => count(n, 'course', 'courses'),
  '{n} دورة': ({ n }) => count(n, 'course', 'courses'),
  '{count} نشطة': '{count} active',
  'دورة جديدة': 'New course',
  'طريقة العرض': 'View',
  'بطاقات': 'Cards',
  'جدول': 'Table',
  'ابحث باسم الدورة أو المدرّب…': 'Search by course or instructor…',
  'بحث في الدورات': 'Search courses',
  'فلترة حسب الحالة': 'Filter by status',
  'الكل': 'All',

  // Cards and table
  'نسبة إنجاز المهام': 'Task completion',
  'فتح الدورة {name}': 'Open course {name}',
  '{enrolled}/{capacity} طالب': ({ enrolled, capacity }) =>
    `${enrolled}/${capacity} ${Number(capacity) === 1 ? 'student' : 'students'}`,
  'جلسة واحدة': '1 session',
  'جلستان': '2 sessions',
  '{n} جلسات': ({ n }) => count(n, 'session', 'sessions'),
  '{n} جلسة': ({ n }) => count(n, 'session', 'sessions'),
  'المسار': 'Track',
  'السعر': 'Price',
  'التقدم': 'Progress',

  // Empty states
  'لا توجد دورات بعد': 'No courses yet',
  'أنشئ أول دورة لبدء التسجيل وتوزيع المهام على الفريق.':
    'Create your first course to open enrollment and assign tasks to the team.',
  'ستظهر الدورات هنا عند إنشائها.': 'Courses will appear here once they’re created.',
  'لا توجد دورات مطابقة': 'No matching courses',
  'جرّب كلمة بحث أخرى أو غيّر فلتر الحالة.': 'Try a different search or change the status filter.',
  'مسح الفلاتر': 'Clear filters',
  'لا توجد دورات مطابقة للفلاتر الحالية': 'No courses match the current filters',

  // New course modal
  'تم إنشاء الدورة': 'Course created',
  'أدخل بيانات الدورة الأساسية، ويمكنك تعديل التفاصيل لاحقاً من صفحة الدورة.':
    'Enter the course basics. You can edit the details later on the course page.',
  'الأساسيات': 'Basics',
  'اسم الدورة': 'Course name',
  'مثال: أساسيات التداول — الدفعة 3': 'e.g. Trading basics — Cohort 3',
  '— اختر —': '— Select —',
  'قالب مسار المهام': 'Task path template',
  'بدون قالب': 'No template',
  'الجدولة': 'Schedule',
  'تاريخ البداية': 'Start date',
  'عدد الجلسات': 'Sessions',
  'ساعات الدورة التقريبية': 'Estimated course hours',
  'مدة كل جلسة ≈ {hours} ساعة': ({ hours }) => `Each session ≈ ${count(hours, 'hour', 'hours')}`,
  'السعر والسعة': 'Price & capacity',
  'السعر ({currency})': 'Price ({currency})',
  'السعة': 'Capacity',
  'المدرّب الرئيسي': 'Primary instructor',
  '— اختياري —': '— Optional —',
  'طريقة أجر المدرّب': 'Instructor pay',
  'نسبة من سعر الدورة': 'Share of course price',
  'أجر بالساعة': 'Hourly rate',
  'النسبة %': 'Share %',
  'أجر الساعة ({currency})': 'Hourly rate ({currency})',
  'إنشاء الدورة': 'Create course',

  // PhaseStepper
  'مراحل دورة الحياة': 'Lifecycle stages',
  'لا مهام': 'No tasks',

  // ProgressSummary
  'ملخص التقدم': 'Progress summary',
  'اكتمل {percent}% من المهام': '{percent}% of tasks completed',
  '{done}/{total} مهمة': ({ done, total }) => `${done}/${count(total, 'task', 'tasks')}`,
  'لا توجد مهام بعد': 'No tasks yet',
};
