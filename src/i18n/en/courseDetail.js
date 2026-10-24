/** English for src/pages/CourseDetail.jsx. */

const plural = (n, one, many) => `${n} ${Number(n) === 1 ? one : many}`;

export default {
  // Tabs and file categories
  'دورة الحياة': 'Lifecycle',
  'الجلسات': 'Sessions',
  'التقييمات': 'Evaluations',
  'الملفات': 'Files',
  'الكل': 'All',
  'مواد تعليمية': 'Learning materials',
  'شهادات': 'Certificates',

  // File kinds
  'صورة': 'Image',
  'فيديو': 'Video',
  'جدول|file-kind': 'Spreadsheet',
  'مستند': 'Document',
  'ملف': 'File',

  // Loading, toasts and confirmations
  'تعذّر تحميل المهام': "Couldn't load tasks",
  'تعذّر تحميل التقييمات': "Couldn't load evaluations",
  'تعذّر تحميل الملفات': "Couldn't load files",
  'تم رفع الملف': 'File uploaded',
  'فشل رفع الملف': "Couldn't upload the file",
  'تعذّر فتح الملف. تأكد أن خدمة التخزين تعمل.': "Couldn't open the file. Make sure the storage service is running.",
  'حذف الملف': 'Delete file',
  'سيتم حذف «{name}» نهائياً. لا يمكن التراجع عن هذا الإجراء.': "“{name}” will be deleted permanently. This can't be undone.",
  'تم حذف الملف': 'File deleted',
  'تعذّر حذف الملف': "Couldn't delete the file",
  'يرجى إدخال سبب الأرشفة': 'Enter a reason for archiving.',
  'تمت أرشفة الدورة': 'Course archived',
  'تم حفظ التعديلات': 'Changes saved',
  'تغيير قالب المهام': 'Change task template',
  'تغيير القالب سيُنهي المهام غير المكتملة من القالب الحالي ويُنشئ مهام القالب الجديد. المهام المكتملة تبقى في السجل. هل تريد المتابعة؟':
    "Changing the template closes the current template's incomplete tasks and creates the new template's tasks. Completed tasks stay in the history. Continue?",
  'تغيير القالب': 'Change template',
  'تم ربط قالب المهام': 'Task template attached',
  'تم تسجيل الطالب في الدورة': 'Student enrolled in the course',
  'تم تسجيل الدفعة': 'Payment recorded',
  'تم حفظ الحضور': 'Attendance saved',
  'تم إنشاء حملة التقييم': 'Evaluation campaign created',
  'تم النسخ': 'Copied',
  'تعذّر النسخ إلى الحافظة': "Couldn't copy to the clipboard",
  'لا توجد روابط متاحة للنسخ': 'No links to copy',
  'تم نسخ {count} رابط': ({ count }) => `Copied ${plural(count, 'link', 'links')}`,
  'تم حفظ الجلسة': 'Session saved',
  'تعذّر حفظ الجلسة': "Couldn't save the session",

  // Checklist export (CSV headers)
  'المرحلة': 'Stage',
  'القسم': 'Department',
  'المسؤول': 'Assignee',
  'الموعد': 'Due date',
  'تم تصدير قائمة المهام': 'Task checklist exported',

  // Not found
  'الدورة غير موجودة': 'Course not found',
  'ربما تم حذفها أو أن الرابط غير صحيح.': 'It may have been deleted, or the link is incorrect.',
  'العودة إلى الدورات': 'Back to courses',

  // Header
  'يبدأ {date}': 'Starts {date}',
  '{count} جلسات': ({ count }) => plural(count, 'session', 'sessions'),
  '{hours} ساعة': ({ hours }) => plural(hours, 'hour', 'hours'),
  '{count}/{capacity} طالب': ({ count, capacity }) => `${count}/${capacity} ${Number(capacity) === 1 ? 'student' : 'students'}`,
  'ربط قالب مهام': 'Attach task template',
  'تصدير المهام': 'Export tasks',
  'أرشفة': 'Archive',
  'ستتحول الدورة تلقائياً إلى «نشط» عند تاريخ البدء ({date}) وإلى «مكتمل» بعد تسجيل حضور آخر جلسة.':
    'The course switches to “Active” automatically on its start date ({date}) and to “Completed” once attendance is recorded for the last session.',

  // Lifecycle tab
  'قالب المهام المرفق': 'Attached task template',
  'لا يوجد قالب مهام مرفق': 'No task template attached',
  'اربط قالباً لتوليد مهام دورة الحياة تلقائياً.': 'Attach a template to generate lifecycle tasks automatically.',
  'غير المكتمل فقط': 'Incomplete only',
  'لا توجد مهام بعد': 'No tasks yet',
  'اربط قالب مهام لتوليد مهام دورة الحياة تلقائياً.': 'Attach a task template to generate lifecycle tasks automatically.',
  'المرحلة الحالية': 'Current stage',
  'مهام الميديا': 'Media tasks',
  'مهام اللوجستيات': 'Logistics tasks',

  // Students tab
  'الطلاب المسجلون': 'Enrolled students',
  'تسجيل طالب': 'Enroll student',
  'لا يوجد طلاب مسجلون بعد': 'No students enrolled yet',
  'سجّل طالباً موجوداً أو حوّل عميلاً محتملاً إلى طالب.': 'Enroll an existing student or convert a lead into a student.',
  'الهاتف': 'Phone',
  'حالة التسجيل': 'Enrollment status',
  'الدفع': 'Payment',
  'المدفوع / الإجمالي': 'Paid / total',

  // Sessions tab
  'اختر جلسة لتسجيل الحضور. يمكن تعديل التاريخ والوقت والمدة في أي وقت.':
    'Select a session to record attendance. You can change the date, time and duration at any time.',
  'التاريخ والوقت': 'Date & time',
  'المدة (ساعة)': 'Duration (hours)',
  'حضور الجلسة {n}': 'Session {n} attendance',
  'لا يوجد طلاب مسجلون': 'No students enrolled',
  'سجّل الطلاب أولاً لتسجيل الحضور.': 'Enroll students first to record attendance.',
  '{count} حاضر': '{count} present',
  '{count} غائب': '{count} absent',
  'تحديد الكل حاضر': 'Mark all present',
  'حضور {name}': 'Attendance for {name}',
  'حفظ الحضور': 'Save attendance',

  // Evaluations tab
  'ليس لديك صلاحية عرض التقييمات': "You don't have permission to view evaluations",
  'تُنشأ روابط التقييم تلقائياً عند تسجيل حضور آخر جلسة، أو يمكنك إنشاء الحملة يدوياً.':
    'Evaluation links are created automatically when attendance is recorded for the last session, or you can create the campaign manually.',
  'إنشاء حملة تقييم': 'Create evaluation campaign',
  'تظهر التقييمات هنا بعد إنشاء حملة وإرسال الروابط للطلاب.': 'Evaluations appear here after you create a campaign and send the links to students.',
  'تقييم نهاية الدورة': 'End-of-course evaluation',
  'تقييم جلسة': 'Session evaluation',
  'الاستجابات': 'Responses',
  'محاور': 'Content',
  'قاعة': 'Venue',
  'إفادة': 'Benefit',
  'نسخ كل الروابط': 'Copy all links',
  'ترشيح دورات': 'Recommended courses',
  'ملاحظات': 'Notes',
  'الرابط': 'Link',
  'تم نسخ الرابط': 'Link copied',
  'نسخ': 'Copy',

  // Finance tab
  'الأرقام محسوبة من تسجيلات الطلاب في هذه الدورة.': 'Figures are calculated from student enrollments in this course.',
  'تسجيل دفعة': 'Record payment',
  'إجمالي الإيرادات المتوقعة': 'Total expected revenue',
  'المحصّل': 'Collected',
  'المتبقي': 'Remaining',
  'نسبة التحصيل': 'Collection rate',

  // Files tab
  'تصنيف الملف': 'File category',
  'جاري الرفع…': 'Uploading…',
  'رفع ملف': 'Upload file',
  'لا ملفات بعد': 'No files yet',
  'ارفع أول ملف لهذه الدورة: مواد تعليمية، صور، فيديو أو جداول.':
    'Upload the first file for this course: learning materials, images, videos or spreadsheets.',
  'لم يُرفع أي ملف لهذه الدورة بعد.': 'No files have been uploaded for this course yet.',
  'ملف بدون اسم': 'Untitled file',
  'فتح': 'Open',

  // Edit course modal
  'تعديل الدورة': 'Edit course',
  'اسم الدورة': 'Course name',
  'السعة': 'Capacity',
  'ساعات الدورة التقريبية': 'Estimated course hours',
  'ملاحظات القاعة': 'Venue notes',
  'المدرّب وأجره مقفولان بعد بدء الدورة. يمكن تعديلهما فقط قبل البداية.':
    'The instructor and their pay are locked once the course starts. They can only be changed before the start.',
  '— بدون مدرّب —': '— No instructor —',
  'أجر بالساعة': 'Hourly rate',
  'أجر الساعة ({currency})': 'Hourly rate ({currency})',
  'حفظ التعديلات': 'Save changes',

  // Task template modal
  'القالب الحالي: {name}. اختيار قالب جديد يُنهي المهام غير المكتملة ويبقي المكتملة في السجل.':
    'Current template: {name}. Choosing a new template closes incomplete tasks and keeps completed ones in the history.',
  'كل بند في القالب يصبح مهمة مجدولة في دورة حياة الدورة.': 'Each template item becomes a scheduled task in the course lifecycle.',
  'لا توجد قوالب بعد': 'No templates yet',
  'أنشئ قالب مهام من الإعدادات أولاً.': 'Create a task template in Settings first.',
  'فتح الإعدادات': 'Open settings',
  '{count} مهمة': ({ count }) => plural(count, 'task', 'tasks'),
  'الحالي': 'Current',

  // Archive modal
  'أرشفة الدورة': 'Archive course',
  'الأرشفة نهائية وتُخفي الدورة من القوائم النشطة.': 'Archiving is permanent and hides the course from active lists.',
  'سبب الأرشفة': 'Reason for archiving',
  'اذكر سبب الأرشفة…': 'Enter the reason for archiving…',
  'تأكيد الأرشفة': 'Confirm archive',

  // Enroll modal
  'تسجيل طالب في الدورة': 'Enroll a student',
  'طلاب حاليون': 'Existing students',
  'عملاء محتملون': 'Leads',
  'بحث بالاسم أو الهاتف…': 'Search by name or phone…',
  'بحث': 'Search',
  'يُعرض جميع العملاء المحتملين بغض النظر عن حالتهم. سيُنشأ ملف طالب تلقائياً إن لم يكن موجوداً.':
    "All leads are shown, whatever their status. A student profile is created automatically if one doesn't exist.",
  'لا توجد نتائج': 'No results',

  // Payment modal
  '— اختر —': '— Select —',
  '{name} — متبقي {amount}': '{name} — {amount} remaining',
  'المبلغ ({currency})': 'Amount ({currency})',
  'ملاحظة': 'Note',
  'حفظ الدفعة': 'Save payment',

  // Page polish: role-aware course and task messages
  'لا توجد مهام ضمن تخصصك': "No tasks for your specialty",
  'مهام هذه الدورة ({count}) مسندة إلى أقسام أخرى.': "This course's {count} tasks belong to other departments.",
  'قائمة الطلاب غير متاحة لصلاحيتك': "You don't have access to the student list",
  'تسجيل الحضور يحتاج صلاحية الاطلاع على الطلاب — اطلبها من مدير النظام.': "Recording attendance needs access to students — ask an admin for it.",
  'الأسماء فقط — بيانات الطلاب الكاملة تحتاج صلاحية أوسع.': "Names only — full student records need broader access.",
  'الدورة تضم {count} طالباً، لكن عرض الأسماء يحتاج صلاحية أوسع.': "The course has {count} students, but seeing their names needs broader access.",
};
