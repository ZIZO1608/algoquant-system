/** English for src/pages/Dashboard.jsx. */
export default {
  'تعذّر تحميل لوحة التحكم': "Couldn't load the dashboard",
  'تعذّر تحميل المصروفات': "Couldn't load expenses",
  'أهلاً {name}': 'Hi, {name}',

  // KPI cards
  'عملاء جدد خلال 7 أيام': 'New leads (7 days)',
  'دورات نشطة': 'Active courses',
  'مهام متأخرة': 'Overdue tasks',
  'إيرادات الشهر': 'Revenue this month',
  'طلبات سحب معلّقة': 'Pending withdrawals',

  // Sales
  'المبيعات': 'Sales',
  'متابعات مستحقة اليوم': 'Follow-ups due today',
  'إجمالي العملاء المحتملين': 'Total leads',
  'لا توجد بيانات في خط المبيعات بعد': 'No pipeline data yet',

  // Operations
  'العمليات': 'Operations',
  'عرض الدورات': 'View courses',
  'جلسات اليوم': 'Sessions today',
  'دورات مفتوحة للتسجيل': 'Courses open for enrollment',
  'مهام عمليات ولوجستيات مفتوحة': 'Open operations & logistics tasks',

  // Media
  'الميديا': 'Media',
  'مهام قيد التنفيذ': 'Tasks in progress',
  'مهام ميديا متأخرة': 'Overdue media tasks',

  // Active courses
  'الدورات النشطة': 'Active courses',
  'كل الدورات': 'All courses',
  'لا توجد دورات نشطة حالياً': 'No active courses right now',
  'تبدأ الدورة تلقائياً عند تاريخ بدايتها.': 'Courses start automatically on their start date.',
  'نسبة المهام المنجزة': 'Tasks completed',
  '{enrolled}/{capacity} طالب': ({ enrolled, capacity }) =>
    `${enrolled}/${capacity} ${Number(capacity) === 1 ? 'student' : 'students'}`,

  // Urgent tasks
  'مهام عاجلة': 'Urgent tasks',
  'مهمة عامة': 'General task',
  'متأخرة': 'Late',

  // Recent leads
  'آخر العملاء': 'Recent leads',
  'الكل': 'All',
  'لا يوجد عملاء محتملون بعد': 'No leads yet',
  'آخر تحديث': 'Last updated',

  // Accounting
  'المحاسبة': 'Accounting',
  'فتح المالية': 'Open finance',
  'مصروفات اليوم': "Today's expenses",
  'مصروف': 'Expense',
  'غير مصنّف': 'Uncategorized',
  'لا توجد مصروفات مسجّلة اليوم': 'No expenses recorded today',
  'مصروفات الشهر حسب الفئة': "This month's expenses by category",

  // Instructor
  'جلساتي ومحفظتي': 'My sessions & wallet',
  'رصيد المحفظة ({currency})': 'Wallet balance ({currency})',
  'الجلسات القادمة': 'Upcoming sessions',
  'لا توجد جلسات قادمة': 'No upcoming sessions',
};
