/** English for src/pages/Finance.jsx, plus the strings Finance.jsx shares with EmployeeWallets.jsx. */

const plural = (n, one, many) => `${n} ${Number(n) === 1 ? one : many}`;

export default {
  // Page header and tabs ('المالية' is in shell.js, 'طلب سحب من المحفظة' in server.js)
  'الإيرادات والمصروفات والتدفق النقدي': 'Revenue, expenses and cash flow',
  'سحب المالك': 'Owner withdrawal',
  'مصروف جديد': 'New expense',
  'نظرة عامة': 'Overview',
  'الإيرادات': 'Revenue',
  'المصروفات': 'Expenses',
  'السحوبات': 'Withdrawals',

  // Overview
  'إيرادات الشهر': 'Revenue this month',
  'مصروفات الشهر': 'Expenses this month',
  'صافي الربح': 'Net profit',
  'التدفق النقدي (آخر شهر)': 'Cash flow (last month)',
  'الإيرادات مقابل المصروفات': 'Revenue vs expenses',
  'آخر 6 أشهر': 'Last 6 months',
  'لا توجد بيانات مالية بعد': 'No financial data yet',
  'ستظهر الإيرادات والمصروفات الشهرية هنا بمجرد تسجيل أول حركة.':
    'Monthly revenue and expenses will appear here once the first transaction is recorded.',

  // Revenue
  'إجمالي الإيرادات': 'Total revenue',
  'تُحتسب الإيرادات تلقائياً من دفعات الطلاب المسجّلة على الدورات، ولا تُدخل يدوياً من هذه الصفحة.':
    "Revenue is calculated automatically from student payments recorded on courses. It can't be entered manually on this page.",
  'لا توجد بيانات إيرادات بعد': 'No revenue data yet',
  'ستظهر الإيرادات هنا بعد تسجيل أول دفعة من طالب.': 'Revenue will appear here after the first student payment is recorded.',

  // Expenses
  '{count} مصروف': ({ count }) => plural(count, 'expense', 'expenses'),
  'لا توجد مصروفات مسجّلة بعد': 'No expenses recorded yet',
  'الفئة': 'Category',

  // Withdrawals
  'سحوبات المالك': 'Owner withdrawals',
  'سحب جديد': 'New withdrawal',
  'لا توجد سحوبات مسجّلة': 'No withdrawals recorded',
  'طلبات سحب المحافظ': 'Wallet withdrawal requests',
  'لا توجد طلبات سحب معلّقة': 'No pending withdrawal requests',
  'تسجيل الدفع': 'Mark as paid',

  // Modals
  'يُسجَّل السحب كحركة خارجة من صندوق الأكاديمية.': "The withdrawal is recorded as money going out of the academy's cash.",
  'حفظ السحب': 'Save withdrawal',
  'يُراجع الطلب من الإدارة أو المحاسبة قبل صرفه.': 'Management or accounting reviews the request before it is paid out.',
  'اختر الفئة وأدخل المبلغ وتاريخ الصرف.': 'Choose a category, then enter the amount and the date spent.',
  '— اختر الفئة —': '— Choose a category —',
  'حفظ المصروف': 'Save expense',

  // Toasts
  'تم تسجيل سحب المالك': 'Owner withdrawal recorded',
  'تعذّر تسجيل السحب': "Couldn't record the withdrawal",
  'تعذّر إرسال طلب السحب': "Couldn't send the withdrawal request",
  'تم تسجيل المصروف': 'Expense recorded',
  'تعذّر تسجيل المصروف': "Couldn't record the expense",

  // Shared with EmployeeWallets.jsx
  'محفظتي': 'My wallet',
  'طلب سحب': 'Request withdrawal',
  '{count} طلب': ({ count }) => plural(count, 'request', 'requests'),
  'المبلغ ({currency})': 'Amount ({currency})',
  'إرسال الطلب': 'Send request',
  'إجراء': 'Action',
  'موافقة': 'Approve',
  'تم إرسال طلب السحب': 'Withdrawal request sent',
  'تمت الموافقة على طلب السحب': 'Withdrawal request approved',
  'تم تسجيل دفع الطلب': 'Request marked as paid',
  'تعذّر تنفيذ الإجراء': "Couldn't complete the action",

  // Vouchers and refunds
  'رقم السند': 'Voucher no.',
  'طباعة سند الصرف': 'Print payment voucher',
  'طباعة سند السحب': 'Print withdrawal voucher',
  'طباعة سند الاسترداد': 'Print refund voucher',
  'طباعة السند بعد الحفظ': 'Print the voucher after saving',
  'سيُرفض طلب {name} بقيمة {amount}. هل تريد المتابعة؟': "{name}'s request for {amount} will be rejected. Continue?",
  'سيُخصم {amount} من محفظة {name}. هل سُلّم المبلغ؟': "{amount} comes out of {name}'s wallet. Has the money been handed over?",
  'الاستردادات': 'Refunds',
  'طلبات استرداد الطلاب': 'Student refund requests',
  'بانتظار الإجراء': 'Needs action',
  'لا توجد طلبات استرداد بانتظار الإجراء': 'No refund requests need action',
  'لا توجد طلبات استرداد': 'No refund requests',
  'رفض طلب الاسترداد': 'Reject refund request',
  'سيُرفض طلب استرداد {name} بقيمة {amount}. هل تريد المتابعة؟': "{name}'s refund request for {amount} will be rejected. Continue?",
  'صرف مبلغ الاسترداد': 'Pay out refund',
  'سيُصرف {amount} إلى {name} ويُخصم من المبلغ المدفوع للدورة. هل تريد المتابعة؟':
    '{amount} will be paid to {name} and taken off the amount paid for the course. Continue?',
  'صرف المبلغ': 'Pay out',
  'تم تحويل طلب الاسترداد إلى المراجعة': 'Refund request moved to review',
  'تمت الموافقة على طلب الاسترداد': 'Refund request approved',
  'تم رفض طلب الاسترداد': 'Refund request rejected',
  'تم صرف مبلغ الاسترداد': 'Refund paid out',
  'تُطلب الاستردادات من صفحة الطالب (تبويب الدورات)، وتُراجَع وتُصرف من هنا.':
    'Refunds are requested from the student page (Courses tab) and reviewed and paid out here.',

  // Income tab: the payments the income total is made of
  'دفعات الطلاب': "Student payments",
  '{count} دفعة': "{count} payments",
  'لا توجد دفعات مسجّلة بعد': "No payments recorded yet",
  'رقم الإيصال': "Receipt no.",
  'استلمها': "Received by",
  'طباعة إيصال القبض': "Print the receipt",
  'تُسجَّل الدفعات من صفحة الطالب (تبويب الدورات)، وتُحتسب الإيرادات منها تلقائياً.': "Payments are recorded on the student page (Courses tab); income is calculated from them automatically.",
  'فتح محفظة الموظف': 'Open the employee wallet',
};
