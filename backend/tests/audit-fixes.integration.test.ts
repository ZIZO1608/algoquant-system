import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { resetDb, disconnectTestDb } from './helpers/db.js';
import {
  createEmployee,
  createCourse,
  createEnrollment,
  createExpenseCategory,
} from './helpers/factories.js';
import {
  creditWallet,
  debitWallet,
  requestWithdrawal,
  initiateRefund,
  requestSalaryAdvance,
  transitionSalaryAdvance,
  getOrCreateWallet,
} from '../src/services/wallet.service.js';
import {
  createExpense,
  createOwnerWithdrawal,
  processDueSalaries,
  computeStakeholderProfitShare,
  approveStakeholderProfitShare,
} from '../src/services/finance.service.js';
import {
  recordPayment,
  voidPayment,
  recordAttendance,
} from '../src/services/student.service.js';
import { getCourse, getTask, transitionTask } from '../src/services/course.service.js';
import { getFileDownloadUrl } from '../src/services/file.service.js';
import { login, refresh } from '../src/services/auth.service.js';
import { ValidationError, ForbiddenError, UnauthorizedError } from '../src/lib/errors.js';
import { assertTransition, ADVANCE_TRANSITIONS, PAYROLL_TRANSITIONS } from '../src/state-machines/transitions.js';
import { ConflictError } from '../src/lib/errors.js';

describe('Phase 1 audit fixes (integration)', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  it('FIN-1: concurrent debits cannot overdraft the same wallet', async () => {
    const emp = await createEmployee({ privileges: ['instructor'] });
    await creditWallet(emp.id, 100n, 'adjustment', 'seed');
    const results = await Promise.allSettled([
      debitWallet(emp.id, 80n, 'adjustment', 'a'),
      debitWallet(emp.id, 80n, 'adjustment', 'b'),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    const wallet = await getOrCreateWallet(emp.id);
    expect(wallet.balanceMinor).toBe(20n);
  });

  it('FIN-2: rejects non-positive withdrawal amounts', async () => {
    const emp = await createEmployee({});
    await creditWallet(emp.id, 1000n, 'adjustment', 'seed');
    await expect(requestWithdrawal(emp.id, 0n, 'x', emp.id)).rejects.toThrow(ValidationError);
    await expect(requestWithdrawal(emp.id, -5n, 'x', emp.id)).rejects.toThrow(ValidationError);
  });

  it('FIN-3: rejects non-positive expense and owner withdrawal', async () => {
    const admin = await createEmployee({ privileges: ['admin'] });
    const cat = await createExpenseCategory();
    await expect(
      createExpense({
        categoryId: cat.id,
        amountMinor: 0n,
        reason: 'x',
        spentAt: new Date(),
        createdById: admin.id,
      })
    ).rejects.toThrow(ValidationError);
    await expect(
      createOwnerWithdrawal({
        amountMinor: -10n,
        reason: 'x',
        spentAt: new Date(),
        createdById: admin.id,
      })
    ).rejects.toThrow(ValidationError);
  });

  it('FIN-4: rejects over-refund beyond paid minus prior refunds', async () => {
    const admin = await createEmployee({});
    const course = await createCourse();
    const enrollment = await createEnrollment({
      courseId: course.id,
      amountPaidMinor: 100n,
      totalPriceMinor: 500n,
    });
    await expect(
      initiateRefund(enrollment.id, 150n, 'too much', admin.id)
    ).rejects.toThrow(ValidationError);
  });

  it('FIN-5: profit share credits only once per period (after approve)', async () => {
    const stakeholder = await createEmployee({ privileges: ['admin'] });
    const admin = await createEmployee({ email: 'payer@test.local', privileges: ['admin'] });
    const course = await createCourse();
    const enrollment = await createEnrollment({
      courseId: course.id,
      totalPriceMinor: 1_000_000n,
    });
    await recordPayment(enrollment.id, 1_000_000n, admin.id);

    await prisma.settingsFinance.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton' },
      update: {},
    });
    await prisma.stakeholderRule.deleteMany({});
    await prisma.stakeholderRule.create({
      data: { employeeId: stakeholder.id, percent: 10 },
    });

    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const pending = await computeStakeholderProfitShare(period);
    expect(pending.status).toBe('pending');

    const beforeApprove = await prisma.walletTransaction.count({
      where: { type: 'credit_profit_share', referenceId: period },
    });
    expect(beforeApprove).toBe(0);

    await approveStakeholderProfitShare(period, admin.id);
    await expect(approveStakeholderProfitShare(period, admin.id)).rejects.toThrow(ConflictError);

    const wallet = await getOrCreateWallet(stakeholder.id);
    const credits = await prisma.walletTransaction.findMany({
      where: {
        walletId: wallet.id,
        type: 'credit_profit_share',
        referenceId: period,
      },
    });
    expect(credits).toHaveLength(1);
  });

  it('FIN-6: stacked advances respect salary cap and carry shortfall', async () => {
    const emp = await createEmployee({
      privileges: ['instructor'],
      monthlySalaryMinor: 1000n,
      salaryDayOfMonth: 15,
    });
    const a1 = await requestSalaryAdvance(emp.id, 600n);
    await transitionSalaryAdvance(a1.id, 'approved', emp.id);
    await expect(requestSalaryAdvance(emp.id, 500n)).rejects.toThrow(ValidationError);

    // Simulate historical/approved advances that now exceed reduced salary
    await prisma.employee.update({
      where: { id: emp.id },
      data: { monthlySalaryMinor: 500n },
    });
    await prisma.salaryAdvance.create({
      data: { employeeId: emp.id, amountMinor: 400n, status: 'approved' },
    });

    const result = await processDueSalaries(new Date(2026, 5, 15));
    expect(result.paid).toBeGreaterThanOrEqual(1);

    const advances = await prisma.salaryAdvance.findMany({
      where: { employeeId: emp.id },
      orderBy: { requestedAt: 'asc' },
    });
    // Salary 500: first advance 600 does not fit (stays approved); second 400 fits → deducted
    expect(advances[0].status).toBe('approved');
    expect(advances[1].status).toBe('deducted');
  });

  it('FIN-6: concurrent advance requests cannot both pass the salary cap', async () => {
    const emp = await createEmployee({
      privileges: ['instructor'],
      monthlySalaryMinor: 1000n,
      email: 'race-adv@test.local',
    });
    const first = await requestSalaryAdvance(emp.id, 400n);
    await transitionSalaryAdvance(first.id, 'approved', emp.id);

    // Individually 400 fits remaining 600; together 800 would exceed remaining after first lands
    const results = await Promise.allSettled([
      requestSalaryAdvance(emp.id, 400n),
      requestSalaryAdvance(emp.id, 400n),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    const requested = await prisma.salaryAdvance.findMany({
      where: { employeeId: emp.id, status: 'requested' },
    });
    expect(requested).toHaveLength(1);
  });

  it('FIN-7: rejects non-positive payment', async () => {
    const admin = await createEmployee({});
    const course = await createCourse();
    const enrollment = await createEnrollment({ courseId: course.id });
    await expect(recordPayment(enrollment.id, 0n, admin.id)).rejects.toThrow(ValidationError);
    await expect(recordPayment(enrollment.id, -1n, admin.id)).rejects.toThrow(ValidationError);
  });

  it('FIN-9: rejects overpayment past total', async () => {
    const admin = await createEmployee({});
    const course = await createCourse();
    const enrollment = await createEnrollment({
      courseId: course.id,
      totalPriceMinor: 100n,
      amountPaidMinor: 80n,
    });
    await expect(recordPayment(enrollment.id, 50n, admin.id)).rejects.toThrow(ValidationError);
  });

  it('FIN-10: void payment reverses enrollment totals', async () => {
    const admin = await createEmployee({ privileges: ['admin', 'accountant'] });
    const course = await createCourse();
    const enrollment = await createEnrollment({
      courseId: course.id,
      totalPriceMinor: 200n,
    });
    await recordPayment(enrollment.id, 200n, admin.id);
    const payment = await prisma.studentPayment.findFirstOrThrow({
      where: { enrollmentId: enrollment.id },
    });
    const updated = await voidPayment(payment.id, admin.id, 'mis-entry');
    expect(updated.amountPaidMinor).toBe(0n);
    expect(updated.paymentStatus).toBe('unpaid');
    await expect(voidPayment(payment.id, admin.id, 'again')).rejects.toThrow(ValidationError);
  });

  it('FIN-8: advance and payroll transition maps reject invalid moves', () => {
    expect(() => assertTransition(ADVANCE_TRANSITIONS, 'rejected', 'approved', 'salary_advance')).toThrow(
      ConflictError
    );
    expect(() => assertTransition(PAYROLL_TRANSITIONS, 'completed', 'pending', 'payroll_run')).toThrow(
      ConflictError
    );
  });

  it('AUTH-2: cross-specialty task access denied', async () => {
    const sales = await createEmployee({ privileges: ['sales'] });
    const course = await createCourse();
    const task = await prisma.task.create({
      data: {
        courseId: course.id,
        title: 'Media task',
        specialty: 'media',
        phaseKey: 'pre',
      },
    });
    await expect(getTask(task.id, ['sales'])).rejects.toThrow(ForbiddenError);
    await expect(
      transitionTask(task.id, 'in_progress', sales.id, 'employee', ['sales'])
    ).rejects.toThrow(ForbiddenError);
  });

  it('AUTH-3: uploader can download own general file; others cannot; unassigned instructor blocked on course file', async () => {
    const uploader = await createEmployee({ privileges: ['sales'], email: 'uploader@test.local' });
    const other = await createEmployee({ privileges: ['sales'], email: 'other@test.local' });
    const assigned = await createEmployee({ privileges: ['instructor'], email: 'inst-a@test.local' });
    const unassigned = await createEmployee({ privileges: ['instructor'], email: 'inst-b@test.local' });
    const course = await createCourse({ primaryInstructorId: assigned.id });

    const generalFile = await prisma.fileObject.create({
      data: {
        storageKey: 'general/own',
        bucket: 'algo-quant',
        mime: 'application/pdf',
        size: 10,
        uploadedById: uploader.id,
        purpose: 'general',
        entityType: null,
        entityId: null,
      },
    });

    // Allowed for uploader: must not be Forbidden (S3 may still be unavailable in test env)
    try {
      await getFileDownloadUrl(generalFile.id, ['sales'], uploader.id);
    } catch (err) {
      expect(err).not.toBeInstanceOf(ForbiddenError);
    }
    await expect(getFileDownloadUrl(generalFile.id, ['sales'], other.id)).rejects.toThrow(
      ForbiddenError
    );

    const courseFile = await prisma.fileObject.create({
      data: {
        storageKey: 'course/materials/x',
        bucket: 'algo-quant',
        mime: 'application/pdf',
        size: 10,
        uploadedById: assigned.id,
        purpose: 'materials',
        entityType: 'course',
        entityId: course.id,
      },
    });
    await expect(
      getFileDownloadUrl(courseFile.id, ['instructor'], unassigned.id)
    ).rejects.toThrow(ForbiddenError);
  });

  it('AUTH-4: unassigned instructor cannot mark attendance', async () => {
    const assigned = await createEmployee({ privileges: ['instructor'], email: 'a@test.local' });
    const other = await createEmployee({ privileges: ['instructor'], email: 'b@test.local' });
    const course = await createCourse({ primaryInstructorId: assigned.id });
    const session = await prisma.courseSession.create({
      data: {
        courseId: course.id,
        sessionNumber: 1,
        scheduledAt: new Date(),
        durationMinutes: 90,
      },
    });
    const student = await prisma.student.create({ data: { fullName: 'S' } });
    await expect(
      recordAttendance(session.id, [{ studentId: student.id, status: 'present' }], other.id, [
        'instructor',
      ])
    ).rejects.toThrow(ForbiddenError);
  });

  it('AUTH-6: operation getCourse hides instructor pay fields', async () => {
    const instructor = await createEmployee({
      privileges: ['instructor'],
      email: 'pay-inst@test.local',
    });
    const course = await createCourse({ primaryInstructorId: instructor.id });
    await prisma.courseInstructor.create({
      data: {
        courseId: course.id,
        employeeId: instructor.id,
        payPercent: 50,
        hourlyRateMinor: 1000n,
      },
    });
    const asOps = await getCourse(course.id, ['operation']);
    const opsInstructor = asOps.instructors[0] as Record<string, unknown>;
    expect(opsInstructor).toBeDefined();
    expect(opsInstructor).not.toHaveProperty('payPercent');
    expect(opsInstructor).not.toHaveProperty('hourlyRateMinor');

    const asAdmin = await getCourse(course.id, ['admin']);
    const adminInstructor = asAdmin.instructors[0] as Record<string, unknown>;
    expect(adminInstructor).toHaveProperty('payPercent');
    expect(adminInstructor).toHaveProperty('hourlyRateMinor');
  });

  it('AUTH-9: refresh rotates token and reuse revokes session', async () => {
    const emp = await createEmployee({ email: 'rotate@test.local' });
    const loggedIn = await login('rotate@test.local', 'password123');
    const rotated = await refresh(loggedIn.refreshToken);
    expect(rotated.refreshToken).toBeTruthy();
    expect(rotated.refreshToken).not.toBe(loggedIn.refreshToken);

    await expect(refresh(loggedIn.refreshToken)).rejects.toThrow(UnauthorizedError);

    // After reuse detection, the new token should also be revoked
    await expect(refresh(rotated.refreshToken)).rejects.toThrow(UnauthorizedError);
  });
});
