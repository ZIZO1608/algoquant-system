/** English for src/pages/Tasks.jsx and src/components/TaskRow.jsx. */

const taskCount = (n) => `${n} ${Number(n) === 1 ? 'task' : 'tasks'}`;

export default {
  // Board columns (column titles come from status.js)
  'لا مهام جديدة': 'No new tasks',
  'اسحب مهمة هنا لبدء العمل': 'Drag a task here to start work',
  'لا مهام مكتملة بعد': 'No completed tasks yet',
  'لا مهام متأخرة، أحسنت!': 'No late tasks. Nice work!',
  '{label}، {count} مهام': ({ label, count }) => `${label}, ${taskCount(count)}`,

  // Header and toolbar
  'صندوق مهام الفريق عبر جميع الدورات': "The team's task board across all courses",
  'توسيع اللوحة': 'Expand board',
  'توسيع': 'Expand',
  'تصغير (Esc)': 'Minimize (Esc)',
  'تصغير': 'Minimize',
  'مهامي': 'My tasks',
  'القسم': 'Department',
  'كل الأقسام': 'All departments',
  'كل الدورات': 'All courses',
  'مفتوحة': 'Open',
  'متأخرة': 'Late',
  'بدون مسؤول': 'Unassigned',
  'بحث عن مهمة…': 'Search tasks…',
  'بحث عن مهمة': 'Search tasks',

  // Task cards (Tasks.jsx) and task rows (TaskRow.jsx)
  'هذه المهمة بلا مسؤول': 'This task has no assignee',
  'غير معيّن': 'Unassigned',
  'انقر لتعيين مسؤول': 'Click to assign',
  'المسؤول': 'Assignee',
  '— اختر موظفاً —': '— Select an employee —',
  ' · موصى به': ' · Recommended',
  ' · غائب اليوم': ' · Absent today',
  'تعيين {name} (أقل حمل)': 'Assign {name} (lightest load)',
  'لا يوجد موظفون بهذا التخصص': 'No employees with this specialty',
  'فتح الدورة': 'Open course',
  'إعادة فتح المهمة': 'Reopen task',
  'إنجاز المهمة': 'Mark as done',
  'إنجاز مهمة {title}': 'Mark {title} as done',
  'الوصف': 'Description',
  'الموعد النهائي': 'Due date',

  // Messages
  'تم تعيين المسؤول': 'Assignee set',
  'تمت إزالة المسؤول': 'Assignee removed',
  'تعذّر نقل المهمة': "Couldn't move the task",
  'تعذّر التعيين': "Couldn't assign the task",
  'تعذّر تحديث الحالة': "Couldn't update the status",
  'تعذّر الحفظ': "Couldn't save",
};
