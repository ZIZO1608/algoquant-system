import { prisma } from '../lib/prisma.js';
import { ConflictError, NotFoundError, ValidationError } from '../lib/errors.js';
import { writeAuditLog } from './audit.service.js';
import {
  assertTransition,
  PAYROLL_TRANSITIONS,
  PROFIT_SHARE_TRANSITIONS,
} from '../state-machines/transitions.js';
import { serializeBigInt } from '../lib/money.js';

type ProfitShareLine = { employeeId: string; percent: number; amountMinor: string };

export async function createExpense(data: {
  categoryId: string;
  amountMinor: bigint;
  reason: string;
  courseId?: string;
  spentAt: Date;
  createdById: string;
}) {
  if (data.amountMinor <= 0n) throw new ValidationError('المبلغ يجب أن يكون أكبر من صفر');
  const expense = await prisma.expense.create({ data });
  await writeAuditLog({
    actorType: 'employee',
    actorId: data.createdById,
    action: 'expense.created',
    entityType: 'expense',
    entityId: expense.id,
    newValue: data,
  });
  return expense;
}

export async function listExpenses(filters?: { categoryId?: string; courseId?: string }) {
  return prisma.expense.findMany({
    where: {
      deletedAt: null,
      ...(filters?.categoryId ? { categoryId: filters.categoryId } : {}),
      ...(filters?.courseId ? { courseId: filters.courseId } : {}),
    },
    include: {
      category: true,
      course: { select: { id: true, name: true } },
      createdBy: { select: { id: true, fullName: true } },
    },
    orderBy: { spentAt: 'desc' },
  });
}

/**
 * Recent student payments. Income is derived from these, so the finance page can show
 * what the total is made of instead of a bare number with nowhere to go.
 */
export async function listPayments(limit = 200) {
  return prisma.studentPayment.findMany({
    where: { voidedAt: null },
    take: limit,
    include: {
      enrollment: {
        select: {
          id: true,
          student: { select: { id: true, fullName: true } },
          course: { select: { id: true, name: true } },
        },
      },
      receivedBy: { select: { id: true, fullName: true } },
    },
    orderBy: { paidAt: 'desc' },
  });
}

export async function softDeleteExpense(id: string, actorId: string) {
  await prisma.expense.update({ where: { id }, data: { deletedAt: new Date() } });
  await writeAuditLog({
    actorType: 'employee',
    actorId,
    action: 'expense.deleted',
    entityType: 'expense',
    entityId: id,
  });
}

export async function createOwnerWithdrawal(data: {
  amountMinor: bigint;
  reason: string;
  spentAt: Date;
  createdById: string;
}) {
  if (data.amountMinor <= 0n) throw new ValidationError('المبلغ يجب أن يكون أكبر من صفر');
  const w = await prisma.ownerWithdrawal.create({ data });
  await writeAuditLog({
    actorType: 'employee',
    actorId: data.createdById,
    action: 'owner_withdrawal.created',
    entityType: 'owner_withdrawal',
    entityId: w.id,
    newValue: data,
  });
  return w;
}

export async function listOwnerWithdrawals() {
  return prisma.ownerWithdrawal.findMany({
    include: { createdBy: { select: { fullName: true } } },
    orderBy: { spentAt: 'desc' },
  });
}

export async function getPnLReport(from: Date, to: Date) {
  const payments = await prisma.studentPayment.findMany({
    where: { paidAt: { gte: from, lte: to }, voidedAt: null },
  });
  const paymentIncome = payments.reduce((s, p) => s + p.amountMinor, 0n);

  const refunds = await prisma.refund.findMany({
    where: {
      status: 'processed',
      processedAt: { gte: from, lte: to },
    },
    select: { amountMinor: true },
  });
  const refundTotal = refunds.reduce((s, r) => s + r.amountMinor, 0n);
  const totalIncome = paymentIncome - refundTotal;

  const expenses = await prisma.expense.findMany({
    where: { spentAt: { gte: from, lte: to }, deletedAt: null },
  });
  const totalExpenses = expenses.reduce((s, e) => s + e.amountMinor, 0n);

  const ownerWithdrawals = await prisma.ownerWithdrawal.findMany({
    where: { spentAt: { gte: from, lte: to } },
  });
  const totalOwner = ownerWithdrawals.reduce((s, w) => s + w.amountMinor, 0n);

  const laborTx = await prisma.walletTransaction.findMany({
    where: {
      createdAt: { gte: from, lte: to },
      type: { in: ['credit_salary', 'credit_hours', 'credit_profit_share'] },
    },
    select: { amountMinor: true },
  });
  const laborCost = laborTx.reduce((s, t) => s + t.amountMinor, 0n);

  return {
    income: totalIncome.toString(),
    refunds: refundTotal.toString(),
    expenses: totalExpenses.toString(),
    ownerWithdrawals: totalOwner.toString(),
    laborCost: laborCost.toString(),
    netProfit: (totalIncome - totalExpenses - totalOwner - laborCost).toString(),
    period: { from, to },
  };
}

export async function getCashflowReport(months = 6) {
  const results = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
    const pnl = await getPnLReport(start, end);
    results.push({
      month: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
      ...pnl,
    });
  }
  return results;
}

export async function getCourseCostReport(courseId: string) {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) throw new NotFoundError('Course not found');

  const payments = await prisma.studentPayment.findMany({
    where: { enrollment: { courseId }, voidedAt: null },
  });
  const paymentRevenue = payments.reduce((s, p) => s + p.amountMinor, 0n);

  const refunds = await prisma.refund.findMany({
    where: {
      status: 'processed',
      enrollment: { courseId },
    },
    select: { amountMinor: true },
  });
  const refundTotal = refunds.reduce((s, r) => s + r.amountMinor, 0n);
  const revenue = paymentRevenue - refundTotal;

  const expenses = await prisma.expense.findMany({
    where: { courseId, deletedAt: null },
  });
  const expenseTotal = expenses.reduce((s, e) => s + e.amountMinor, 0n);

  const sessions = await prisma.courseSession.findMany({
    where: { courseId },
    select: { id: true },
  });
  const sessionIds = sessions.map((s) => s.id);

  let instructorPayMinor = 0n;
  if (sessionIds.length > 0) {
    const credits = await prisma.walletTransaction.findMany({
      where: {
        type: 'credit_hours',
        referenceType: 'course_session',
        referenceId: { in: sessionIds },
      },
      select: { amountMinor: true },
    });
    const reversals = await prisma.walletTransaction.findMany({
      where: {
        type: 'reversal_session_cancel',
        referenceType: 'course_session',
        referenceId: { in: sessionIds },
      },
      select: { amountMinor: true },
    });
    const creditSum = credits.reduce((s, t) => s + t.amountMinor, 0n);
    // Reversals are stored as negative amountMinor
    const reversalSum = reversals.reduce((s, t) => s + t.amountMinor, 0n);
    instructorPayMinor = creditSum + reversalSum;
    if (instructorPayMinor < 0n) instructorPayMinor = 0n;
  }

  return {
    courseId,
    courseName: course.name,
    revenue: revenue.toString(),
    attributedExpenses: expenseTotal.toString(),
    instructorPayMinor: instructorPayMinor.toString(),
  };
}

function periodKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function lastDayOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

/** True when today is this employee's configured salary payday (clamped to month length). */
export function isSalaryDueToday(salaryDayOfMonth: number | null | undefined, today = new Date()) {
  const day = Math.min(28, Math.max(1, Number(salaryDayOfMonth) || 1));
  const todayDay = today.getDate();
  const last = lastDayOfMonth(today);
  if (day <= last) return todayDay === day;
  // e.g. day 28 in a shorter month — pay on the last calendar day
  return todayDay === last;
}

/**
 * Credit fixed salaries for employees whose payday is today.
 * Idempotent per employee+month via wallet transaction reference.
 * Advances are deducted FIFO; uncovered advances stay approved (carry forward).
 */
export async function processDueSalaries(today = new Date()) {
  const period = periodKey(today);
  const employees = await prisma.employee.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      isSalaried: true,
    },
  });

  const due = employees.filter(
    (emp) =>
      emp.monthlySalaryMinor != null &&
      emp.monthlySalaryMinor > 0n &&
      isSalaryDueToday(emp.salaryDayOfMonth, today)
  );
  if (due.length === 0) return { period, paid: 0, skipped: 0 };

  const runKey = `${period}-d${String(today.getDate()).padStart(2, '0')}`;
  let run = await prisma.payrollRun.findUnique({ where: { periodYyyyMm: runKey } });
  if (!run) {
    run = await prisma.payrollRun.create({
      data: { periodYyyyMm: runKey, status: 'pending' },
    });
  }

  let paid = 0;
  let skipped = 0;
  const { creditWallet, getOrCreateWallet } = await import('./wallet.service.js');
  const { assertTransition: assertAdv, ADVANCE_TRANSITIONS } = await import(
    '../state-machines/transitions.js'
  );

  try {
    for (const emp of due) {
      const refId = `${period}:${emp.id}`;
      const outcome = await prisma.$transaction(async (tx) => {
        const wallet = await getOrCreateWallet(emp.id, tx);
        const already = await tx.walletTransaction.findFirst({
          where: {
            walletId: wallet.id,
            type: 'credit_salary',
            referenceType: 'payroll_period',
            referenceId: refId,
          },
        });
        if (already) return 'skipped' as const;

        const advances = await tx.salaryAdvance.findMany({
          where: {
            employeeId: emp.id,
            status: 'approved',
            deductedPayrollMonth: null,
          },
          orderBy: { requestedAt: 'asc' },
        });

        const salary = emp.monthlySalaryMinor ?? 0n;
        let remaining = salary;
        for (const adv of advances) {
          if (adv.amountMinor <= remaining) {
            assertAdv(ADVANCE_TRANSITIONS, adv.status, 'deducted', 'salary_advance');
            await tx.salaryAdvance.update({
              where: { id: adv.id },
              data: { status: 'deducted', deductedPayrollMonth: period },
            });
            remaining -= adv.amountMinor;
          }
          // else leave approved — carry shortfall forward
        }

        if (remaining > 0n) {
          await creditWallet(
            emp.id,
            remaining,
            'credit_salary',
            `راتب ${period}`,
            'payroll_period',
            refId,
            undefined,
            tx
          );
        }

        return 'paid' as const;
      });

      if (outcome === 'skipped') skipped += 1;
      else paid += 1;
    }

    if (run.status === 'pending') {
      assertTransition(PAYROLL_TRANSITIONS, run.status, 'completed', 'payroll_run');
      await prisma.payrollRun.update({
        where: { id: run.id },
        data: { status: 'completed', ranAt: new Date() },
      });
    }
  } catch (err) {
    const latest = await prisma.payrollRun.findUnique({ where: { id: run.id } });
    if (latest?.status === 'pending') {
      assertTransition(PAYROLL_TRANSITIONS, latest.status, 'failed', 'payroll_run');
      await prisma.payrollRun.update({
        where: { id: run.id },
        data: { status: 'failed' },
      });
    }
    throw err;
  }

  return { period, paid, skipped, runId: run.id };
}

/** Backfill helper: process every payday (1–28) for the given month. */
export async function runMonthlyPayroll(periodYyyyMm: string) {
  const [y, m] = periodYyyyMm.split('-').map(Number);
  let paid = 0;
  for (let day = 1; day <= 28; day++) {
    const result = await processDueSalaries(new Date(y, m - 1, day));
    paid += result.paid;
  }
  return { periodYyyyMm, paid };
}

export async function getProfitShareRun(periodYyyyMm: string) {
  const run = await prisma.profitShareRun.findUnique({ where: { periodYyyyMm } });
  if (!run) throw new NotFoundError('Profit share run not found');
  return serializeBigInt(run);
}

/** Compute (or recompute if rejected) a pending profit-share run — does not credit wallets. */
export async function computeStakeholderProfitShare(periodYyyyMm: string) {
  const existing = await prisma.profitShareRun.findUnique({ where: { periodYyyyMm } });
  if (existing?.status === 'approved') {
    throw new ConflictError('تم اعتماد توزيع الأرباح لهذه الفترة بالفعل');
  }

  const [year, month] = periodYyyyMm.split('-').map(Number);
  const from = new Date(year, month - 1, 1);
  const to = new Date(year, month, 0, 23, 59, 59);
  const pnl = await getPnLReport(from, to);
  const netProfit = BigInt(pnl.netProfit);
  const laborCost = BigInt(pnl.laborCost);

  const rules = await prisma.stakeholderRule.findMany();

  const lines: ProfitShareLine[] = [];
  if (netProfit > 0n) {
    for (const rule of rules) {
      const share = (netProfit * BigInt(Math.round(rule.percent))) / 100n;
      if (share > 0n) {
        lines.push({
          employeeId: rule.employeeId,
          percent: rule.percent,
          amountMinor: share.toString(),
        });
      }
    }
  }

  const data = {
    status: 'pending' as const,
    netProfitMinor: netProfit,
    laborCostMinor: laborCost,
    linesJson: lines,
    computedAt: new Date(),
    decidedAt: null,
    decidedById: null,
  };

  const run = existing
    ? await prisma.profitShareRun.update({ where: { id: existing.id }, data })
    : await prisma.profitShareRun.create({
        data: { periodYyyyMm, ...data },
      });

  return serializeBigInt(run);
}

export async function approveStakeholderProfitShare(periodYyyyMm: string, actorId: string) {
  const run = await prisma.profitShareRun.findUnique({ where: { periodYyyyMm } });
  if (!run) throw new NotFoundError('Profit share run not found');
  assertTransition(PROFIT_SHARE_TRANSITIONS, run.status, 'approved', 'profit_share_run');

  const lines = (run.linesJson as ProfitShareLine[]) ?? [];
  const { creditWallet, getOrCreateWallet } = await import('./wallet.service.js');
  const results = [];

  for (const line of lines) {
    const amount = BigInt(line.amountMinor);
    if (amount <= 0n) continue;

    const wallet = await getOrCreateWallet(line.employeeId);
    const already = await prisma.walletTransaction.findFirst({
      where: {
        walletId: wallet.id,
        type: 'credit_profit_share',
        referenceType: 'payroll_run',
        referenceId: periodYyyyMm,
      },
    });
    if (already) {
      results.push({ employeeId: line.employeeId, amount: line.amountMinor, skipped: true });
      continue;
    }

    await creditWallet(
      line.employeeId,
      amount,
      'credit_profit_share',
      `Profit share ${periodYyyyMm} (${line.percent}%)`,
      'payroll_run',
      periodYyyyMm
    );
    results.push({ employeeId: line.employeeId, amount: line.amountMinor });
  }

  const updated = await prisma.profitShareRun.update({
    where: { id: run.id },
    data: {
      status: 'approved',
      decidedAt: new Date(),
      decidedById: actorId,
    },
  });

  await writeAuditLog({
    actorType: 'employee',
    actorId,
    action: 'profit_share.approved',
    entityType: 'profit_share_run',
    entityId: run.id,
    newValue: { periodYyyyMm, results },
  });

  return { run: serializeBigInt(updated), results };
}

export async function rejectStakeholderProfitShare(periodYyyyMm: string, actorId: string) {
  const run = await prisma.profitShareRun.findUnique({ where: { periodYyyyMm } });
  if (!run) throw new NotFoundError('Profit share run not found');
  assertTransition(PROFIT_SHARE_TRANSITIONS, run.status, 'rejected', 'profit_share_run');

  const updated = await prisma.profitShareRun.update({
    where: { id: run.id },
    data: {
      status: 'rejected',
      decidedAt: new Date(),
      decidedById: actorId,
    },
  });

  await writeAuditLog({
    actorType: 'employee',
    actorId,
    action: 'profit_share.rejected',
    entityType: 'profit_share_run',
    entityId: run.id,
    newValue: { periodYyyyMm },
  });

  return serializeBigInt(updated);
}

/** Scheduler entry: compute pending run only — never auto-credits. */
export async function runStakeholderProfitShare(periodYyyyMm: string) {
  return computeStakeholderProfitShare(periodYyyyMm);
}
