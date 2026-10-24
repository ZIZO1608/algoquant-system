/* i18n-check: skip-file — sample names and notes are data, shown as written. */
/**
 * Made-up documents for the live preview in Settings → "الإيصالات والطباعة".
 * They have the same shape as the /documents API responses. Names and notes are sample data
 * (never translated in the app), so each language gets its own set.
 */

const SAMPLE_TEXT = {
  ar: {
    student: 'محمد العلي',
    employee: 'سارة الحسن',
    accountant: 'فادي عيسى',
    instructor: 'عمر الخطيب',
    course: 'أساسيات الذكاء الاصطناعي',
    course2: 'تحليل البيانات بلغة Python',
    expenseReason: 'ضيافة وقرطاسية لافتتاح الدفعة الجديدة',
    category: 'ضيافة',
    refundReason: 'انسحاب بعد الجلسة الأولى لظرف طارئ',
    ownerReason: 'سحب شهري',
    walletReason: 'سحب من رصيد الحصص',
  },
  en: {
    student: 'Mohammad Al-Ali',
    employee: 'Sara Al-Hasan',
    accountant: 'Fadi Issa',
    instructor: 'Omar Al-Khatib',
    course: 'AI Fundamentals',
    course2: 'Data Analysis with Python',
    expenseReason: 'Refreshments and stationery for the new cohort',
    category: 'Hospitality',
    refundReason: 'Withdrew after the first session',
    ownerReason: 'Monthly withdrawal',
    walletReason: 'Session earnings withdrawal',
  },
};

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

export function sampleDocument(type, lang = 'ar') {
  const s = SAMPLE_TEXT[lang] || SAMPLE_TEXT.ar;
  const student = { id: 'sample-student', fullName: s.student, phone: '0933 123 456', email: 'student@example.com' };
  const accountant = { id: 'sample-acc', fullName: s.accountant };
  const course = { id: 'sample-course', name: s.course };

  switch (type) {
    case 'payment':
      return {
        type,
        id: 'sample-payment',
        number: 128,
        issuedAt: daysAgo(0),
        amountMinor: '750000',
        method: 'cash',
        note: '',
        receivedBy: { id: 'sample-emp', fullName: s.employee },
        voided: null,
        student,
        course,
        enrollment: {
          totalPriceMinor: '2000000',
          paidBeforeMinor: '500000',
          paidAfterMinor: '1250000',
          remainingAfterMinor: '750000',
        },
      };
    case 'expense':
      return {
        type,
        id: 'sample-expense',
        number: 42,
        issuedAt: daysAgo(1),
        amountMinor: '350000',
        reason: s.expenseReason,
        category: { labelAr: s.category },
        course,
        createdBy: accountant,
        deleted: false,
      };
    case 'refund':
      return {
        type,
        id: 'sample-refund',
        number: 7,
        issuedAt: daysAgo(0),
        requestedAt: daysAgo(3),
        processedAt: daysAgo(0),
        status: 'processed',
        amountMinor: '250000',
        reason: s.refundReason,
        initiatedBy: accountant,
        student,
        course,
        enrollment: { totalPriceMinor: '2000000', amountPaidMinor: '250000' },
        history: [
          { toStatus: 'under_review', at: daysAgo(2), by: accountant },
          { toStatus: 'approved', at: daysAgo(1), by: accountant },
          { toStatus: 'processed', at: daysAgo(0), by: accountant },
        ],
      };
    case 'owner_withdrawal':
      return {
        type,
        id: 'sample-owner',
        number: 3,
        issuedAt: daysAgo(0),
        amountMinor: '1000000',
        reason: s.ownerReason,
        createdBy: accountant,
      };
    case 'wallet_withdrawal':
      return {
        type,
        id: 'sample-wallet',
        number: 15,
        issuedAt: daysAgo(0),
        requestedAt: daysAgo(2),
        paidAt: daysAgo(0),
        status: 'paid',
        amountMinor: '400000',
        reason: s.walletReason,
        employee: { id: 'sample-inst', fullName: s.instructor },
        reviewedBy: accountant,
        history: [
          { toStatus: 'under_review', at: daysAgo(2), by: accountant },
          { toStatus: 'approved', at: daysAgo(1), by: accountant },
          { toStatus: 'paid', at: daysAgo(0), by: accountant },
        ],
      };
    case 'statement':
    default:
      return {
        type: 'statement',
        id: 'sample-student',
        number: null,
        issuedAt: daysAgo(0),
        student: { ...student, status: 'active', createdAt: daysAgo(60) },
        courses: [
          {
            enrollmentId: 'e1',
            course,
            enrolledAt: daysAgo(40),
            enrollmentStatus: 'attending',
            paymentStatus: 'partially_paid',
            totalPriceMinor: '2000000',
            paidMinor: '1250000',
            refundedMinor: '0',
            balanceMinor: '750000',
            attendance: { marked: 6, attended: 5, sessionCount: 8 },
          },
          {
            enrollmentId: 'e2',
            course: { id: 'sample-course-2', name: s.course2 },
            enrolledAt: daysAgo(55),
            enrollmentStatus: 'certified',
            paymentStatus: 'paid_in_full',
            totalPriceMinor: '1500000',
            paidMinor: '1500000',
            refundedMinor: '0',
            balanceMinor: '0',
            attendance: { marked: 10, attended: 10, sessionCount: 10 },
          },
        ],
        ledger: [
          { date: daysAgo(55), kind: 'charge', enrollmentId: 'e2', courseName: s.course2, number: null, debitMinor: '1500000', creditMinor: '0', balanceMinor: '1500000' },
          { date: daysAgo(54), kind: 'payment', enrollmentId: 'e2', courseName: s.course2, number: 96, method: 'cash', debitMinor: '0', creditMinor: '1500000', balanceMinor: '0' },
          { date: daysAgo(40), kind: 'charge', enrollmentId: 'e1', courseName: s.course, number: null, debitMinor: '2000000', creditMinor: '0', balanceMinor: '2000000' },
          { date: daysAgo(39), kind: 'payment', enrollmentId: 'e1', courseName: s.course, number: 110, method: 'transfer', debitMinor: '0', creditMinor: '500000', balanceMinor: '1500000' },
          { date: daysAgo(0), kind: 'payment', enrollmentId: 'e1', courseName: s.course, number: 128, method: 'cash', debitMinor: '0', creditMinor: '750000', balanceMinor: '750000' },
        ],
        totals: { chargesMinor: '3500000', paidMinor: '2750000', refundedMinor: '0', balanceMinor: '750000' },
      };
  }
}
