import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { resetDb, disconnectTestDb } from './helpers/db.js';
import { createEmployee, createCourse, createEnrollment, createExpenseCategory } from './helpers/factories.js';
import {
  enrollStudent,
  getStudent,
  recordAttendance,
  recordPayment,
  setStudentStatus,
  transitionEnrollment,
  voidPayment,
} from '../src/services/student.service.js';
import { initiateRefund, transitionRefund } from '../src/services/wallet.service.js';
import { createExpense } from '../src/services/finance.service.js';
import { transitionCourse } from '../src/services/course.service.js';
import {
  getExpenseDocument,
  getNumbering,
  getPaymentDocument,
  getRefundDocument,
  getStudentStatement,
  setNextNumber,
} from '../src/services/document.service.js';
import { ConflictError, ValidationError } from '../src/lib/errors.js';

describe('Receipts, numbering and student status (integration)', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  it('numbers receipts in order and prints the balance as it stood', async () => {
    const admin = await createEmployee({ privileges: ['admin'] });
    const course = await createCourse({ priceMinor: 1_000_000n });
    const enrollment = await createEnrollment({ courseId: course.id, totalPriceMinor: 1_000_000n });

    const first = await recordPayment(enrollment.id, 300_000n, admin.id, 'cash');
    const second = await recordPayment(enrollment.id, 200_000n, admin.id, 'transfer', 'second');
    expect(second.payment.receiptNo).toBe(first.payment.receiptNo + 1);

    const doc = await getPaymentDocument(second.payment.id);
    expect(doc.number).toBe(second.payment.receiptNo);
    expect(doc.method).toBe('transfer');
    expect(doc.enrollment.paidBeforeMinor).toBe(300_000n);
    expect(doc.enrollment.paidAfterMinor).toBe(500_000n);
    expect(doc.enrollment.remainingAfterMinor).toBe(500_000n);
    expect(doc.voided).toBeNull();

    // A voided receipt keeps its number, is marked void, and no longer counts toward later receipts
    await voidPayment(first.payment.id, admin.id, 'entered twice');
    const voided = await getPaymentDocument(first.payment.id);
    expect(voided.voided?.reason).toBe('entered twice');
    expect(voided.enrollment.paidAfterMinor).toBe(0n);
    const after = await getPaymentDocument(second.payment.id);
    expect(after.enrollment.paidBeforeMinor).toBe(0n);
  });

  it('moves the next number forward but never back', async () => {
    const admin = await createEmployee({ privileges: ['admin'] });
    const course = await createCourse({ priceMinor: 1_000_000n });
    const enrollment = await createEnrollment({ courseId: course.id, totalPriceMinor: 1_000_000n });
    await recordPayment(enrollment.id, 100_000n, admin.id);

    const before = await getNumbering();
    expect(before.payment.lastUsed).toBe(1);
    expect(before.payment.next).toBe(2);

    await expect(setNextNumber('payment', 1, admin.id)).rejects.toBeInstanceOf(ValidationError);
    await expect(setNextNumber('payment', 0, admin.id)).rejects.toBeInstanceOf(ValidationError);

    const state = await setNextNumber('payment', 500, admin.id);
    expect(state.next).toBe(500);
    const paid = await recordPayment(enrollment.id, 100_000n, admin.id);
    expect(paid.payment.receiptNo).toBe(500);

    const category = await createExpenseCategory();
    const expense = await createExpense({
      categoryId: category.id,
      amountMinor: 25_000n,
      reason: 'tea',
      spentAt: new Date(),
      createdById: admin.id,
    });
    const voucher = await getExpenseDocument(expense.id);
    expect(voucher.number).toBe(1);
    expect(voucher.category.code).toBe(category.code);
  });

  it('requires a reason for blocking and keeps blocked students out of new courses', async () => {
    const admin = await createEmployee({ privileges: ['admin'] });
    const course = await createCourse();
    const student = await prisma.student.create({ data: { fullName: 'Blocked One', phone: '0999000001' } });

    await expect(setStudentStatus(student.id, 'blocked', admin.id, '  ')).rejects.toBeInstanceOf(ValidationError);
    await setStudentStatus(student.id, 'blocked', admin.id, 'unpaid fees');
    await expect(setStudentStatus(student.id, 'blocked', admin.id, 'again')).rejects.toBeInstanceOf(ConflictError);
    await expect(enrollStudent(course.id, student.id, admin.id)).rejects.toBeInstanceOf(ConflictError);

    const detail = await getStudent(student.id);
    expect(detail.status).toBe('blocked');
    expect(detail.statusReason).toBe('unpaid fees');
    expect(detail.statusHistory[0]).toMatchObject({ entityType: 'student', fromStatus: 'active', toStatus: 'blocked' });
  });

  it('brings a frozen student back to active when enrolled, and refuses double enrollment', async () => {
    const admin = await createEmployee({ privileges: ['admin'] });
    const course = await createCourse();
    const student = await prisma.student.create({ data: { fullName: 'Frozen One', phone: '0999000002' } });
    await setStudentStatus(student.id, 'frozen', admin.id, 'travelling');

    await enrollStudent(course.id, student.id, admin.id);
    const detail = await getStudent(student.id);
    expect(detail.status).toBe('active');
    expect(detail.statusReason).toBeNull();

    await expect(enrollStudent(course.id, student.id, admin.id)).rejects.toBeInstanceOf(ConflictError);
  });

  it('advances enrollments on attendance and course completion', async () => {
    const admin = await createEmployee({ privileges: ['admin'] });
    const course = await createCourse({ sessionCount: 2 });
    const attending = await createEnrollment({ courseId: course.id });
    const absent = await createEnrollment({ courseId: course.id });
    const s1 = await prisma.courseSession.create({
      data: { courseId: course.id, sessionNumber: 1, scheduledAt: new Date() },
    });
    const s2 = await prisma.courseSession.create({
      data: { courseId: course.id, sessionNumber: 2, scheduledAt: new Date() },
    });

    await recordAttendance(
      s1.id,
      [
        { studentId: attending.studentId, status: 'present' },
        { studentId: absent.studentId, status: 'absent' },
      ],
      admin.id,
      ['admin']
    );
    expect((await prisma.enrollment.findUniqueOrThrow({ where: { id: attending.id } })).enrollmentStatus).toBe('attending');
    expect((await prisma.enrollment.findUniqueOrThrow({ where: { id: absent.id } })).enrollmentStatus).toBe('enrolled');

    // The last session completes the course, which completes everyone still attending
    await recordAttendance(s2.id, [{ studentId: attending.studentId, status: 'late' }], admin.id, ['admin']);
    expect((await prisma.enrollment.findUniqueOrThrow({ where: { id: attending.id } })).enrollmentStatus).toBe('completed');
    expect((await prisma.enrollment.findUniqueOrThrow({ where: { id: absent.id } })).enrollmentStatus).toBe('enrolled');

    const history = await prisma.entityStatusTransition.findMany({
      where: { entityType: 'enrollment', entityId: attending.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(history.map((h) => h.toStatus)).toEqual(['attending', 'completed']);
    expect(history.every((h) => h.triggeredByType === 'system')).toBe(true);
  });

  it('completes attending enrollments when a course is moved to completed', async () => {
    const admin = await createEmployee({ privileges: ['admin'] });
    const course = await createCourse({ status: 'active' });
    const enrollment = await createEnrollment({ courseId: course.id });
    await transitionEnrollment(enrollment.id, 'attending', admin.id);
    await transitionCourse(course.id, 'completed', admin.id);
    expect((await prisma.enrollment.findUniqueOrThrow({ where: { id: enrollment.id } })).enrollmentStatus).toBe('completed');
  });

  it('guards manual enrollment steps: drop reason, certified, undo, reinstate capacity', async () => {
    const admin = await createEmployee({ privileges: ['admin'] });
    const course = await createCourse({ capacity: 1 });
    const enrollment = await createEnrollment({ courseId: course.id });

    await expect(transitionEnrollment(enrollment.id, 'dropped', admin.id)).rejects.toBeInstanceOf(ValidationError);
    await expect(transitionEnrollment(enrollment.id, 'certified', admin.id)).rejects.toBeInstanceOf(ConflictError);

    await transitionEnrollment(enrollment.id, 'completed', admin.id);
    const undone = await transitionEnrollment(enrollment.id, 'attending', admin.id);
    expect(undone.enrollmentStatus).toBe('attending');

    await transitionEnrollment(enrollment.id, 'dropped', admin.id, 'moved abroad');
    // The freed seat is taken by someone else, so reinstating must wait
    await createEnrollment({ courseId: course.id });
    await expect(transitionEnrollment(enrollment.id, 'enrolled', admin.id)).rejects.toBeInstanceOf(ConflictError);

    const detail = await getStudent(enrollment.studentId);
    const drop = detail.statusHistory.find((h) => h.toStatus === 'dropped');
    expect(drop?.reason).toBe('moved abroad');
    expect(detail.enrollments[0].allowedTransitions).toEqual(['enrolled']);
  });

  it('lets a later refund use money a processed refund did not take', async () => {
    const admin = await createEmployee({ privileges: ['admin'] });
    const course = await createCourse({ priceMinor: 1_000_000n });
    const enrollment = await createEnrollment({ courseId: course.id, totalPriceMinor: 1_000_000n });
    await recordPayment(enrollment.id, 500_000n, admin.id);

    const refund = await initiateRefund(enrollment.id, 100_000n, 'partial', admin.id);
    await transitionRefund(refund.id, 'under_review', admin.id);
    await transitionRefund(refund.id, 'approved', admin.id);
    await transitionRefund(refund.id, 'processed', admin.id);

    // 400,000 is still paid: all of it can be refunded now (it used to stop at 300,000)
    const second = await initiateRefund(enrollment.id, 400_000n, 'rest', admin.id);
    expect(second.amountMinor).toBe(400_000n);
    await expect(initiateRefund(enrollment.id, 1n, 'too much', admin.id)).rejects.toBeInstanceOf(ValidationError);
    await expect(initiateRefund(enrollment.id, 1n, '  ', admin.id)).rejects.toBeInstanceOf(ValidationError);

    const voucher = await getRefundDocument(refund.id);
    expect(voucher.status).toBe('processed');
    expect(voucher.number).toBe(1);
    expect(voucher.history.map((h) => h.toStatus)).toEqual(['under_review', 'approved', 'processed']);
  });

  it('builds a statement whose ledger ends at the balance due', async () => {
    const admin = await createEmployee({ privileges: ['admin'] });
    const courseA = await createCourse({ priceMinor: 1_000_000n });
    const courseB = await createCourse({ priceMinor: 600_000n });
    const a = await createEnrollment({ courseId: courseA.id, totalPriceMinor: 1_000_000n });
    const b = await createEnrollment({ courseId: courseB.id, studentId: a.studentId, totalPriceMinor: 600_000n });
    await recordPayment(a.id, 400_000n, admin.id);
    await recordPayment(b.id, 600_000n, admin.id);
    const refund = await initiateRefund(b.id, 100_000n, 'discount', admin.id);
    await transitionRefund(refund.id, 'under_review', admin.id);
    await transitionRefund(refund.id, 'approved', admin.id);
    await transitionRefund(refund.id, 'processed', admin.id);

    const statement = await getStudentStatement(a.studentId);
    expect(statement.totals.chargesMinor).toBe(1_600_000n);
    expect(statement.totals.paidMinor).toBe(1_000_000n);
    expect(statement.totals.refundedMinor).toBe(100_000n);
    expect(statement.totals.balanceMinor).toBe(700_000n);
    expect(statement.ledger.at(-1)?.balanceMinor).toBe(700_000n);
    expect(statement.ledger.filter((e) => e.kind === 'payment')).toHaveLength(2);
  });
});
