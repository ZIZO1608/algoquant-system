import {
  WithdrawalStatus,
  RefundStatus,
  WalletTransactionType,
  PaymentStatus,
  EnrollmentStatus,
  Prisma,
} from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import {
  assertTransition,
  WITHDRAWAL_TRANSITIONS,
  REFUND_TRANSITIONS,
  ENROLLMENT_TRANSITIONS,
  PAYMENT_TRANSITIONS,
  ADVANCE_TRANSITIONS,
} from '../state-machines/transitions.js';
import { transitionEntityStatus, writeAuditLog } from './audit.service.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import { toMinor, formatMinor, paymentStatusFromAmounts, subtractMinor, addMinor } from '../lib/money.js';
import { createNotification } from './notification.service.js';

/**
 * What the requester reads in their notification. The status code itself is in the payload;
 * the body is a sentence, because a person reads it.
 */
const WITHDRAWAL_STATUS_BODY: Record<string, string> = {
  under_review: 'طلب السحب قيد المراجعة',
  approved: 'تمت الموافقة على طلب السحب',
  rejected: 'تم رفض طلب السحب',
  paid: 'تم صرف مبلغ السحب',
};

type DbClient = Prisma.TransactionClient | typeof prisma;

export async function getOrCreateWallet(ownerId: string, client: DbClient = prisma) {
  let wallet = await client.wallet.findUnique({ where: { ownerId } });
  if (!wallet) {
    wallet = await client.wallet.create({ data: { ownerId } });
  }
  return wallet;
}

async function lockWalletBalance(tx: Prisma.TransactionClient, walletId: string): Promise<bigint> {
  const rows = await tx.$queryRaw<Array<{ balance_minor: bigint }>>`
    SELECT balance_minor FROM wallets WHERE id = ${walletId} FOR UPDATE
  `;
  if (!rows[0]) throw new NotFoundError('Wallet not found');
  return rows[0].balance_minor;
}

export async function creditWallet(
  ownerId: string,
  amountMinor: bigint,
  type: WalletTransactionType,
  reason: string,
  referenceType?: string,
  referenceId?: string,
  approvedById?: string,
  client?: Prisma.TransactionClient
) {
  if (amountMinor <= 0n) throw new ValidationError('المبلغ يجب أن يكون أكبر من صفر');

  const run = async (tx: Prisma.TransactionClient) => {
    const wallet = await getOrCreateWallet(ownerId, tx);
    const balance = await lockWalletBalance(tx, wallet.id);
    const newBalance = addMinor(balance, amountMinor);

    await tx.wallet.update({
      where: { id: wallet.id },
      data: { balanceMinor: newBalance },
    });

    return tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type,
        amountMinor,
        balanceAfterMinor: newBalance,
        reason,
        referenceType,
        referenceId,
        approvedById,
      },
    });
  };

  if (client) return run(client);
  return prisma.$transaction(run);
}

export async function debitWallet(
  ownerId: string,
  amountMinor: bigint,
  type: WalletTransactionType,
  reason: string,
  referenceType?: string,
  referenceId?: string,
  approvedById?: string,
  client?: Prisma.TransactionClient
) {
  if (amountMinor <= 0n) throw new ValidationError('المبلغ يجب أن يكون أكبر من صفر');

  const run = async (tx: Prisma.TransactionClient) => {
    const wallet = await getOrCreateWallet(ownerId, tx);
    const balance = await lockWalletBalance(tx, wallet.id);
    if (balance < amountMinor) {
      throw new ValidationError('Insufficient wallet balance');
    }
    const newBalance = subtractMinor(balance, amountMinor);

    await tx.wallet.update({
      where: { id: wallet.id },
      data: { balanceMinor: newBalance },
    });

    return tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type,
        amountMinor: -amountMinor,
        balanceAfterMinor: newBalance,
        reason,
        referenceType,
        referenceId,
        approvedById,
      },
    });
  };

  if (client) return run(client);
  return prisma.$transaction(run);
}

/** Calculate and credit teacher pay for a completed session (idempotent by referenceId). */
export async function creditTeacherForSession(
  sessionId: string,
  instructorId?: string | null,
  client?: Prisma.TransactionClient
) {
  const db = client ?? prisma;
  const session = await db.courseSession.findUnique({
    where: { id: sessionId },
    include: {
      course: {
        include: { instructors: true },
      },
    },
  });
  if (!session) throw new NotFoundError('Session not found');

  const course = session.course;
  const teacherId = instructorId || course.primaryInstructorId;
  if (!teacherId) return null;

  const already = await db.walletTransaction.findFirst({
    where: {
      type: 'credit_hours',
      referenceType: 'course_session',
      referenceId: sessionId,
    },
  });
  if (already) return already;

  const link =
    course.instructors.find((i) => i.employeeId === teacherId) ||
    course.instructors[0] ||
    null;

  const sessionCount = Math.max(1, course.sessionCount);
  let sessionHours =
    course.totalHours > 0
      ? course.totalHours / sessionCount
      : (session.durationMinutes || 90) / 60;
  if (!Number.isFinite(sessionHours) || sessionHours <= 0) sessionHours = 1.5;

  let amount = 0n;
  if (link?.hourlyRateMinor != null && link.hourlyRateMinor > 0n) {
    amount = BigInt(Math.round(sessionHours * Number(link.hourlyRateMinor)));
  } else {
    let payPercent = link?.payPercent ?? null;
    if (payPercent == null) {
      const finance = await db.settingsFinance.findUnique({ where: { id: 'singleton' } });
      payPercent = finance?.defaultTeacherPayPercent ?? 50;
    }
    const pct = Math.round(Number(payPercent) || 0);
    if (pct > 0) {
      amount = (course.priceMinor * BigInt(pct)) / (100n * BigInt(sessionCount));
    }
  }

  if (amount <= 0n) return null;

  return creditWallet(
    teacherId,
    amount,
    'credit_hours',
    `جلسة ${session.sessionNumber} — ${course.name}`,
    'course_session',
    sessionId,
    undefined,
    client
  );
}

export async function reverseSessionCredit(
  sessionId: string,
  instructorId: string,
  amountMinor: bigint,
  reason: string,
  approvedById: string
) {
  return debitWallet(
    instructorId,
    amountMinor,
    'reversal_session_cancel',
    reason,
    'course_session',
    sessionId,
    approvedById
  );
}

export async function requestWithdrawal(
  ownerId: string,
  amountMinor: bigint,
  reason: string,
  requestedById: string
) {
  if (amountMinor <= 0n) throw new ValidationError('المبلغ يجب أن يكون أكبر من صفر');

  const wallet = await getOrCreateWallet(ownerId);
  if (wallet.balanceMinor < amountMinor) {
    throw new ValidationError('Insufficient balance for withdrawal');
  }

  const request = await prisma.walletWithdrawalRequest.create({
    data: {
      walletId: wallet.id,
      amountMinor,
      reason,
      requestedById,
    },
  });

  // The accountant who reads this needs to know who asked and for how much, not just the reason.
  const owner = await prisma.employee.findUnique({
    where: { id: ownerId },
    select: { fullName: true },
  });
  const body = [owner?.fullName, formatMinor(amountMinor), reason].filter(Boolean).join(' — ');

  const accountants = await prisma.employeePrivilege.findMany({
    where: { privilege: { code: { in: ['accountant', 'admin'] } } },
  });
  for (const { employeeId } of accountants) {
    await createNotification({
      employeeId,
      type: 'withdrawal_requested',
      title: 'طلب سحب من المحفظة',
      body,
      payload: { withdrawalId: request.id, ownerId },
    });
  }

  return request;
}

export async function transitionWithdrawal(
  id: string,
  toStatus: WithdrawalStatus,
  actorId: string
) {
  const request = await prisma.walletWithdrawalRequest.findUnique({
    where: { id },
    include: { wallet: true },
  });
  if (!request) throw new NotFoundError('Withdrawal request not found');

  assertTransition(WITHDRAWAL_TRANSITIONS, request.status, toStatus, 'withdrawal');

  if (toStatus === 'paid') {
    await debitWallet(
      request.wallet.ownerId,
      request.amountMinor,
      'debit_withdrawal',
      request.reason ?? 'Withdrawal',
      'wallet_withdrawal',
      id,
      actorId
    );
  }

  await prisma.walletWithdrawalRequest.update({
    where: { id },
    data: {
      status: toStatus,
      reviewedById: actorId,
      paidAt: toStatus === 'paid' ? new Date() : undefined,
    },
  });

  await transitionEntityStatus({
    entityType: 'wallet_withdrawal',
    entityId: id,
    fromStatus: request.status,
    toStatus,
    triggeredByType: 'employee',
    triggeredById: actorId,
    actorType: 'employee',
    actorId,
    action: 'withdrawal.status_change',
  });

  await createNotification({
    employeeId: request.requestedById,
    type: 'withdrawal_status',
    title: 'تحديث طلب السحب',
    body: WITHDRAWAL_STATUS_BODY[toStatus] ?? toStatus,
    payload: { withdrawalId: id, status: toStatus },
  });

  return request;
}

export async function listWallets() {
  const employees = await prisma.employee.findMany({
    where: { deletedAt: null, isActive: true },
    include: { wallet: true },
    orderBy: { fullName: 'asc' },
  });
  return Promise.all(
    employees.map(async (emp) => {
      const wallet = emp.wallet || (await getOrCreateWallet(emp.id));
      return {
        ...wallet,
        owner: {
          id: emp.id,
          fullName: emp.fullName,
          email: emp.email,
          isSalaried: emp.isSalaried,
          monthlySalaryMinor: emp.monthlySalaryMinor,
        },
      };
    })
  );
}

export async function requestSalaryAdvance(employeeId: string, amountMinor: bigint) {
  if (amountMinor <= 0n) throw new ValidationError('المبلغ يجب أن يكون أكبر من صفر');

  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, deletedAt: null },
  });
  if (!employee) throw new NotFoundError('Employee not found');
  if (!employee.isSalaried) {
    throw new ValidationError('طلبات السلفة متاحة لموظفي الراتب الثابت فقط');
  }
  if (!employee.monthlySalaryMinor) {
    throw new ValidationError('مبلغ السلفة لا يمكن أن يتجاوز الراتب الشهري');
  }

  const salaryCap = employee.monthlySalaryMinor;

  const advance = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM employees WHERE id = ${employeeId} FOR UPDATE`;

    const pending = await tx.salaryAdvance.findFirst({
      where: { employeeId, status: 'requested' },
    });
    if (pending) {
      throw new ValidationError('لديك طلب سلفة قيد المراجعة بالفعل');
    }

    const outstanding = await tx.salaryAdvance.findMany({
      where: { employeeId, status: { in: ['requested', 'approved'] } },
      select: { amountMinor: true },
    });
    const outstandingTotal = outstanding.reduce((s, a) => s + a.amountMinor, 0n);
    if (outstandingTotal + amountMinor > salaryCap) {
      throw new ValidationError(
        'مبلغ السلفة لا يمكن أن يتجاوز الراتب الشهري بعد خصم السلف المعتمدة وغير المخصومة'
      );
    }

    return tx.salaryAdvance.create({
      data: { employeeId, amountMinor },
    });
  });

  await createNotification({
    employeeId,
    type: 'system',
    title: 'طلب سلفة',
    body: `تم إرسال طلب سلفة بمبلغ ${formatMinor(amountMinor)}`,
    payload: { advanceId: advance.id },
  }).catch(() => {});

  // Notify admins
  const admins = await prisma.employee.findMany({
    where: {
      deletedAt: null,
      privileges: { some: { privilege: { code: 'admin' } } },
    },
    select: { id: true },
  });
  for (const admin of admins) {
    if (admin.id === employeeId) continue;
    await createNotification({
      employeeId: admin.id,
      type: 'system',
      title: 'طلب سلفة راتب',
      body: `${employee.fullName} طلب سلفة`,
      payload: { advanceId: advance.id },
    }).catch(() => {});
  }

  return advance;
}

export async function listSalaryAdvances(filters?: {
  status?: string;
  employeeId?: string;
}) {
  return prisma.salaryAdvance.findMany({
    where: {
      ...(filters?.status ? { status: filters.status as 'requested' | 'approved' | 'rejected' | 'deducted' } : {}),
      ...(filters?.employeeId ? { employeeId: filters.employeeId } : {}),
    },
    include: {
      employee: {
        select: {
          id: true,
          fullName: true,
          email: true,
          isSalaried: true,
          monthlySalaryMinor: true,
        },
      },
    },
    orderBy: { requestedAt: 'desc' },
  });
}

export async function transitionSalaryAdvance(
  id: string,
  toStatus: 'approved' | 'rejected',
  actorId: string
) {
  const advance = await prisma.salaryAdvance.findUnique({ where: { id } });
  if (!advance) throw new NotFoundError('Salary advance not found');
  assertTransition(ADVANCE_TRANSITIONS, advance.status, toStatus, 'salary_advance');

  if (toStatus === 'approved') {
    await creditWallet(
      advance.employeeId,
      advance.amountMinor,
      'adjustment',
      'سلفة راتب معتمدة',
      'salary_advance',
      advance.id,
      actorId
    );
  }

  const updated = await prisma.salaryAdvance.update({
    where: { id },
    data: { status: toStatus },
  });

  await writeAuditLog({
    actorType: 'employee',
    actorId,
    action: `salary_advance.${toStatus}`,
    entityType: 'salary_advance',
    entityId: id,
    newValue: { status: toStatus, amountMinor: advance.amountMinor.toString() },
  });

  await createNotification({
    employeeId: advance.employeeId,
    type: 'system',
    title: toStatus === 'approved' ? 'تم اعتماد السلفة' : 'تم رفض السلفة',
    body: toStatus === 'approved'
      ? 'تم إضافة مبلغ السلفة إلى محفظتك وسيُخصم من الراتب القادم'
      : 'تم رفض طلب السلفة',
    payload: { advanceId: id, status: toStatus },
  }).catch(() => {});

  return updated;
}

export async function processRefund(
  refundId: string,
  actorId: string
) {
  // Money first, in one transaction with the rows locked, so an over-refund is rejected
  // before anything changes and two clicks cannot process the same refund twice.
  const refund = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM refunds WHERE id = ${refundId} FOR UPDATE`;
    const current = await tx.refund.findUnique({ where: { id: refundId } });
    if (!current) throw new NotFoundError('Refund not found');
    assertTransition(REFUND_TRANSITIONS, current.status, 'processed', 'refund');

    await tx.$queryRaw`SELECT id FROM enrollments WHERE id = ${current.enrollmentId} FOR UPDATE`;
    const enrollment = await tx.enrollment.findUnique({ where: { id: current.enrollmentId } });
    if (!enrollment) throw new NotFoundError('Enrollment not found');

    // Never clamp silently: an over-refund must be rejected
    if (current.amountMinor > enrollment.amountPaidMinor) {
      throw new ValidationError('مبلغ الاسترداد يتجاوز المبلغ المدفوع المتبقي');
    }
    const newPaid = subtractMinor(enrollment.amountPaidMinor, current.amountMinor);
    const paymentStatus = paymentStatusFromAmounts(enrollment.totalPriceMinor, newPaid);
    if (enrollment.paymentStatus !== paymentStatus) {
      assertTransition(PAYMENT_TRANSITIONS, enrollment.paymentStatus, paymentStatus, 'payment');
    }

    await tx.enrollment.update({
      where: { id: enrollment.id },
      data: { amountPaidMinor: newPaid, paymentStatus },
    });
    await tx.refund.update({
      where: { id: refundId },
      data: { status: 'processed', processedAt: new Date() },
    });
    await transitionEntityStatus(
      {
        entityType: 'refund',
        entityId: refundId,
        fromStatus: current.status,
        toStatus: 'processed',
        triggeredByType: 'employee',
        triggeredById: actorId,
        actorType: 'employee',
        actorId,
        action: 'refund.processed',
      },
      tx
    );
    return current;
  });

  // Reverse teacher credit from the actual recorded session credit (not recomputed rates)
  if (refund.sessionId) {
    const credit = await prisma.walletTransaction.findFirst({
      where: {
        type: 'credit_hours',
        referenceType: 'course_session',
        referenceId: refund.sessionId,
      },
      include: { wallet: true },
    });
    if (credit && credit.amountMinor > 0n) {
      await reverseSessionCredit(
        refund.sessionId,
        credit.wallet.ownerId,
        credit.amountMinor,
        `Refund reversal — ${refund.reason}`,
        actorId
      );
    }
  }

  return refund;
}

async function refundableRemaining(enrollmentId: string, amountPaidMinor: bigint): Promise<bigint> {
  // Processed refunds are already subtracted from amountPaidMinor, so only open ones count here.
  const prior = await prisma.refund.aggregate({
    where: {
      enrollmentId,
      status: { in: ['initiated', 'under_review', 'approved'] },
    },
    _sum: { amountMinor: true },
  });
  const priorSum = prior._sum.amountMinor ?? 0n;
  return amountPaidMinor - priorSum;
}

export async function initiateRefund(
  enrollmentId: string,
  amountMinor: bigint,
  reason: string,
  initiatedById: string,
  sessionId?: string
) {
  if (amountMinor <= 0n) throw new ValidationError('المبلغ يجب أن يكون أكبر من صفر');

  const enrollment = await prisma.enrollment.findUnique({ where: { id: enrollmentId } });
  if (!enrollment) throw new NotFoundError('Enrollment not found');

  const trimmedReason = typeof reason === 'string' ? reason.trim() : '';
  if (!trimmedReason) throw new ValidationError('اكتب سبب الاسترداد');

  const remaining = await refundableRemaining(enrollmentId, enrollment.amountPaidMinor);
  if (amountMinor > remaining) {
    throw new ValidationError('مبلغ الاسترداد يتجاوز المبلغ المدفوع القابل للاسترداد');
  }

  const refund = await prisma.refund.create({
    data: {
      enrollmentId,
      amountMinor,
      reason: trimmedReason,
      initiatedById,
      sessionId,
    },
  });
  await writeAuditLog({
    actorType: 'employee',
    actorId: initiatedById,
    action: 'refund.initiated',
    entityType: 'refund',
    entityId: refund.id,
    newValue: { enrollmentId, amountMinor: amountMinor.toString(), reason: trimmedReason },
  });
  return refund;
}

export async function listRefunds(filters?: { status?: RefundStatus; studentId?: string }) {
  return prisma.refund.findMany({
    where: {
      ...(filters?.status ? { status: filters.status } : {}),
      ...(filters?.studentId ? { enrollment: { studentId: filters.studentId } } : {}),
    },
    include: {
      initiatedBy: { select: { id: true, fullName: true } },
      enrollment: {
        select: {
          id: true,
          amountPaidMinor: true,
          totalPriceMinor: true,
          student: { select: { id: true, fullName: true, phone: true } },
          course: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 300,
  });
}

export async function transitionRefund(
  id: string,
  toStatus: RefundStatus,
  actorId: string
) {
  const refund = await prisma.refund.findUnique({ where: { id } });
  if (!refund) throw new NotFoundError('Refund not found');

  assertTransition(REFUND_TRANSITIONS, refund.status, toStatus, 'refund');

  if (toStatus === 'processed') {
    return processRefund(id, actorId);
  }

  await prisma.refund.update({ where: { id }, data: { status: toStatus } });
  await transitionEntityStatus({
    entityType: 'refund',
    entityId: id,
    fromStatus: refund.status,
    toStatus,
    triggeredByType: 'employee',
    triggeredById: actorId,
    actorType: 'employee',
    actorId,
    action: 'refund.status_change',
  });
  return refund;
}

export async function getWalletTransactions(walletId: string) {
  return prisma.walletTransaction.findMany({
    where: { walletId },
    orderBy: { createdAt: 'desc' },
  });
}

export { toMinor, paymentStatusFromAmounts };
