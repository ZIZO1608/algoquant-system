import { prisma } from '../lib/prisma.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../lib/errors.js';
import { PrivilegeCode } from '../config/index.js';
import { hasAnyPrivilege } from './auth.service.js';
import { writeAuditLog } from './audit.service.js';

/**
 * Data for printable documents (receipts, vouchers, statements). Each document carries its
 * sequence number; the prefix, layout and paper size are print settings kept on the client
 * (AppSetting "printSettings"), so the numbers never change when the look does.
 */

/** Tables and columns are fixed here, never taken from a request. */
export const DOCUMENT_SEQUENCES = {
  payment: { table: 'student_payments', column: 'receipt_no' },
  expense: { table: 'expenses', column: 'voucher_no' },
  refund: { table: 'refunds', column: 'voucher_no' },
  owner_withdrawal: { table: 'owner_withdrawals', column: 'voucher_no' },
  wallet_withdrawal: { table: 'wallet_withdrawal_requests', column: 'voucher_no' },
} as const;

export type NumberedDocument = keyof typeof DOCUMENT_SEQUENCES;

export function isNumberedDocument(value: string): value is NumberedDocument {
  return Object.hasOwn(DOCUMENT_SEQUENCES, value);
}

const PERSON = { select: { id: true, fullName: true } } as const;

function maxZero(n: bigint) {
  return n < 0n ? 0n : n;
}

/** Who moved an entity to each status, from the transition log. */
async function transitionActors(entityType: string, entityId: string) {
  const rows = await prisma.entityStatusTransition.findMany({
    where: { entityType, entityId },
    include: { triggeredBy: PERSON },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((r) => ({
    toStatus: r.toStatus,
    at: r.createdAt,
    by: r.triggeredBy,
    reason: r.reason,
  }));
}

export async function getPaymentDocument(id: string) {
  const payment = await prisma.studentPayment.findUnique({
    where: { id },
    include: {
      receivedBy: PERSON,
      voidedBy: PERSON,
      enrollment: {
        include: {
          student: { select: { id: true, fullName: true, phone: true, email: true } },
          course: { select: { id: true, name: true, courseType: true, startDate: true } },
        },
      },
    },
  });
  if (!payment) throw new NotFoundError('Payment not found');
  const e = payment.enrollment;

  // The balance as it stood when this receipt was issued: valid payments before it,
  // minus refunds processed before it.
  const [earlier, refunded] = await Promise.all([
    prisma.studentPayment.aggregate({
      where: {
        enrollmentId: e.id,
        voidedAt: null,
        id: { not: payment.id },
        OR: [
          { paidAt: { lt: payment.paidAt } },
          { paidAt: payment.paidAt, receiptNo: { lt: payment.receiptNo } },
        ],
      },
      _sum: { amountMinor: true },
    }),
    prisma.refund.aggregate({
      where: { enrollmentId: e.id, status: 'processed', processedAt: { lte: payment.paidAt } },
      _sum: { amountMinor: true },
    }),
  ]);
  const paidBefore = maxZero((earlier._sum.amountMinor ?? 0n) - (refunded._sum.amountMinor ?? 0n));
  const paidAfter = paidBefore + (payment.voidedAt ? 0n : payment.amountMinor);

  return {
    type: 'payment' as const,
    id: payment.id,
    number: payment.receiptNo,
    issuedAt: payment.paidAt,
    amountMinor: payment.amountMinor,
    method: payment.method,
    note: payment.note,
    receivedBy: payment.receivedBy,
    voided: payment.voidedAt
      ? { at: payment.voidedAt, by: payment.voidedBy, reason: payment.voidReason }
      : null,
    student: e.student,
    course: e.course,
    enrollment: {
      id: e.id,
      enrollmentStatus: e.enrollmentStatus,
      paymentStatus: e.paymentStatus,
      totalPriceMinor: e.totalPriceMinor,
      paidBeforeMinor: paidBefore,
      paidAfterMinor: paidAfter,
      remainingAfterMinor: maxZero(e.totalPriceMinor - paidAfter),
    },
  };
}

export async function getExpenseDocument(id: string) {
  const expense = await prisma.expense.findUnique({
    where: { id },
    include: {
      category: { select: { id: true, code: true, labelAr: true } },
      course: { select: { id: true, name: true } },
      createdBy: PERSON,
    },
  });
  if (!expense) throw new NotFoundError('Expense not found');
  return {
    type: 'expense' as const,
    id: expense.id,
    number: expense.voucherNo,
    issuedAt: expense.spentAt,
    recordedAt: expense.createdAt,
    amountMinor: expense.amountMinor,
    reason: expense.reason,
    category: expense.category,
    course: expense.course,
    createdBy: expense.createdBy,
    deleted: Boolean(expense.deletedAt),
  };
}

export async function getOwnerWithdrawalDocument(id: string) {
  const w = await prisma.ownerWithdrawal.findUnique({
    where: { id },
    include: { createdBy: PERSON },
  });
  if (!w) throw new NotFoundError('Withdrawal not found');
  return {
    type: 'owner_withdrawal' as const,
    id: w.id,
    number: w.voucherNo,
    issuedAt: w.spentAt,
    recordedAt: w.createdAt,
    amountMinor: w.amountMinor,
    reason: w.reason,
    createdBy: w.createdBy,
  };
}

export async function getWalletWithdrawalDocument(
  id: string,
  viewer: { id: string; privileges: PrivilegeCode[] }
) {
  const w = await prisma.walletWithdrawalRequest.findUnique({
    where: { id },
    include: {
      wallet: { include: { owner: { select: { id: true, fullName: true, email: true, phone: true } } } },
      requestedBy: PERSON,
    },
  });
  if (!w) throw new NotFoundError('Withdrawal request not found');
  // Finance staff print any voucher; an employee prints only their own.
  if (!hasAnyPrivilege(viewer.privileges, ['admin', 'accountant']) && w.wallet.ownerId !== viewer.id) {
    throw new ForbiddenError('Insufficient privileges');
  }
  const reviewer = w.reviewedById
    ? await prisma.employee.findUnique({ where: { id: w.reviewedById }, select: { id: true, fullName: true } })
    : null;
  return {
    type: 'wallet_withdrawal' as const,
    id: w.id,
    number: w.voucherNo,
    issuedAt: w.paidAt ?? w.createdAt,
    requestedAt: w.createdAt,
    paidAt: w.paidAt,
    status: w.status,
    amountMinor: w.amountMinor,
    reason: w.reason,
    employee: w.wallet.owner,
    requestedBy: w.requestedBy,
    reviewedBy: reviewer,
    history: await transitionActors('wallet_withdrawal', w.id),
  };
}

export async function getRefundDocument(id: string) {
  const refund = await prisma.refund.findUnique({
    where: { id },
    include: {
      initiatedBy: PERSON,
      enrollment: {
        include: {
          student: { select: { id: true, fullName: true, phone: true, email: true } },
          course: { select: { id: true, name: true } },
        },
      },
    },
  });
  if (!refund) throw new NotFoundError('Refund not found');
  const e = refund.enrollment;
  return {
    type: 'refund' as const,
    id: refund.id,
    number: refund.voucherNo,
    issuedAt: refund.processedAt ?? refund.createdAt,
    requestedAt: refund.createdAt,
    processedAt: refund.processedAt,
    status: refund.status,
    amountMinor: refund.amountMinor,
    reason: refund.reason,
    initiatedBy: refund.initiatedBy,
    student: e.student,
    course: e.course,
    enrollment: {
      id: e.id,
      totalPriceMinor: e.totalPriceMinor,
      amountPaidMinor: e.amountPaidMinor,
      paymentStatus: e.paymentStatus,
    },
    history: await transitionActors('refund', refund.id),
  };
}

type LedgerEntry = {
  date: Date;
  kind: 'charge' | 'payment' | 'refund';
  enrollmentId: string;
  courseName: string;
  number: number | null;
  method?: string | null;
  note?: string | null;
  debitMinor: bigint;
  creditMinor: bigint;
};

/** Everything a student owes and paid, per course and as a dated ledger with a running balance. */
export async function getStudentStatement(studentId: string) {
  const student = await prisma.student.findFirst({
    where: { id: studentId, deletedAt: null },
    include: {
      enrollments: {
        include: {
          course: { select: { id: true, name: true, startDate: true, courseType: true, sessionCount: true } },
          payments: { orderBy: { paidAt: 'asc' } },
          refunds: { where: { status: 'processed' }, orderBy: { processedAt: 'asc' } },
          certificates: { where: { status: 'issued' }, select: { id: true, issuedAt: true } },
        },
        orderBy: { enrolledAt: 'asc' },
      },
    },
  });
  if (!student) throw new NotFoundError('Student not found');

  const attendance = await prisma.sessionAttendance.findMany({
    where: { studentId },
    select: { status: true, session: { select: { courseId: true } } },
  });

  const entries: LedgerEntry[] = [];
  const courses = student.enrollments.map((e) => {
    const validPayments = e.payments.filter((p) => !p.voidedAt);
    const paid = validPayments.reduce((s, p) => s + p.amountMinor, 0n);
    const refunded = e.refunds.reduce((s, r) => s + r.amountMinor, 0n);

    entries.push({
      date: e.enrolledAt,
      kind: 'charge',
      enrollmentId: e.id,
      courseName: e.course.name,
      number: null,
      debitMinor: e.totalPriceMinor,
      creditMinor: 0n,
    });
    for (const p of validPayments) {
      entries.push({
        date: p.paidAt,
        kind: 'payment',
        enrollmentId: e.id,
        courseName: e.course.name,
        number: p.receiptNo,
        method: p.method,
        note: p.note,
        debitMinor: 0n,
        creditMinor: p.amountMinor,
      });
    }
    for (const r of e.refunds) {
      entries.push({
        date: r.processedAt ?? r.createdAt,
        kind: 'refund',
        enrollmentId: e.id,
        courseName: e.course.name,
        number: r.voucherNo,
        note: r.reason,
        debitMinor: r.amountMinor,
        creditMinor: 0n,
      });
    }

    const marked = attendance.filter((a) => a.session.courseId === e.course.id);
    const attended = marked.filter((a) => a.status === 'present' || a.status === 'late').length;

    return {
      enrollmentId: e.id,
      course: e.course,
      enrolledAt: e.enrolledAt,
      enrollmentStatus: e.enrollmentStatus,
      paymentStatus: e.paymentStatus,
      totalPriceMinor: e.totalPriceMinor,
      paidMinor: paid,
      refundedMinor: refunded,
      // amountPaidMinor already nets out processed refunds
      balanceMinor: e.totalPriceMinor - e.amountPaidMinor,
      voidedPayments: e.payments.length - validPayments.length,
      certificateIssuedAt: e.certificates[0]?.issuedAt ?? null,
      attendance: { marked: marked.length, attended, sessionCount: e.course.sessionCount },
    };
  });

  const kindOrder = { charge: 0, payment: 1, refund: 2 } as const;
  entries.sort((a, b) => a.date.getTime() - b.date.getTime() || kindOrder[a.kind] - kindOrder[b.kind]);
  let running = 0n;
  const ledger = entries.map((entry) => {
    running += entry.debitMinor - entry.creditMinor;
    return { ...entry, balanceMinor: running };
  });

  const totals = courses.reduce(
    (acc, c) => ({
      chargesMinor: acc.chargesMinor + c.totalPriceMinor,
      paidMinor: acc.paidMinor + c.paidMinor,
      refundedMinor: acc.refundedMinor + c.refundedMinor,
      balanceMinor: acc.balanceMinor + c.balanceMinor,
    }),
    { chargesMinor: 0n, paidMinor: 0n, refundedMinor: 0n, balanceMinor: 0n }
  );

  return {
    type: 'statement' as const,
    id: student.id,
    number: null,
    issuedAt: new Date(),
    student: {
      id: student.id,
      fullName: student.fullName,
      phone: student.phone,
      email: student.email,
      status: student.status,
      statusReason: student.statusReason,
      createdAt: student.createdAt,
    },
    courses,
    ledger,
    totals,
  };
}

/* ── Numbering ─────────────────────────────────────────────────────────────── */

type SequenceRow = { last_value: bigint; is_called: boolean };

async function sequenceState(type: NumberedDocument) {
  const { table, column } = DOCUMENT_SEQUENCES[type];
  const [{ seq }] = await prisma.$queryRawUnsafe<{ seq: string | null }[]>(
    'SELECT pg_get_serial_sequence($1, $2) AS seq',
    table,
    column
  );
  if (!seq) throw new NotFoundError('Sequence not found');
  // `seq` comes from PostgreSQL itself (schema-qualified, already quoted where needed).
  const [row] = await prisma.$queryRawUnsafe<SequenceRow[]>(`SELECT last_value, is_called FROM ${seq}`);
  const [{ max }] = await prisma.$queryRawUnsafe<{ max: number | null }[]>(
    `SELECT MAX("${column}")::int AS max FROM "${table}"`
  );
  const next = row.is_called ? Number(row.last_value) + 1 : Number(row.last_value);
  return { lastUsed: max ?? 0, next };
}

export async function getNumbering() {
  const entries = await Promise.all(
    (Object.keys(DOCUMENT_SEQUENCES) as NumberedDocument[]).map(
      async (type) => [type, await sequenceState(type)] as const
    )
  );
  return Object.fromEntries(entries);
}

/**
 * Move a document sequence forward (e.g. to continue a paper receipt book). Numbers already
 * printed can never be reused, so the next number must be above the highest one in use.
 */
export async function setNextNumber(type: NumberedDocument, next: number, actorId: string) {
  if (!Number.isInteger(next) || next < 1 || next > 2_000_000_000) {
    throw new ValidationError('الرقم التالي يجب أن يكون عدداً صحيحاً موجباً');
  }
  const before = await sequenceState(type);
  if (next <= before.lastUsed) {
    throw new ValidationError('الرقم التالي يجب أن يكون أكبر من آخر رقم مستخدم', {
      lastUsed: before.lastUsed,
    });
  }
  const { table, column } = DOCUMENT_SEQUENCES[type];
  await prisma.$queryRawUnsafe(
    'SELECT setval(pg_get_serial_sequence($1, $2), $3::bigint, false)',
    table,
    column,
    next
  );
  await writeAuditLog({
    actorType: 'employee',
    actorId,
    action: 'document_numbering.updated',
    entityType: 'document_numbering',
    entityId: type,
    oldValue: before,
    newValue: { next },
  });
  return sequenceState(type);
}
