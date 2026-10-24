import { CourseStatus, CourseType, TaskStatus, TaskSpecialty, ActorType, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import {
  assertTransition,
  getAllowedTransitions,
  COURSE_TRANSITIONS,
  TASK_TRANSITIONS,
} from '../state-machines/transitions.js';
import { transitionEntityStatus, writeAuditLog } from './audit.service.js';
import { ForbiddenError, NotFoundError, ValidationError, ConflictError } from '../lib/errors.js';
import { PrivilegeCode } from '../config/index.js';
import { COURSE_STATUS_ORDER, isLifecycleStageKey } from '../config/lifecycle.js';
import { hasAnyPrivilege } from './auth.service.js';
import { applyRatingForTask } from './rating.service.js';
import { createNotification } from './notification.service.js';
import { completeCourseEnrollments } from './enrollment-status.service.js';
import { toMinor } from '../lib/money.js';

const INSTRUCTOR_EDITABLE_STATUSES: CourseStatus[] = ['draft', 'planned', 'enrollment_open'];

function canEditInstructor(status: CourseStatus) {
  return INSTRUCTOR_EDITABLE_STATUSES.includes(status);
}

/** UTC midnight epoch ms for @db.Date comparisons (avoids TOD drift vs session timestamps). */
function utcDayMs(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function sessionEnd(scheduledAt: Date, durationMinutes: number) {
  return new Date(scheduledAt.getTime() + Math.max(15, durationMinutes || 90) * 60_000);
}

function intervalsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

/** Block overlapping sessions for the same instructor across courses (P2-M8). */
export async function assertInstructorNoSessionOverlap(
  courseId: string,
  sessions: { id?: string; scheduledAt: Date; durationMinutes: number }[],
  instructorIds: string[],
  client?: Prisma.TransactionClient
) {
  const db = client ?? prisma;
  const uniqueInstructors = [...new Set(instructorIds.filter(Boolean))];
  if (!uniqueInstructors.length || !sessions.length) return;

  for (const instructorId of uniqueInstructors) {
    const otherSessions = await db.courseSession.findMany({
      where: {
        id: { notIn: sessions.map((s) => s.id).filter((id): id is string => Boolean(id)) },
        course: {
          deletedAt: null,
          OR: [
            { primaryInstructorId: instructorId },
            { instructors: { some: { employeeId: instructorId } } },
          ],
        },
      },
      select: {
        id: true,
        scheduledAt: true,
        durationMinutes: true,
        courseId: true,
        course: { select: { name: true } },
      },
    });

    for (const candidate of sessions) {
      const cStart = new Date(candidate.scheduledAt);
      const cEnd = sessionEnd(cStart, candidate.durationMinutes);
      for (const other of otherSessions) {
        const oStart = new Date(other.scheduledAt);
        const oEnd = sessionEnd(oStart, other.durationMinutes);
        if (intervalsOverlap(cStart, cEnd, oStart, oEnd)) {
          throw new ConflictError(
            `تعارض في جدول المدرب مع جلسة في دورة «${other.course.name}»`,
            { instructorId, conflictingSessionId: other.id, courseId: other.courseId }
          );
        }
      }
    }
  }
}

async function instructorIdsForCourse(
  courseId: string,
  client?: Prisma.TransactionClient
): Promise<string[]> {
  const db = client ?? prisma;
  const course = await db.course.findUnique({
    where: { id: courseId },
    select: {
      primaryInstructorId: true,
      instructors: { select: { employeeId: true } },
    },
  });
  if (!course) return [];
  const ids = course.instructors.map((i) => i.employeeId);
  if (course.primaryInstructorId) ids.push(course.primaryInstructorId);
  return [...new Set(ids)];
}

/** Minutes per session from approximate total hours ÷ session count. */
function sessionDurationMinutes(totalHours: number, sessionCount: number) {
  const sessions = Math.max(1, Number(sessionCount) || 1);
  const hours = Math.max(0, Number(totalHours) || 0);
  if (hours <= 0) return 90;
  return Math.max(15, Math.round((hours / sessions) * 60));
}

type TeacherPayInput = {
  teacherPayMode?: 'percent' | 'hourly' | null;
  payPercent?: number | null;
  hourlyRateMinor?: bigint | number | string | null;
};

function normalizeTeacherPay(pay: TeacherPayInput): {
  payPercent: number | null;
  hourlyRateMinor: bigint | null;
} {
  if (pay.teacherPayMode === 'hourly') {
    if (pay.hourlyRateMinor == null || pay.hourlyRateMinor === '') {
      throw new ValidationError('يجب إدخال أجر الساعة للمدرب');
    }
    return { payPercent: null, hourlyRateMinor: toMinor(pay.hourlyRateMinor) };
  }
  if (pay.teacherPayMode === 'percent' || pay.payPercent != null) {
    const pct = Number(pay.payPercent);
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
      throw new ValidationError('نسبة أجر المدرب يجب أن تكون بين 1 و 100');
    }
    return { payPercent: pct, hourlyRateMinor: null };
  }
  return { payPercent: null, hourlyRateMinor: null };
}

async function upsertPrimaryInstructorPay(
  courseId: string,
  employeeId: string | null | undefined,
  pay: TeacherPayInput
) {
  if (!employeeId) return;
  const { payPercent, hourlyRateMinor } = normalizeTeacherPay(pay);
  await prisma.courseInstructor.deleteMany({
    where: { courseId, NOT: { employeeId } },
  });
  await prisma.courseInstructor.upsert({
    where: { courseId_employeeId: { courseId, employeeId } },
    create: { courseId, employeeId, payPercent, hourlyRateMinor },
    update: { payPercent, hourlyRateMinor },
  });
}

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function computeDesiredCourseStatus(course: {
  status: CourseStatus;
  startDate: Date;
  sessions: { scheduledAt: Date; sessionNumber: number }[];
}): CourseStatus | null {
  if (course.status === 'archived') return null;

  const today = startOfDay(new Date());
  const start = startOfDay(course.startDate);
  const lastSession = course.sessions[course.sessions.length - 1];
  const end = lastSession ? startOfDay(lastSession.scheduledAt) : start;

  if (today > end) return 'completed';
  if (today >= start) return 'active';
  return 'enrollment_open';
}

function statusPath(from: CourseStatus, to: CourseStatus): CourseStatus[] {
  if (from === to) return [];
  const order = COURSE_STATUS_ORDER as readonly string[];
  const fromIdx = order.indexOf(from);
  const toIdx = order.indexOf(to);
  if (fromIdx < 0 || toIdx < 0 || toIdx <= fromIdx) return [];
  return order.slice(fromIdx + 1, toIdx + 1) as CourseStatus[];
}

const SPECIALTY_TO_PRIVILEGE: Record<TaskSpecialty, PrivilegeCode[]> = {
  sales: ['sales'],
  media: ['media'],
  operation: ['operation'],
  logistics: ['operation'],
  accountant: ['accountant'],
};

/** Admin/operation bypass; instructors must be primary or linked via CourseInstructor. */
export async function assertCourseInstructorAccess(
  courseId: string,
  actorId: string,
  actorPrivileges: PrivilegeCode[]
) {
  if (hasAnyPrivilege(actorPrivileges, ['admin', 'operation'])) return;

  const course = await prisma.course.findFirst({
    where: { id: courseId, deletedAt: null },
    select: {
      id: true,
      primaryInstructorId: true,
      instructors: { select: { employeeId: true } },
    },
  });
  if (!course) throw new NotFoundError('Course not found');

  if (!hasAnyPrivilege(actorPrivileges, ['instructor'])) {
    throw new ForbiddenError('Insufficient privileges for this course');
  }

  const assigned =
    course.primaryInstructorId === actorId ||
    course.instructors.some((i) => i.employeeId === actorId);
  if (!assigned) {
    throw new ForbiddenError('You are not assigned to this course');
  }
}

function taskSpecialtiesForPrivileges(callerPrivileges: PrivilegeCode[]): TaskSpecialty[] | 'all' {
  if (hasAnyPrivilege(callerPrivileges, ['admin'])) return 'all';
  const specialties: TaskSpecialty[] = [];
  if (callerPrivileges.includes('sales')) specialties.push('sales');
  if (callerPrivileges.includes('media')) specialties.push('media');
  if (callerPrivileges.includes('operation')) {
    specialties.push('operation', 'logistics');
  }
  if (callerPrivileges.includes('accountant')) specialties.push('accountant');
  return specialties;
}

export function assertTaskAccess(
  specialty: TaskSpecialty,
  callerPrivileges: PrivilegeCode[]
) {
  const allowed = taskSpecialtiesForPrivileges(callerPrivileges);
  if (allowed === 'all') return;
  if (!allowed.includes(specialty)) {
    throw new ForbiddenError('Insufficient privileges for this task specialty');
  }
}

export async function listCourses(filters?: {
  status?: CourseStatus;
  trackId?: string;
  courseType?: CourseType;
}) {
  const courses = await prisma.course.findMany({
    where: {
      deletedAt: null,
      ...(filters?.status ? { status: filters.status } : {}),
      ...(filters?.trackId ? { trackId: filters.trackId } : {}),
      ...(filters?.courseType ? { courseType: filters.courseType } : {}),
    },
    include: {
      track: true,
      primaryInstructor: { select: { id: true, fullName: true } },
      _count: { select: { enrollments: true, tasks: true } },
    },
    orderBy: { startDate: 'desc' },
  });
  if (courses.length === 0) return [];

  // Progress over every live task of the course. The task list a caller receives is filtered
  // by their specialties, so computing progress from it would differ from role to role.
  const counts = await prisma.task.groupBy({
    by: ['courseId', 'status'],
    where: { courseId: { in: courses.map((c) => c.id) }, deletedAt: null },
    _count: { _all: true },
  });
  const taskStats = new Map<string, { total: number; done: number }>();
  for (const row of counts) {
    const stats = taskStats.get(row.courseId) ?? { total: 0, done: 0 };
    stats.total += row._count._all;
    if (row.status === 'done') stats.done += row._count._all;
    taskStats.set(row.courseId, stats);
  }
  return courses.map((course) => ({ ...course, taskStats: taskStats.get(course.id) ?? { total: 0, done: 0 } }));
}

export async function getCourse(id: string, callerPrivileges?: PrivilegeCode[], callerId?: string) {
  const canSeePay = callerPrivileges
    ? hasAnyPrivilege(callerPrivileges, ['admin', 'accountant'])
    : false;

  const course = await prisma.course.findFirst({
    where: { id, deletedAt: null },
    include: {
      track: true,
      primaryInstructor: { select: { id: true, fullName: true } },
      sessions: { orderBy: { sessionNumber: 'asc' } },
      taskPathLinks: { include: { template: true } },
      _count: { select: { enrollments: true } },
      instructors: {
        select: {
          courseId: true,
          employeeId: true,
          ...(canSeePay ? { payPercent: true, hourlyRateMinor: true } : {}),
          employee: { select: { id: true, fullName: true } },
        },
      },
    },
  });
  if (!course) throw new NotFoundError('Course not found');

  // Task progress over every task of the course: the task list a caller receives is filtered by
  // their specialties, so progress computed from it would differ from role to role.
  const taskCounts = await prisma.task.groupBy({
    by: ['status'],
    where: { courseId: id, deletedAt: null },
    _count: { _all: true },
  });
  const taskStats = taskCounts.reduce(
    (stats, row) => ({
      total: stats.total + row._count._all,
      done: stats.done + (row.status === 'done' ? row._count._all : 0),
    }),
    { total: 0, done: 0 }
  );

  // Whoever may record attendance needs the roster. That includes the course's own instructor,
  // who is not allowed to read the students list.
  const canSeeRoster = callerPrivileges
    ? hasAnyPrivilege(callerPrivileges, ['admin', 'operation', 'sales']) ||
      (callerPrivileges.includes('instructor') &&
        Boolean(callerId) &&
        (course.primaryInstructorId === callerId ||
          course.instructors.some((link) => link.employeeId === callerId)))
    : false;

  const enrollments = canSeeRoster
    ? await prisma.enrollment.findMany({
        where: { courseId: id },
        select: {
          id: true,
          enrollmentStatus: true,
          paymentStatus: true,
          student: { select: { id: true, fullName: true } },
        },
        orderBy: { student: { fullName: 'asc' } },
      })
    : undefined;

  return { ...course, taskStats, ...(enrollments ? { enrollments } : {}) };
}

export async function createCourse(
  data: {
    name: string;
    trackId: string;
    courseType?: CourseType;
    startDate: Date;
    sessionCount: number;
    totalHours?: number;
    priceMinor: bigint;
    capacity: number;
    primaryInstructorId?: string;
    hallNotes?: string;
    taskPathTemplateId?: string | null;
    teacherPayMode?: 'percent' | 'hourly' | null;
    payPercent?: number | null;
    hourlyRateMinor?: bigint | number | string | null;
  },
  actorId: string
) {
  const sessionCount = Math.max(1, Number(data.sessionCount) || 1);
  const totalHours = Math.max(0, Number(data.totalHours) || 0);
  const durationMinutes = sessionDurationMinutes(totalHours, sessionCount);

  const tentativeSessions: { scheduledAt: Date; durationMinutes: number }[] = [];
  for (let i = 1; i <= sessionCount; i++) {
    const sessionDate = new Date(data.startDate);
    sessionDate.setDate(sessionDate.getDate() + (i - 1) * 7);
    tentativeSessions.push({ scheduledAt: sessionDate, durationMinutes });
  }
  if (data.primaryInstructorId) {
    await assertInstructorNoSessionOverlap(
      'new-course',
      tentativeSessions,
      [data.primaryInstructorId]
    );
  }

  const course = await prisma.course.create({
    data: {
      name: data.name,
      trackId: data.trackId,
      courseType: data.courseType ?? 'course',
      startDate: data.startDate,
      sessionCount,
      totalHours,
      priceMinor: data.priceMinor,
      capacity: data.capacity,
      primaryInstructorId: data.primaryInstructorId,
      hallNotes: data.hallNotes,
      status: 'draft',
    },
  });

  for (let i = 0; i < tentativeSessions.length; i++) {
    await prisma.courseSession.create({
      data: {
        courseId: course.id,
        sessionNumber: i + 1,
        scheduledAt: tentativeSessions[i].scheduledAt,
        durationMinutes,
      },
    });
  }

  if (data.primaryInstructorId) {
    await upsertPrimaryInstructorPay(course.id, data.primaryInstructorId, data);
  }

  await writeAuditLog({
    actorType: 'employee',
    actorId,
    action: 'course.created',
    entityType: 'course',
    entityId: course.id,
    newValue: data,
  });

  let templateId: string | null = null;
  if (data.taskPathTemplateId) {
    templateId = data.taskPathTemplateId;
  }

  if (templateId) {
    await attachTemplate(course.id, templateId, actorId);
  }

  return syncCourseLifecycleStatus(course.id);
}

export async function updateCourse(
  id: string,
  data: Partial<{
    name: string;
    trackId: string;
    courseType: CourseType;
    startDate: Date;
    sessionCount: number;
    totalHours: number;
    priceMinor: bigint;
    capacity: number;
    primaryInstructorId: string | null;
    hallNotes: string;
    teacherPayMode: 'percent' | 'hourly' | null;
    payPercent: number | null;
    hourlyRateMinor: bigint | number | string | null;
  }>,
  actorId: string,
  callerPrivileges?: PrivilegeCode[]
) {
  const course = await getCourse(id, callerPrivileges);

  const instructorChanging =
    'primaryInstructorId' in data ||
    'teacherPayMode' in data ||
    'payPercent' in data ||
    'hourlyRateMinor' in data;

  if (instructorChanging && !canEditInstructor(course.status)) {
    throw new ValidationError(
      'لا يمكن تغيير المدرب أو أجره بعد بدء الدورة. يُسمح بذلك فقط قبل البداية.'
    );
  }

  const {
    teacherPayMode,
    payPercent,
    hourlyRateMinor,
    ...courseFields
  } = data;

  const updatePayload: Record<string, unknown> = { ...courseFields };
  if (data.sessionCount != null) {
    updatePayload.sessionCount = Math.max(1, Number(data.sessionCount) || 1);
  }
  if (data.totalHours != null) {
    updatePayload.totalHours = Math.max(0, Number(data.totalHours) || 0);
  }

  // Whole-day delta only (@db.Date vs session timestamps) — strip startDate from early
  // update when cascading so a failed overlap never leaves startDate advanced alone.
  let startDateDeltaMs: number | null = null;
  if (data.startDate != null) {
    startDateDeltaMs =
      utcDayMs(new Date(data.startDate)) - utcDayMs(new Date(course.startDate));
    if (startDateDeltaMs !== 0) {
      delete updatePayload.startDate;
    }
  }

  if (Object.keys(updatePayload).length > 0) {
    await prisma.course.update({ where: { id }, data: updatePayload });
  }

  if (startDateDeltaMs != null && startDateDeltaMs !== 0) {
    const deltaMs = startDateDeltaMs;
    await prisma.$transaction(async (tx) => {
      await tx.course.update({
        where: { id },
        data: { startDate: data.startDate! },
      });

      const sessions = await tx.courseSession.findMany({ where: { courseId: id } });
      const shifted: { id: string; scheduledAt: Date; durationMinutes: number }[] = [];
      for (const s of sessions) {
        const scheduledAt = new Date(s.scheduledAt.getTime() + deltaMs);
        await tx.courseSession.update({
          where: { id: s.id },
          data: { scheduledAt },
        });
        shifted.push({
          id: s.id,
          scheduledAt,
          durationMinutes: s.durationMinutes,
        });
      }

      await assertInstructorNoSessionOverlap(
        id,
        shifted,
        await instructorIdsForCourse(id, tx),
        tx
      );
      await resyncTasksFromTemplate(id, actorId, tx);
    });
  }

  if (data.sessionCount != null || data.totalHours != null) {
    const nextSessions =
      data.sessionCount != null
        ? Math.max(1, Number(data.sessionCount) || 1)
        : course.sessionCount;
    const nextHours =
      data.totalHours != null
        ? Math.max(0, Number(data.totalHours) || 0)
        : course.totalHours;
    await prisma.courseSession.updateMany({
      where: { courseId: id },
      data: { durationMinutes: sessionDurationMinutes(nextHours, nextSessions) },
    });
  }

  if (instructorChanging) {
    const instructorId =
      'primaryInstructorId' in data
        ? data.primaryInstructorId
        : course.primaryInstructorId;
    if (instructorId) {
      await upsertPrimaryInstructorPay(id, instructorId, {
        teacherPayMode,
        payPercent,
        hourlyRateMinor,
      });
    } else if ('primaryInstructorId' in data && !data.primaryInstructorId) {
      await prisma.courseInstructor.deleteMany({ where: { courseId: id } });
    }
  }

  await writeAuditLog({
    actorType: 'employee',
    actorId,
    action: 'course.updated',
    entityType: 'course',
    entityId: id,
    oldValue: course,
    newValue: data,
  });
  return syncCourseLifecycleStatus(id, callerPrivileges);
}

export async function transitionCourse(
  id: string,
  toStatus: CourseStatus,
  actorId: string | null,
  reason?: string,
  actorType: ActorType = 'employee',
  callerPrivileges?: PrivilegeCode[]
) {
  const course = await getCourse(id, callerPrivileges);
  assertTransition(COURSE_TRANSITIONS, course.status, toStatus, 'course');

  await prisma.course.update({ where: { id }, data: { status: toStatus } });

  await transitionEntityStatus({
    entityType: 'course',
    entityId: id,
    fromStatus: course.status,
    toStatus,
    triggeredByType: actorType,
    triggeredById: actorId,
    reason,
    actorType,
    actorId,
    action: 'course.status_change',
  });

  if (toStatus === 'completed') {
    await completeCourseEnrollments(id);
  }

  return getCourse(id, callerPrivileges);
}

export async function attachTemplate(courseId: string, templateId: string, actorId: string) {
  await getCourse(courseId);

  await prisma.courseTaskPathLink.upsert({
    where: { courseId_templateId: { courseId, templateId } },
    create: { courseId, templateId, attachedById: actorId },
    update: { attachedAt: new Date(), attachedById: actorId },
  });

  await generateTasksFromTemplate(courseId, templateId);
  await writeAuditLog({
    actorType: 'employee',
    actorId,
    action: 'course.template_attached',
    entityType: 'course',
    entityId: courseId,
    newValue: { templateId },
  });
  await syncCourseLifecycleStatus(courseId);
  return getCourse(courseId);
}

export async function replaceCourseTemplate(
  courseId: string,
  templateId: string,
  actorId: string
) {
  await getCourse(courseId);
  const oldLinks = await prisma.courseTaskPathLink.findMany({ where: { courseId } });
  const oldTemplateIds = oldLinks.map((l) => l.templateId);

  if (oldTemplateIds.length > 0) {
    const oldItemIds = (
      await prisma.taskPathTemplateItem.findMany({
        where: { templateId: { in: oldTemplateIds } },
        select: { id: true },
      })
    ).map((i) => i.id);

    if (oldItemIds.length > 0) {
      await prisma.task.updateMany({
        where: {
          courseId,
          deletedAt: null,
          status: { in: ['pending', 'in_progress', 'late'] },
          templateItemId: { in: oldItemIds },
        },
        data: { deletedAt: new Date() },
      });
    }

    await prisma.courseTaskPathLink.deleteMany({ where: { courseId } });
  }

  await attachTemplate(courseId, templateId, actorId);

  await writeAuditLog({
    actorType: 'employee',
    actorId,
    action: 'course.template_replaced',
    entityType: 'course',
    entityId: courseId,
    oldValue: { templateIds: oldTemplateIds },
    newValue: { templateId },
  });

  return getCourse(courseId);
}

export async function updateCourseSession(
  courseId: string,
  sessionId: string,
  data: { scheduledAt?: Date; durationMinutes?: number },
  actorId: string
) {
  const session = await prisma.courseSession.findFirst({
    where: { id: sessionId, courseId },
  });
  if (!session) throw new NotFoundError('Session not found');

  const patch: { scheduledAt?: Date; durationMinutes?: number } = {};
  if (data.scheduledAt) patch.scheduledAt = data.scheduledAt;
  if (data.durationMinutes != null) {
    const mins = Math.round(Number(data.durationMinutes));
    if (!Number.isFinite(mins) || mins < 15) {
      throw new ValidationError('مدة الجلسة يجب أن تكون 15 دقيقة على الأقل');
    }
    patch.durationMinutes = mins;
  }
  if (Object.keys(patch).length === 0) {
    throw new ValidationError('لا توجد بيانات لتحديث الجلسة');
  }

  const nextScheduledAt = patch.scheduledAt ?? session.scheduledAt;
  const nextDuration = patch.durationMinutes ?? session.durationMinutes;
  await assertInstructorNoSessionOverlap(
    courseId,
    [{ id: sessionId, scheduledAt: nextScheduledAt, durationMinutes: nextDuration }],
    await instructorIdsForCourse(courseId)
  );

  const updated = await prisma.courseSession.update({
    where: { id: sessionId },
    data: patch,
  });

  // Keep course totalHours in sync with the sum of session durations.
  if (patch.durationMinutes != null) {
    const sessions = await prisma.courseSession.findMany({
      where: { courseId },
      select: { durationMinutes: true },
    });
    const totalMinutes = sessions.reduce((sum, s) => sum + (s.durationMinutes || 0), 0);
    await prisma.course.update({
      where: { id: courseId },
      data: { totalHours: Math.round((totalMinutes / 60) * 100) / 100 },
    });
  }

  await writeAuditLog({
    actorType: 'employee',
    actorId,
    action: 'course.session_updated',
    entityType: 'course_session',
    entityId: sessionId,
    oldValue: {
      scheduledAt: session.scheduledAt,
      durationMinutes: session.durationMinutes,
    },
    newValue: patch,
  });

  await syncCourseLifecycleStatus(courseId);
  return updated;
}

export async function generateTasksFromTemplate(
  courseId: string,
  templateId: string,
  opts?: { updateExisting?: boolean },
  client?: Prisma.TransactionClient
) {
  const db = client ?? prisma;
  // When inside a transaction, read course+sessions via tx so uncommitted shifts are visible.
  // Outside a tx, keep getCourse (RBAC-aware for normal callers).
  const course = client
    ? await db.course.findFirst({
        where: { id: courseId, deletedAt: null },
        include: { sessions: { orderBy: { sessionNumber: 'asc' } } },
      })
    : await getCourse(courseId);
  if (!course) throw new NotFoundError('Course not found');

  const items = await db.taskPathTemplateItem.findMany({
    where: { templateId },
    orderBy: { sortOrder: 'asc' },
  });

  const sessions = course.sessions;
  const firstSession = sessions[0] ?? null;
  const lastSession = sessions[sessions.length - 1] ?? null;
  const midSessions =
    sessions.length <= 2 ? sessions : sessions.slice(1, -1);

  const duringItems = items.filter((i) => i.phaseKey === 'during');
  // Auto-distribute only items without an explicit session offset (P2-L3)
  const duringAutoItems = duringItems.filter((i) => !(i.offsetValue > 0));
  const duringDueAt = new Map<string, Date | null>();
  duringAutoItems.forEach((item, index) => {
    if (!midSessions.length) {
      duringDueAt.set(
        item.id,
        firstSession ? new Date(firstSession.scheduledAt) : new Date(course.startDate)
      );
      return;
    }
    const session =
      midSessions[Math.min(index, midSessions.length - 1)] ?? midSessions[0];
    duringDueAt.set(item.id, session ? new Date(session.scheduledAt) : null);
  });

  const createdIds: string[] = [];
  const updatedIds: string[] = [];
  const skippedIds: string[] = [];

  for (const item of items) {
    let dueAt: Date | null = null;

    if (isLifecycleStageKey(item.phaseKey)) {
      switch (item.phaseKey) {
        case 'before_start': {
          const daysBefore = Math.max(1, Math.abs(item.offsetValue || 1));
          dueAt = addDays(startOfDay(course.startDate), -daysBefore);
          break;
        }
        case 'start': {
          dueAt = firstSession
            ? new Date(firstSession.scheduledAt)
            : new Date(course.startDate);
          break;
        }
        case 'during': {
          if (item.offsetValue > 0) {
            const session = sessions.find((s) => s.sessionNumber === item.offsetValue);
            dueAt = session
              ? new Date(session.scheduledAt)
              : firstSession
                ? new Date(firstSession.scheduledAt)
                : new Date(course.startDate);
          } else {
            dueAt = duringDueAt.get(item.id) ?? null;
          }
          break;
        }
        case 'end': {
          dueAt = lastSession ? new Date(lastSession.scheduledAt) : null;
          break;
        }
        case 'after_end': {
          const daysAfter = Math.max(1, Math.abs(item.offsetValue || 1));
          if (lastSession) {
            dueAt = addDays(new Date(lastSession.scheduledAt), daysAfter);
          }
          break;
        }
      }
    } else if (item.offsetType === 'days_from_start') {
      dueAt = addDays(new Date(course.startDate), item.offsetValue);
    } else if (item.offsetType === 'session_number') {
      const session =
        item.offsetValue === -1
          ? lastSession
          : sessions.find((s) => s.sessionNumber === item.offsetValue);
      dueAt = session ? new Date(session.scheduledAt) : null;
    }

    const fields = {
      title: item.title,
      phaseKey: item.phaseKey,
      specialty: item.specialty,
      dueAt,
      notes: item.notes,
    };

    const existing = await db.task.findFirst({
      where: { courseId, templateItemId: item.id, deletedAt: null },
    });
    if (existing) {
      if (opts?.updateExisting) {
        // P2-M7: do not overwrite historical done/late tasks
        if (existing.status === 'done' || existing.status === 'late') {
          skippedIds.push(existing.id);
        } else {
          await db.task.update({ where: { id: existing.id }, data: fields });
          updatedIds.push(existing.id);
        }
      }
      continue;
    }

    const created = await db.task.create({
      data: {
        courseId,
        templateItemId: item.id,
        ...fields,
      },
    });
    createdIds.push(created.id);
  }

  return { createdIds, updatedIds, skippedIds };
}

/** Advance course status automatically from dates / sessions. Manual changes (except archive) are disabled in UI. */
export async function syncCourseLifecycleStatus(
  courseId: string,
  callerPrivileges?: PrivilegeCode[]
) {
  let course = await getCourse(courseId, callerPrivileges);
  if (course.status === 'archived' || course.deletedAt) return course;

  const desired = computeDesiredCourseStatus(course);
  if (!desired || desired === course.status) return course;

  const path = statusPath(course.status, desired);
  for (const next of path) {
    try {
      assertTransition(COURSE_TRANSITIONS, course.status, next, 'course');
      course = await transitionCourse(
        course.id,
        next,
        null,
        `Auto lifecycle → ${next}`,
        'system',
        callerPrivileges
      );
    } catch {
      break;
    }
  }
  return course;
}

export async function syncAllCourseLifecycles() {
  const courses = await prisma.course.findMany({
    where: {
      deletedAt: null,
      status: { not: 'archived' },
    },
    select: { id: true },
  });
  let changed = 0;
  for (const c of courses) {
    const before = await prisma.course.findUnique({ where: { id: c.id }, select: { status: true } });
    const after = await syncCourseLifecycleStatus(c.id);
    if (before && after.status !== before.status) changed += 1;
  }
  return changed;
}

export async function resyncTasksFromTemplate(
  courseId: string,
  actorId: string,
  client?: Prisma.TransactionClient
) {
  const db = client ?? prisma;
  const links = await db.courseTaskPathLink.findMany({ where: { courseId } });
  const summary: { templateId: string; createdIds: string[]; updatedIds: string[]; skippedIds: string[] }[] =
    [];
  for (const link of links) {
    const result = await generateTasksFromTemplate(
      courseId,
      link.templateId,
      { updateExisting: true },
      client
    );
    summary.push({ templateId: link.templateId, ...result });
  }
  await writeAuditLog({
    actorType: 'employee',
    actorId,
    action: 'course.tasks_resynced',
    entityType: 'course',
    entityId: courseId,
    newValue: { summary },
  });
  if (client) return null;
  return getCourse(courseId);
}

export async function copyTaskPath(sourceCourseId: string, targetCourseId: string, actorId: string) {
  const sourceTasks = await prisma.task.findMany({
    where: { courseId: sourceCourseId, deletedAt: null },
  });
  const target = await getCourse(targetCourseId);

  for (const t of sourceTasks) {
    let dueAt: Date | null = null;
    if (t.dueAt) {
      const offset = t.dueAt.getTime() - (await getCourse(sourceCourseId)).startDate.getTime();
      dueAt = new Date(target.startDate.getTime() + offset);
    }
    await prisma.task.create({
      data: {
        courseId: targetCourseId,
        title: t.title,
        phaseKey: t.phaseKey,
        specialty: t.specialty,
        dueAt,
        notes: t.notes,
      },
    });
  }

  await writeAuditLog({
    actorType: 'employee',
    actorId,
    action: 'course.task_path_copied',
    entityType: 'course',
    entityId: targetCourseId,
    newValue: { fromCourseId: sourceCourseId },
  });

  return getCourse(targetCourseId);
}

export async function listTasks(
  callerPrivileges: PrivilegeCode[],
  filters?: { courseId?: string; status?: TaskStatus }
) {
  const allowed = taskSpecialtiesForPrivileges(callerPrivileges);
  if (allowed !== 'all' && allowed.length === 0) return [];

  return prisma.task.findMany({
    where: {
      deletedAt: null,
      ...(filters?.courseId ? { courseId: filters.courseId } : {}),
      ...(filters?.status ? { status: filters.status } : {}),
      ...(allowed !== 'all' ? { specialty: { in: allowed } } : {}),
      course: { deletedAt: null },
    },
    include: {
      course: { select: { id: true, name: true, status: true } },
      assignedEmployee: { select: { id: true, fullName: true } },
    },
    orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
  });
}

export async function getTask(id: string, callerPrivileges?: PrivilegeCode[]) {
  const task = await prisma.task.findFirst({
    where: { id, deletedAt: null },
    include: {
      course: true,
      assignedEmployee: { select: { id: true, fullName: true } },
      attachments: true,
    },
  });
  if (!task) throw new NotFoundError('Task not found');
  if (callerPrivileges) assertTaskAccess(task.specialty, callerPrivileges);
  return task;
}

export async function updateTask(
  id: string,
  data: Partial<{ title: string; notes: string; assignedEmployeeId: string; dueAt: Date }>,
  actorId: string,
  callerPrivileges: PrivilegeCode[]
) {
  await getTask(id, callerPrivileges);
  const updated = await prisma.task.update({ where: { id }, data });
  await writeAuditLog({
    actorType: 'employee',
    actorId,
    action: 'task.updated',
    entityType: 'task',
    entityId: id,
    newValue: data,
  });
  return updated;
}

export async function transitionTask(
  id: string,
  toStatus: TaskStatus,
  actorId: string | null,
  actorType: ActorType = 'employee',
  callerPrivileges?: PrivilegeCode[]
) {
  // System jobs skip specialty checks; employee callers must pass privileges.
  const task = await getTask(id, actorType === 'system' ? undefined : callerPrivileges);
  assertTransition(TASK_TRANSITIONS, task.status, toStatus, 'task');

  const now = new Date();
  const pastDue = Boolean(task.dueAt && now.getTime() > new Date(task.dueAt).getTime());
  const isLate =
    task.isLate || task.status === 'late' || toStatus === 'late' || (toStatus === 'done' && pastDue);
  const completedAt = toStatus === 'done' ? now : null;

  await prisma.task.update({
    where: { id },
    data: {
      status: toStatus,
      completedAt,
      completedById: toStatus === 'done' ? actorId : null,
      isLate: toStatus === 'late' ? true : isLate && toStatus === 'done',
    },
  });

  await transitionEntityStatus({
    entityType: 'task',
    entityId: id,
    fromStatus: task.status,
    toStatus,
    triggeredByType: actorType,
    triggeredById: actorId,
    actorType,
    actorId,
    action: 'task.status_change',
  });

  if (toStatus === 'done' && task.assignedEmployeeId) {
    await applyRatingForTask(task.assignedEmployeeId, id, isLate);
  }

  return getTask(id, actorType === 'system' ? undefined : callerPrivileges);
}

export async function markOverdueTasks() {
  const now = new Date();
  const overdue = await prisma.task.findMany({
    where: {
      deletedAt: null,
      status: { in: ['pending', 'in_progress'] },
      dueAt: { lt: now },
    },
  });

  for (const task of overdue) {
    // triggeredById is nullable — system jobs must not pass a fake employee id
    await transitionTask(task.id, 'late', null, 'system');
    if (task.assignedEmployeeId) {
      await createNotification({
        employeeId: task.assignedEmployeeId,
        type: 'task_late',
        title: 'مهمة متأخرة',
        body: task.title,
        payload: { taskId: task.id },
      });
    }
  }
  return overdue.length;
}

export async function autoActivateCourses() {
  return syncAllCourseLifecycles();
}

export function getCourseAllowedTransitions(status: CourseStatus) {
  // Only archive is manual; other statuses advance via syncCourseLifecycleStatus.
  const all = getAllowedTransitions(COURSE_TRANSITIONS, status);
  return all.filter((s) => s === 'archived');
}

export async function softDeleteCourse(id: string, actorId: string) {
  await getCourse(id);
  await prisma.course.update({ where: { id }, data: { deletedAt: new Date() } });
  await writeAuditLog({
    actorType: 'employee',
    actorId,
    action: 'course.deleted',
    entityType: 'course',
    entityId: id,
  });
}

export type SuggestedAssignee = {
  id: string;
  fullName: string;
  openTaskCount: number;
  absentToday: boolean;
};

/** Rank active employees who can cover a specialty by open-task load (fewest first). */
export async function suggestTaskAssignees(specialty: TaskSpecialty): Promise<SuggestedAssignee[]> {
  const privilegeCodes = SPECIALTY_TO_PRIVILEGE[specialty];
  if (!privilegeCodes?.length) return [];

  const today = new Date();
  const todayDate = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));

  const candidates = await prisma.employee.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      privileges: {
        some: { privilege: { code: { in: privilegeCodes } } },
      },
    },
    select: {
      id: true,
      fullName: true,
      assignedTasks: {
        where: {
          deletedAt: null,
          status: { in: ['pending', 'in_progress', 'late'] },
        },
        select: { id: true },
      },
      absences: {
        where: { date: todayDate },
        select: { id: true },
      },
    },
  });

  return candidates
    .map((c) => ({
      id: c.id,
      fullName: c.fullName,
      openTaskCount: c.assignedTasks.length,
      absentToday: c.absences.length > 0,
    }))
    .sort((a, b) => {
      if (a.openTaskCount !== b.openTaskCount) return a.openTaskCount - b.openTaskCount;
      if (a.absentToday !== b.absentToday) return a.absentToday ? 1 : -1;
      return a.fullName.localeCompare(b.fullName, 'ar');
    });
}

export { SPECIALTY_TO_PRIVILEGE };
