import { Prisma, StudentStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { ConflictError } from '../lib/errors.js';
import { transitionEntityStatus, writeStatusTransition } from './audit.service.js';

type DbClient = Prisma.TransactionClient | typeof prisma;

/**
 * Automatic enrollment steps, shared by attendance, course lifecycle and enrollment code.
 * Manual steps go through student.service transitionEnrollment.
 */

/** enrolled → attending for students marked present or late in a session of the course. */
export async function startAttendingEnrollments(
  courseId: string,
  studentIds: string[],
  client: DbClient = prisma
) {
  if (!studentIds.length) return 0;
  const toStart = await client.enrollment.findMany({
    where: { courseId, studentId: { in: studentIds }, enrollmentStatus: 'enrolled' },
    select: { id: true },
  });
  for (const e of toStart) {
    await client.enrollment.update({ where: { id: e.id }, data: { enrollmentStatus: 'attending' } });
    await writeStatusTransition(
      {
        entityType: 'enrollment',
        entityId: e.id,
        fromStatus: 'enrolled',
        toStatus: 'attending',
        triggeredByType: 'system',
        reason: 'تسجيل أول حضور',
      },
      client
    );
  }
  return toStart.length;
}

/**
 * attending → completed for everyone still attending when the course completes. Students who
 * never attended stay "enrolled" so staff decide whether they completed or dropped.
 */
export async function completeCourseEnrollments(courseId: string, client: DbClient = prisma) {
  const attending = await client.enrollment.findMany({
    where: { courseId, enrollmentStatus: 'attending' },
    select: { id: true },
  });
  for (const e of attending) {
    await client.enrollment.update({ where: { id: e.id }, data: { enrollmentStatus: 'completed' } });
    await writeStatusTransition(
      {
        entityType: 'enrollment',
        entityId: e.id,
        fromStatus: 'attending',
        toStatus: 'completed',
        triggeredByType: 'system',
        reason: 'اكتملت الدورة',
      },
      client
    );
  }
  return attending.length;
}

/** A blocked student cannot take a new seat in any course. */
export function assertStudentCanEnroll(student: { status: StudentStatus }) {
  if (student.status === 'blocked') {
    throw new ConflictError('الطالب محظور — لا يمكن تسجيله في دورات جديدة');
  }
}

/** A new enrollment brings a frozen, graduated or withdrawn student back to active. */
export async function reactivateStudentOnEnrollment(
  student: { id: string; status: StudentStatus },
  actorId: string,
  client: DbClient = prisma
) {
  if (student.status === 'active' || student.status === 'blocked') return;
  await client.student.update({
    where: { id: student.id },
    data: { status: 'active', statusReason: null, statusChangedAt: new Date() },
  });
  await transitionEntityStatus(
    {
      entityType: 'student',
      entityId: student.id,
      fromStatus: student.status,
      toStatus: 'active',
      triggeredByType: 'employee',
      triggeredById: actorId,
      reason: 'تسجيل في دورة جديدة',
      actorType: 'employee',
      actorId,
      action: 'student.status_change',
    },
    client
  );
}
