import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { resetDb, disconnectTestDb } from './helpers/db.js';
import {
  createEmployee,
  createCourse,
  createEnrollment,
} from './helpers/factories.js';
import {
  creditWallet,
  creditTeacherForSession,
  initiateRefund,
  transitionRefund,
} from '../src/services/wallet.service.js';
import {
  getPnLReport,
  computeStakeholderProfitShare,
  approveStakeholderProfitShare,
  rejectStakeholderProfitShare,
  runStakeholderProfitShare,
} from '../src/services/finance.service.js';
import {
  recordPayment,
  voidPayment,
  recordAttendance,
} from '../src/services/student.service.js';
import { deleteLeadSource } from '../src/services/settings.service.js';
import { convertLeadWithPayment } from '../src/services/lead.service.js';
import { ConflictError, ValidationError } from '../src/lib/errors.js';
import {
  assertTransition,
  PROFIT_SHARE_TRANSITIONS,
} from '../src/state-machines/transitions.js';

describe('Phase 2 Batch 1 (integration)', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  it('P2-C1: P&L netProfit subtracts laborCost', async () => {
    const admin = await createEmployee({ privileges: ['admin'] });
    const instructor = await createEmployee({
      privileges: ['instructor'],
      email: 'labor@test.local',
    });
    const course = await createCourse();
    const enrollment = await createEnrollment({
      courseId: course.id,
      totalPriceMinor: 1_000_000n,
    });
    await recordPayment(enrollment.id, 1_000_000n, admin.id);
    await creditWallet(instructor.id, 200_000n, 'credit_hours', 'session pay', 'course_session', 'sess-1');

    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const pnl = await getPnLReport(from, to);
    expect(pnl.laborCost).toBe('200000');
    expect(pnl.netProfit).toBe((1_000_000n - 200_000n).toString());
  });

  it('P2-C1: compute pending; approve credits once; second approve / reject-approved rejected', async () => {
    const stakeholder = await createEmployee({ privileges: ['admin'], email: 'sh@test.local' });
    const admin = await createEmployee({ privileges: ['admin'], email: 'adm@test.local' });
    const course = await createCourse();
    const enrollment = await createEnrollment({
      courseId: course.id,
      totalPriceMinor: 1_000_000n,
    });
    await recordPayment(enrollment.id, 1_000_000n, admin.id);
    await creditWallet(
      (await createEmployee({ email: 'lab2@test.local' })).id,
      100_000n,
      'credit_salary',
      'salary'
    );

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

    const cronResult = await runStakeholderProfitShare(period);
    expect(cronResult.status).toBe('pending');
    expect(
      await prisma.walletTransaction.count({
        where: { type: 'credit_profit_share', referenceId: period },
      })
    ).toBe(0);

    const run = await computeStakeholderProfitShare(period);
    expect(run.status).toBe('pending');
    // net = income 1e6 - labor 1e5 = 900_000; 10% = 90_000
    const lines = run.linesJson as { amountMinor: string }[];
    expect(lines[0]?.amountMinor).toBe('90000');

    await approveStakeholderProfitShare(period, admin.id);
    await expect(approveStakeholderProfitShare(period, admin.id)).rejects.toThrow(ConflictError);
    await expect(rejectStakeholderProfitShare(period, admin.id)).rejects.toThrow(ConflictError);

    expect(() =>
      assertTransition(PROFIT_SHARE_TRANSITIONS, 'approved', 'approved', 'profit_share_run')
    ).toThrow(ConflictError);

    const credits = await prisma.walletTransaction.findMany({
      where: { type: 'credit_profit_share', referenceId: period },
    });
    expect(credits).toHaveLength(1);
    expect(credits[0].amountMinor).toBe(90_000n);
  });

  it('P2-C2: lead source delete blocks system and sources with leads', async () => {
    const admin = await createEmployee({});
    const system = await prisma.leadSource.create({
      data: { code: 'bot', labelAr: 'بوت', isSystem: true },
    });
    await expect(deleteLeadSource(system.id, admin.id)).rejects.toThrow(ConflictError);

    const withLeads = await prisma.leadSource.create({
      data: { code: 'ads', labelAr: 'إعلانات', isSystem: false },
    });
    await prisma.lead.create({
      data: {
        fullName: 'L1',
        phone: '0911111111',
        sourceId: withLeads.id,
        status: 'new',
      },
    });
    await expect(deleteLeadSource(withLeads.id, admin.id)).rejects.toThrow(ConflictError);
    expect(await prisma.lead.count({ where: { sourceId: withLeads.id } })).toBe(1);

    const empty = await prisma.leadSource.create({
      data: { code: 'empty', labelAr: 'فارغ', isSystem: false },
    });
    await deleteLeadSource(empty.id, admin.id);
    expect(await prisma.leadSource.findUnique({ where: { id: empty.id } })).toBeNull();
  });

  it('P2-C3: refund reversal uses recorded credit_hours amount', async () => {
    const admin = await createEmployee({ privileges: ['admin'] });
    const instructor = await createEmployee({
      privileges: ['instructor'],
      email: 'teacher@test.local',
    });
    const course = await createCourse({
      primaryInstructorId: instructor.id,
      priceMinor: 1_000_000n,
      sessionCount: 2,
    });
    await prisma.courseInstructor.create({
      data: {
        courseId: course.id,
        employeeId: instructor.id,
        payPercent: 40,
      },
    });
    await prisma.settingsFinance.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', defaultTeacherPayPercent: 50 },
      update: { defaultTeacherPayPercent: 50 },
    });

    const session = await prisma.courseSession.create({
      data: {
        courseId: course.id,
        sessionNumber: 1,
        scheduledAt: new Date(),
        durationMinutes: 90,
        status: 'scheduled',
      },
    });

    const credit = await creditTeacherForSession(session.id, instructor.id);
    expect(credit).toBeTruthy();
    const originalAmount = credit!.amountMinor;
    // 40% of 1_000_000 / 2 = 200_000
    expect(originalAmount).toBe(200_000n);

    await prisma.settingsFinance.update({
      where: { id: 'singleton' },
      data: { defaultTeacherPayPercent: 10 },
    });
    await prisma.courseInstructor.update({
      where: { courseId_employeeId: { courseId: course.id, employeeId: instructor.id } },
      data: { payPercent: 10 },
    });

    const enrollment = await createEnrollment({
      courseId: course.id,
      totalPriceMinor: 500_000n,
      amountPaidMinor: 500_000n,
    });
    const refund = await initiateRefund(enrollment.id, 100_000n, 'cancel', admin.id, session.id);
    await transitionRefund(refund.id, 'under_review', admin.id);
    await transitionRefund(refund.id, 'approved', admin.id);
    await transitionRefund(refund.id, 'processed', admin.id);

    const reversal = await prisma.walletTransaction.findFirst({
      where: {
        type: 'reversal_session_cancel',
        referenceType: 'course_session',
        referenceId: session.id,
      },
    });
    expect(reversal).toBeTruthy();
    // Debits are stored as negative amountMinor
    expect(reversal!.amountMinor).toBe(-originalAmount);
  });

  it('P2-C4: failed conversion keeps lead off enrolled', async () => {
    const admin = await createEmployee({ privileges: ['admin', 'sales'] });
    const source = await prisma.leadSource.create({
      data: { code: 'web', labelAr: 'ويب', isSystem: false },
    });
    const course = await createCourse({ priceMinor: 100_000n });
    const lead = await prisma.lead.create({
      data: {
        fullName: 'Convert Fail',
        phone: '0922222222',
        sourceId: source.id,
        status: 'interested',
        assignedEmployeeId: admin.id,
      },
    });

    await expect(
      convertLeadWithPayment(
        lead.id,
        { courseId: course.id, amountMinor: 500_000n, totalPriceMinor: 100_000n },
        admin.id,
        ['admin', 'sales']
      )
    ).rejects.toThrow(ValidationError);

    const after = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(after.status).not.toBe('enrolled');
    expect(await prisma.enrollment.count({ where: { leadId: lead.id } })).toBe(0);
  });

  it('P2-C4: happy path ends enrolled with payment', async () => {
    const admin = await createEmployee({ privileges: ['admin', 'sales'] });
    const source = await prisma.leadSource.create({
      data: { code: 'web2', labelAr: 'ويب2', isSystem: false },
    });
    const course = await createCourse({ priceMinor: 200_000n });
    const lead = await prisma.lead.create({
      data: {
        fullName: 'Convert Ok',
        phone: '0933333333',
        sourceId: source.id,
        status: 'interested',
        assignedEmployeeId: admin.id,
      },
    });

    const result = await convertLeadWithPayment(
      lead.id,
      { courseId: course.id, amountMinor: 50_000n },
      admin.id,
      ['admin', 'sales']
    );
    expect(result.lead.status).toBe('enrolled');
    expect(result.enrollment.amountPaidMinor).toBe(50_000n);
  });

  it('P2-C5: concurrent payments — exactly one fulfills when sum would overpay', async () => {
    const admin = await createEmployee({});
    const course = await createCourse();
    const enrollment = await createEnrollment({
      courseId: course.id,
      totalPriceMinor: 100n,
      amountPaidMinor: 0n,
    });

    const results = await Promise.allSettled([
      recordPayment(enrollment.id, 60n, admin.id),
      recordPayment(enrollment.id, 60n, admin.id),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const updated = await prisma.enrollment.findUniqueOrThrow({ where: { id: enrollment.id } });
    expect(updated.amountPaidMinor).toBe(60n);
    expect(await prisma.studentPayment.count({ where: { enrollmentId: enrollment.id } })).toBe(1);
  });

  it('P2-C5: concurrent voids do not lose amountPaidMinor decrements', async () => {
    const admin = await createEmployee({ privileges: ['admin', 'accountant'] });
    const course = await createCourse();
    const enrollment = await createEnrollment({
      courseId: course.id,
      totalPriceMinor: 200n,
    });
    await recordPayment(enrollment.id, 80n, admin.id);
    await recordPayment(enrollment.id, 70n, admin.id);
    const payments = await prisma.studentPayment.findMany({
      where: { enrollmentId: enrollment.id },
      orderBy: { paidAt: 'asc' },
    });
    expect(payments).toHaveLength(2);

    const results = await Promise.allSettled([
      voidPayment(payments[0].id, admin.id, 'a'),
      voidPayment(payments[1].id, admin.id, 'b'),
    ]);
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);

    const updated = await prisma.enrollment.findUniqueOrThrow({ where: { id: enrollment.id } });
    expect(updated.amountPaidMinor).toBe(0n);
  });

  it('P2-H1: concurrent attendance credits once and creates one eval campaign', async () => {
    const instructor = await createEmployee({
      privileges: ['instructor', 'admin'],
      email: 'att@test.local',
    });
    const course = await createCourse({
      primaryInstructorId: instructor.id,
      sessionCount: 1,
      priceMinor: 1_000_000n,
    });
    await prisma.courseInstructor.create({
      data: { courseId: course.id, employeeId: instructor.id, payPercent: 50 },
    });
    const session = await prisma.courseSession.create({
      data: {
        courseId: course.id,
        sessionNumber: 1,
        scheduledAt: new Date(),
        durationMinutes: 90,
        status: 'scheduled',
      },
    });
    const student = await prisma.student.create({ data: { fullName: 'Att Student' } });
    await prisma.enrollment.create({
      data: {
        studentId: student.id,
        courseId: course.id,
        totalPriceMinor: course.priceMinor,
        amountPaidMinor: course.priceMinor,
        enrollmentStatus: 'enrolled',
        paymentStatus: 'paid_in_full',
      },
    });

    const results = await Promise.allSettled([
      recordAttendance(
        session.id,
        [{ studentId: student.id, status: 'present' }],
        instructor.id,
        ['instructor', 'admin']
      ),
      recordAttendance(
        session.id,
        [{ studentId: student.id, status: 'present' }],
        instructor.id,
        ['instructor', 'admin']
      ),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled').length).toBe(2);

    const credits = await prisma.walletTransaction.findMany({
      where: {
        type: 'credit_hours',
        referenceType: 'course_session',
        referenceId: session.id,
      },
    });
    expect(credits).toHaveLength(1);

    const campaigns = await prisma.evaluationCampaign.findMany({
      where: { courseId: course.id, type: 'post_course' },
    });
    expect(campaigns).toHaveLength(1);
  });
});
