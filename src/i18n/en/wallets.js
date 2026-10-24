/**
 * English for src/pages/EmployeeWallets.jsx. Strings shared with Finance.jsx are in finance.js;
 * 'محافظ الموظفين' is in shell.js, 'طلب سلفة راتب' and 'طلب سحب من المحفظة' in server.js.
 */

const plural = (n, one, many) => `${n} ${Number(n) === 1 ? one : many}`;

export default {
  // Transaction types
  'أجر جلسات': 'Session pay',
  'حصة أرباح': 'Profit share',
  'راتب': 'Salary',
  'سحب': 'Withdrawal',
  'خصم سلفة': 'Advance deduction',
  'عكس استرداد': 'Refund reversal',
  'إلغاء جلسة': 'Session cancellation',
  'تعديل / سلفة': 'Adjustment / advance',

  // Page header and tabs
  'الأرصدة والسلف وطلبات السحب': 'Balances, salary advances and withdrawal requests',
  'طلب سلفة|verb': 'Request advance',
  'كل المحافظ': 'All wallets',
  'الطلبات': 'Requests',

  // My wallet
  'رصيد محفظتك': 'Your wallet balance',
  'راتب ثابت': 'Fixed salary',
  'بدون راتب ثابت': 'No fixed salary',
  'الراتب الشهري': 'Monthly salary',
  'الحركات': 'Transactions',
  '{count} حركة': ({ count }) => plural(count, 'transaction', 'transactions'),
  'لا توجد حركات بعد': 'No transactions yet',
  'ستظهر هنا أجور الجلسات وحصص الأرباح والسحوبات فور تسجيلها.':
    'Session pay, profit shares and withdrawals will appear here as soon as they are recorded.',
  'طلبات السلفة': 'Advance requests',
  'النوع': 'Type',
  'الرصيد بعد الحركة': 'Balance after',
  'تاريخ الطلب': 'Request date',

  // All wallets
  '{count} محفظة': ({ count }) => plural(count, 'wallet', 'wallets'),
  'لا توجد محافظ': 'No wallets',
  'نوع التوظيف': 'Employment type',
  'الرصيد': 'Balance',
  'التفاصيل': 'Details',

  // Requests
  '{count} بانتظار القرار': '{count} awaiting decision',
  '{count} قيد المعالجة': '{count} in progress',
  'لا توجد طلبات معلقة': 'No pending requests',
  'طلبات السحب': 'Withdrawal requests',
  'اعتماد': 'Approve',
  'رفض': 'Reject',
  'مراجعة': 'Review',
  'تم الدفع': 'Mark as paid',

  // Wallet details
  'تفاصيل المحفظة': 'Wallet details',
  'الرصيد الحالي': 'Current balance',
  'لا توجد حركات': 'No transactions',
  'السلف': 'Salary advances',

  // Request modals
  'تُضاف السلفة إلى محفظتك عند اعتماد المدير، وتُخصم من راتبك الشهري القادم.':
    'The advance is added to your wallet once a manager approves it, and is deducted from your next monthly salary.',
  'يُراجع طلب السحب من الإدارة أو المحاسبة قبل صرفه من رصيد محفظتك.':
    'Management or accounting reviews the withdrawal request before it is paid out of your wallet balance.',

  // Toasts, errors and confirmations
  'تعذر تحميل المحافظ': "Couldn't load wallets",
  'تعذّر فتح تفاصيل المحفظة': "Couldn't open the wallet details",
  'تم إرسال طلب السلفة': 'Advance request sent',
  'تم اعتماد طلب السلفة': 'Advance request approved',
  // server.js has the employee-facing notification "Your advance request was rejected."
  'تم رفض طلب السلفة|toast': 'Advance request rejected',
  'تم تحويل الطلب إلى المراجعة': 'Request moved to review',
  'تم رفض طلب السحب': 'Withdrawal request rejected',
  'تم تحديث الطلب': 'Request updated',
  'رفض طلب السلفة': 'Reject advance request',
  'سيتم رفض طلب السلفة نهائياً ولن يُضاف المبلغ إلى محفظة الموظف. هل تريد المتابعة؟':
    "The advance request will be rejected for good and the amount won't be added to the employee's wallet. Continue?",
  'رفض طلب السحب': 'Reject withdrawal request',
  'سيتم رفض طلب السحب ولن يُصرف المبلغ من المحفظة. هل تريد المتابعة؟':
    "The withdrawal request will be rejected and the amount won't be paid out of the wallet. Continue?",
  'رفض الطلب': 'Reject request',
  'لا يوجد رصيد في محفظتك للسحب منه': "Your wallet has no balance to withdraw",
};
