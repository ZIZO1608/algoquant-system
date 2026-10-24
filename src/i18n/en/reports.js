/** English for src/pages/Reports.jsx. */

const count = (n, one, many) => `${n} ${Number(n) === 1 ? one : many}`;

export default {
  // Report index
  'الأرباح والخسائر': 'P&L',
  'صافي الربح والتكاليف': 'Net profit and costs',
  'الحملات التسويقية': 'Marketing campaigns',
  'العملاء حسب المصدر ونسبة التحويل': 'Leads by source and conversion rate',
  'طلب العملاء (البوت)': 'Lead demand (bot)',
  'مجال الاهتمام × التصنيف من بوت التأهيل': 'Interest area × classification from the qualification bot',
  'أداء الموظفين': 'Employee performance',
  'مهام منجزة وتقييم الأداء': 'Completed tasks and performance evaluations',
  'أداء الكورسات': 'Course performance',
  'نسبة الامتلاء وحالة كل دورة': 'Fill rate and status of each course',
  'تقييمات الطلاب': 'Student evaluations',
  'متوسط التقييمات': 'Average evaluation scores',
  'التقارير والتحليلات': 'Reports & analytics',
  'تقارير تفصيلية لاتخاذ القرارات': 'Detailed reports for decision-making',
  'لا توجد تقارير متاحة لصلاحياتك': 'No reports available for your privileges',
  'تواصل مع مدير النظام إذا كنت بحاجة إلى الوصول لأحد التقارير.':
    'Contact your system administrator if you need access to a report.',
  'عرض التقرير': 'View report',
  'العودة للتقارير': 'Back to reports',
  'تعذّر تحميل التقرير': "Couldn't load the report",

  // P&L
  'لا توجد بيانات مالية بعد': 'No financial data yet',
  'الإيرادات': 'Revenue',
  'المصروفات': 'Expenses',
  'سحوبات المالك': 'Owner withdrawals',
  'صافي الربح': 'Net profit',
  'توزيع الأرباح والخسائر': 'P&L breakdown',

  // Marketing
  'لا توجد بيانات تسويقية بعد': 'No marketing data yet',
  'معدل التحويل': 'Conversion rate',
  'عملاء تم تحويلهم': 'Converted leads',
  'العملاء حسب المصدر': 'Leads by source',
  'لا توجد بيانات حسب المصدر': 'No data by source yet',
  'المصدر': 'Source',
  'عدد العملاء': 'Leads',

  // Lead demand (bot)
  'لا توجد بيانات من البوت بعد': 'No bot data yet',
  'تظهر هنا اهتمامات العملاء وتصنيفاتهم كما جمعها بوت التأهيل.':
    'Lead interests and classifications collected by the qualification bot appear here.',
  'إجمالي عملاء البوت': 'Total bot leads',
  'مجالات الاهتمام': 'Interest areas',
  'جاهزون للتسجيل': 'Ready to enroll',
  'مجال الاهتمام × التصنيف': 'Interest area × classification',
  'مجال الاهتمام': 'Interest area',
  'التصنيف': 'Classification',
  'جاهز للتسجيل': 'Ready to enroll',
  'العدد': 'Count',
  'نعم': 'Yes',
  'لا': 'No',

  // Employee performance
  'لا توجد بيانات أداء بعد': 'No performance data yet',
  'تقييمات الأداء': 'Performance evaluations',
  '{count} تقييم': ({ count: n }) => count(n, 'evaluation', 'evaluations'),
  'لا توجد تقييمات أداء بعد': 'No performance evaluations yet',
  'التقييم': 'Score',
  'الفترة': 'Period',

  // Course performance
  'لا توجد دورات لعرضها': 'No courses to show',
  'نسبة الامتلاء لكل دورة': 'Fill rate by course',
  '{count} دورة': ({ count: n }) => count(n, 'course', 'courses'),
  'نسبة الامتلاء': 'Fill rate',
  'تفاصيل الدورات': 'Course details',
  'المسجّلون': 'Enrolled',

  // Evaluations
  'محاور الدورة': 'Course content',
  'مستوى الإفادة': 'Benefit level',
  'التقييمات حسب الدورة': 'Evaluations by course',
  'لا توجد تقييمات مرتبطة بدورات بعد': 'No course evaluations yet',
  'الإفادة': 'Benefit',
  'عدد التقييمات': 'Evaluations',

  // A linked report the account cannot open
  'هذا التقرير غير متاح': "This report is not available",
  'إما أن الرابط غير صحيح أو أن صلاحياتك لا تسمح بعرض هذا التقرير.': "Either the link is wrong or your privileges do not allow you to view this report.",
};
