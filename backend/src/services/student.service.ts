import {
  EnrollmentStatus,
  PaymentStatus,
  AttendanceStatus,
  CertificateStatus,
  EvaluationSubmitVia,
  Prisma,
  StudentStatus,
} from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import {
  assertTransition,
  ENROLLMENT_TRANSITIONS,
  getAllowedTransitions,
  PAYMENT_TRANSITIONS,
} from '../state-machines/transitions.js';
import { transitionEntityStatus, writeAuditLog } from './audit.service.js';
import {
  assertStudentCanEnroll,
  completeCourseEnrollments,
  reactivateStudentOnEnrollment,
  startAttendingEnrollments,
} from './enrollment-status.service.js';
import { NotFoundError, ValidationError, ConflictError } from '../lib/errors.js';
import { normalizeSearchText, generateToken } from '../lib/crypto.js';
import { paymentStatusFromAmounts, toMinor, addMinor, subtractMinor } from '../lib/money.js';
import { createStudentFromLead } from './enrollment-bridge.service.js';
import { creditTeacherForSession } from './wallet.service.js';
import { createNotification } from './notification.service.js';
import { config, PrivilegeCode } from '../config/index.js';
import { assertCourseInstructorAccess } from './course.service.js';

export type EvaluationScores = {
  courseScore: number;
  teacherScore: number;
  hallScore: number;
  comment?: string;
  recommendedCourses?: string;
  benefitLevel: number;
  benefitReason?: string;
};

function assertScore(value: unknown, field: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 10) {
    throw new ValidationError(`${field} must be an integer between 1 and 10`);
  }
  return n;
}

function normalizeEvaluationScores(input: Partial<EvaluationScores>): EvaluationScores {
  return {
    courseScore: assertScore(input.courseScore, 'courseScore'),
    teacherScore: assertScore(input.teacherScore, 'teacherScore'),
    hallScore: assertScore(input.hallScore, 'hallScore'),
    benefitLevel: assertScore(input.benefitLevel, 'benefitLevel'),
    comment: input.comment?.trim() || undefined,
    recommendedCourses: input.recommendedCourses?.trim() || undefined,
    benefitReason: input.benefitReason?.trim() || undefined,
  };
}

function evalLink(token: string) {
  return `${config.appUrl.replace(/\/$/, '')}/eval/${token}`;
}

export async function listStudents(search?: string) {
  return prisma.student.findMany({
    where: {
      deletedAt: null,
      ...(search
        ? {
            OR: [
              { fullName: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search } },
              { searchText: { contains: normalizeSearchText(search) } },
            ],
          }
        : {}),
    },
    include: {
      enrollments: {
        include: { course: { select: { id: true, name: true } } },
      },
    },
    orderBy: { fullName: 'asc' },
  });
}

const PERSON = { select: { id: true, fullName: true } } as const;

type AttendanceCounts = Record<AttendanceStatus, number> & { total: number };

function emptyAttendanceCounts(): AttendanceCounts {
  return { total: 0, present: 0, late: 0, absent: 0, excused: 0 };
}

export async function getStudent(id: string) {
  const student = await prisma.student.findFirst({
    where: { id, deletedAt: null },
    include: {
      enrollments: {
        include: {
          course: true,
          payments: {
            orderBy: { paidAt: 'desc' },
            include: { receivedBy: PERSON, voidedBy: PERSON },
          },
          refunds: { orderBy: { createdAt: 'desc' }, include: { initiatedBy: PERSON } },
          certificates: true,
        },
        orderBy: { enrolledAt: 'desc' },
      },
      attendance: {
        include: {
          session: { include: { course: { select: { name: true } } } },
        },
        orderBy: { markedAt: 'desc' },
        take: 50,
      },
      evaluations: { orderBy: { submittedAt: 'desc' } },
    },
  });
  if (!student) throw new NotFoundError('Student not found');

  const enrollmentIds = student.enrollments.map((e) => e.id);
  const [transitions, attendanceRows] = await Promise.all([
    prisma.entityStatusTransition.findMany({
      where: {
        OR: [
          { entityType: 'student', entityId: id },
          { entityType: 'enrollment', entityId: { in: enrollmentIds } },
        ],
      },
      include: { triggeredBy: PERSON },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    prisma.sessionAttendance.findMany({
      where: { studentId: id },
      select: { status: true, session: { select: { courseId: true } } },
    }),
  ]);

  // Attendance counted over every marked session, not only the 50 rows listed above.
  const attendanceStats = { ...emptyAttendanceCounts(), byCourse: {} as Record<string, AttendanceCounts> };
  for (const row of attendanceRows) {
    const courseStats = (attendanceStats.byCourse[row.session.courseId] ??= emptyAttendanceCounts());
    attendanceStats.total += 1;
    attendanceStats[row.status] += 1;
    courseStats.total += 1;
    courseStats[row.status] += 1;
  }

  const courseByEnrollment = new Map(
    student.enrollments.map((e) => [e.id, { id: e.course.id, name: e.course.name }])
  );
  const statusHistory = transitions.map((tr) => ({
    id: tr.id,
    entityType: tr.entityType,
    entityId: tr.entityId,
    course: tr.entityType === 'enrollment' ? courseByEnrollment.get(tr.entityId) ?? null : null,
    fromStatus: tr.fromStatus,
    toStatus: tr.toStatus,
    reason: tr.reason,
    triggeredByType: tr.triggeredByType,
    triggeredBy: tr.triggeredBy,
    createdAt: tr.createdAt,
  }));

  return {
    ...student,
    enrollments: student.enrollments.map((e) => ({
      ...e,
      // "certified" is reached by issuing a certificate, never by a plain status change.
      allowedTransitions: getAllowedTransitions(ENROLLMENT_TRANSITIONS, e.enrollmentStatus).filter(
        (s) => s !== 'certified'
      ),
    })),
    attendanceStats,
    statusHistory,
  };
}

const STUDENT_STATUSES = new Set<string>(Object.values(StudentStatus));
/** Statuses that take a student out of normal activity need a written reason. */
const STATUS_NEEDS_REASON = new Set<StudentStatus>(['frozen', 'withdrawn', 'blocked']);

export async function setStudentStatus(
  id: string,
  toStatus: StudentStatus,
  actorId: string,
  reason?: string
) {
  if (!STUDENT_STATUSES.has(toStatus)) throw new ValidationError('حالة الطالب غير صالحة');
  const student = await prisma.student.findFirst({ where: { id, deletedAt: null } });
  if (!student) throw new NotFoundError('Student not found');
  if (student.status === toStatus) throw new ConflictError('الطالب بهذه الحالة بالفعل');

  const trimmed = typeof reason === 'string' ? reason.trim() : '';
  if (STATUS_NEEDS_REASON.has(toStatus) && !trimmed) {
    throw new ValidationError('اكتب سبب تغيير الحالة');
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.student.update({
      where: { id },
      data: { status: toStatus, statusReason: trimmed || null, statusChangedAt: new Date() },
    });
    await transitionEntityStatus(
      {
        entityType: 'student',
        entityId: id,
        fromStatus: student.status,
        toStatus,
        triggeredByType: 'employee',
        triggeredById: actorId,
        reason: trimmed || undefined,
        actorType: 'employee',
        actorId,
        action: 'student.status_change',
      },
      tx
    );
    return updated;
  });
}

export async function createStudent(data: {
  fullName: string;
  phone?: string;
  email?: string;
  notes?: string;
}) {
  if (data.phone) {
    const existing = await prisma.student.findFirst({
      where: { phone: data.phone, deletedAt: null },
    });
    if (existing) {
      throw new ConflictError('يوجد طالب بنفس رقم الهاتف', { studentId: existing.id });
    }
  }
  return prisma.student.create({
    data: {
      ...data,
      searchText: normalizeSearchText(data.fullName, data.phone),
    },
  });
}

export async function updateStudent(
  id: string,
  data: Partial<{ fullName: string; phone: string; email: string; notes: string }>
) {
  // Only profile fields: status changes go through setStudentStatus so they keep a history.
  const { fullName, phone, email, notes } = data;
  const current = await prisma.student.findFirst({ where: { id, deletedAt: null } });
  if (!current) throw new NotFoundError('Student not found');
  const nextName = fullName ?? current.fullName;
  const nextPhone = phone ?? current.phone ?? undefined;
  return prisma.student.update({
    where: { id },
    data: {
      fullName,
      phone,
      email,
      notes,
      searchText:
        fullName !== undefined || phone !== undefined
          ? normalizeSearchText(nextName, nextPhone)
          : undefined,
    },
  });
}

const ENROLLABLE_COURSE_STATUSES = new Set(['enrollment_open', 'active']);

/** Shared gate for enrollStudent and lead conversion. */
export async function assertCourseAcceptsEnrollment(
  courseId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  const course = await client.course.findUnique({ where: { id: courseId } });
  if (!course) throw new NotFoundError('Course not found');
  if (course.deletedAt) throw new NotFoundError('Course not found');
  if (!ENROLLABLE_COURSE_STATUSES.has(course.status)) {
    throw new ConflictError(
      `لا يمكن التسجيل في دورة بحالة «${course.status}» — يجب أن تكون مفتوحة للتسجيل أو نشطة`
    );
  }
  const activeCount = await client.enrollment.count({
    where: {
      courseId,
      enrollmentStatus: { not: 'dropped' },
    },
  });
  if (activeCount >= course.capacity) {
    throw new ConflictError(`الدورة ممتلئة (السعة ${course.capacity})`);
  }
  return course;
}

export async function enrollStudent(
  courseId: string,
  studentId: string,
  actorId: string,
  leadId?: string,
  totalPriceMinor?: bigint
) {
  const student = await prisma.student.findFirst({ where: { id: studentId, deletedAt: null } });
  if (!student) throw new NotFoundError('Student not found');
  assertStudentCanEnroll(student);

  const existing = await prisma.enrollment.findUnique({
    where: { studentId_courseId: { studentId, courseId } },
  });
  if (existing) throw new ConflictError('الطالب مسجّل في هذه الدورة بالفعل');

  const course = await assertCourseAcceptsEnrollment(courseId);

  const enrollment = await prisma.enrollment.create({
    data: {
      studentId,
      courseId,
      leadId,
      totalPriceMinor: totalPriceMinor ?? course.priceMinor,
      amountPaidMinor: 0n,
      enrollmentStatus: 'enrolled',
      paymentStatus: 'unpaid',
    },
  });

  await writeAuditLog({
    actorType: 'employee',
    actorId,
    action: 'enrollment.created',
    entityType: 'enrollment',
    entityId: enrollment.id,
    newValue: { studentId, courseId },
  });

  await reactivateStudentOnEnrollment(student, actorId);

  return enrollment;
}

export async function transitionEnrollment(
  id: string,
  toStatus: EnrollmentStatus,
  actorId: string,
  reason?: string
) {
  const enrollment = await prisma.enrollment.findUnique({
    where: { id },
    include: { course: true, student: true },
  });
  if (!enrollment) throw new NotFoundError('Enrollment not found');

  if (toStatus === 'certified') {
    throw new ConflictError('تُمنح حالة «حاصل على شهادة» عند إصدار الشهادة فقط');
  }
  assertTransition(ENROLLMENT_TRANSITIONS, enrollment.enrollmentStatus, toStatus, 'enrollment');

  const trimmed = typeof reason === 'string' ? reason.trim() : '';
  if (toStatus === 'dropped' && !trimmed) {
    throw new ValidationError('اكتب سبب الانسحاب');
  }

  // Reinstating a dropped student takes a seat again.
  if (enrollment.enrollmentStatus === 'dropped' && toStatus === 'enrolled') {
    assertStudentCanEnroll(enrollment.student);
    if (enrollment.course.deletedAt || enrollment.course.status === 'archived') {
      throw new ConflictError('لا يمكن إعادة التسجيل في دورة مؤرشفة');
    }
    const seatsTaken = await prisma.enrollment.count({
      where: { courseId: enrollment.courseId, enrollmentStatus: { not: 'dropped' } },
    });
    if (seatsTaken >= enrollment.course.capacity) {
      throw new ConflictError(`الدورة ممتلئة (السعة ${enrollment.course.capacity})`);
    }
  }

  const updated = await prisma.enrollment.update({
    where: { id },
    data: { enrollmentStatus: toStatus },
  });

  await transitionEntityStatus({
    entityType: 'enrollment',
    entityId: id,
    fromStatus: enrollment.enrollmentStatus,
    toStatus,
    triggeredByType: 'employee',
    triggeredById: actorId,
    reason: trimmed || undefined,
    actorType: 'employee',
    actorId,
    action: 'enrollment.status_change',
  });

  return updated;
}

export async function recordPayment(
  enrollmentId: string,
  amountMinor: bigint,
  receivedById: string,
  method?: string,
  note?: string
) {
  if (amountMinor <= 0n) throw new ValidationError('المبلغ يجب أن يكون أكبر من صفر');

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM enrollments WHERE id = ${enrollmentId} FOR UPDATE`;

    const enrollment = await tx.enrollment.findUnique({ where: { id: enrollmentId } });
    if (!enrollment) throw new NotFoundError('Enrollment not found');

    const newPaid = addMinor(enrollment.amountPaidMinor, amountMinor);
    if (newPaid > enrollment.totalPriceMinor) {
      throw new ValidationError('مبلغ الدفع يتجاوز إجمالي سعر التسجيل');
    }

    const payment = await tx.studentPayment.create({
      data: {
        enrollmentId,
        amountMinor,
        receivedById,
        method: method?.trim() || undefined,
        note: note?.trim() || undefined,
      },
    });

    const paymentStatus = paymentStatusFromAmounts(enrollment.totalPriceMinor, newPaid);

    if (enrollment.paymentStatus !== paymentStatus) {
      assertTransition(PAYMENT_TRANSITIONS, enrollment.paymentStatus, paymentStatus, 'payment');
    }

    const updated = await tx.enrollment.update({
      where: { id: enrollmentId },
      data: { amountPaidMinor: newPaid, paymentStatus },
    });
    // The new payment rides along so the UI can print its receipt straight away.
    return { ...updated, payment };
  });
}

export async function voidPayment(paymentId: string, actorId: string, reason: string) {
  const trimmed = reason?.trim();
  if (!trimmed) throw new ValidationError('سبب الإلغاء مطلوب');

  return prisma.$transaction(async (tx) => {
    const payment = await tx.studentPayment.findUnique({
      where: { id: paymentId },
    });
    if (!payment) throw new NotFoundError('Payment not found');
    if (payment.voidedAt) throw new ValidationError('هذه الدفعة ملغاة بالفعل');

    await tx.$queryRaw`SELECT id FROM enrollments WHERE id = ${payment.enrollmentId} FOR UPDATE`;

    const enrollment = await tx.enrollment.findUnique({ where: { id: payment.enrollmentId } });
    if (!enrollment) throw new NotFoundError('Enrollment not found');

    await tx.studentPayment.update({
      where: { id: paymentId },
      data: {
        voidedAt: new Date(),
        voidedById: actorId,
        voidReason: trimmed,
      },
    });

    const newPaid = subtractMinor(enrollment.amountPaidMinor, payment.amountMinor);
    if (newPaid < 0n) {
      throw new ValidationError('لا يمكن إلغاء دفعة تتجاوز المبلغ المدفوع المسجل');
    }
    const paymentStatus = paymentStatusFromAmounts(enrollment.totalPriceMinor, newPaid);

    if (enrollment.paymentStatus !== paymentStatus) {
      assertTransition(PAYMENT_TRANSITIONS, enrollment.paymentStatus, paymentStatus, 'payment');
    }

    const updated = await tx.enrollment.update({
      where: { id: enrollment.id },
      data: { amountPaidMinor: newPaid, paymentStatus },
    });

    await writeAuditLog({
      actorType: 'employee',
      actorId,
      action: 'student_payment.voided',
      entityType: 'student_payment',
      entityId: paymentId,
      newValue: {
        voidReason: trimmed,
        amountMinor: payment.amountMinor.toString(),
        enrollmentId: enrollment.id,
        paymentStatus,
      },
    });

    return updated;
  });
}

export async function recordAttendance(
  sessionId: string,
  records: { studentId: string; status: AttendanceStatus }[],
  markedById: string,
  actorPrivileges: PrivilegeCode[]
) {
  const sessionPreview = await prisma.courseSession.findUnique({
    where: { id: sessionId },
    include: { course: true },
  });
  if (!sessionPreview) throw new NotFoundError('Session not found');
  await assertCourseInstructorAccess(sessionPreview.courseId, markedById, actorPrivileges);

  const { results, evalNotify } = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM course_sessions WHERE id = ${sessionId} FOR UPDATE`;

    const session = await tx.courseSession.findUnique({
      where: { id: sessionId },
      include: { course: true },
    });
    if (!session) throw new NotFoundError('Session not found');

    const results = [];
    for (const r of records) {
      const row = await tx.sessionAttendance.upsert({
        where: {
          sessionId_studentId: { sessionId, studentId: r.studentId },
        },
        create: {
          sessionId,
          studentId: r.studentId,
          status: r.status,
          markedById,
        },
        update: { status: r.status, markedById, markedAt: new Date() },
      });
      results.push(row);
    }

    await startAttendingEnrollments(
      session.courseId,
      records.filter((r) => r.status === 'present' || r.status === 'late').map((r) => r.studentId),
      tx
    );

    const wasIncomplete = session.status !== 'completed';
    if (wasIncomplete) {
      await tx.courseSession.update({
        where: { id: sessionId },
        data: { status: 'completed' },
      });
    }

    if (wasIncomplete && session.course.primaryInstructorId) {
      await creditTeacherForSession(sessionId, session.course.primaryInstructorId, tx);
    }

    let evalNotify: { courseId: string; courseName: string } | null = null;
    const totalSessions = session.course.sessionCount;
    if (session.sessionNumber === totalSessions) {
      await tx.course.update({
        where: { id: session.courseId },
        data: { status: 'completed' },
      });
      await completeCourseEnrollments(session.courseId, tx);
      if (wasIncomplete) {
        const ensured = await ensurePostCourseEvaluationCampaign(
          session.courseId,
          sessionId,
          tx
        );
        if (ensured.created) {
          evalNotify = { courseId: session.courseId, courseName: session.course.name };
        }
      }
    }

    return { results, evalNotify };
  });

  if (evalNotify) {
    await notifyEvaluationCampaignReady(evalNotify.courseId, evalNotify.courseName);
  }

  return results;
}

async function notifyEvaluationCampaignReady(courseId: string, courseName: string) {
  const staff = await prisma.employee.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      privileges: {
        some: { privilege: { code: { in: ['admin', 'operation'] } } },
      },
    },
    select: { id: true },
  });

  await Promise.all(
    staff.map((emp) =>
      createNotification({
        employeeId: emp.id,
        type: 'evaluation_campaign',
        title: 'روابط تقييم الدورة جاهزة',
        body: `تم إنشاء روابط تقييم لـ «${courseName}». يمكن نسخها من صفحة الدورة.`,
        payload: { courseId },
      })
    )
  );
}

/** Idempotent: creates a post_course campaign only if none exists yet. */
export async function ensurePostCourseEvaluationCampaign(
  courseId: string,
  sessionId?: string,
  client?: Prisma.TransactionClient
) {
  const db = client ?? prisma;
  const existing = await db.evaluationCampaign.findFirst({
    where: { courseId, type: 'post_course' },
    orderBy: { opensAt: 'desc' },
  });
  if (existing) return { campaign: existing, tokens: [], created: false as const };

  const course = await db.course.findUnique({ where: { id: courseId } });
  if (!course) throw new NotFoundError('Course not found');

  const result = await createEvaluationCampaign(courseId, 'post_course', sessionId, undefined, db);
  if (!client) {
    await notifyEvaluationCampaignReady(courseId, course.name);
  }
  return { ...result, created: true as const };
}

export async function issueCertificate(enrollmentId: string, issuedById: string) {
  const enrollment = await prisma.enrollment.findUnique({ where: { id: enrollmentId } });
  if (!enrollment) throw new NotFoundError('Enrollment not found');

  if (!['completed', 'certified'].includes(enrollment.enrollmentStatus)) {
    throw new ConflictError('لا يمكن إصدار شهادة إلا بعد إكمال الدورة');
  }
  if (enrollment.paymentStatus !== 'paid_in_full') {
    throw new ConflictError('لا يمكن إصدار شهادة قبل سداد الرسوم بالكامل');
  }

  const existingIssued = await prisma.certificate.findFirst({
    where: { enrollmentId, status: 'issued' },
  });
  if (existingIssued) {
    throw new ConflictError('توجد شهادة صادرة بالفعل — استخدم إعادة الإصدار');
  }

  const cert = await prisma.certificate.create({
    data: {
      enrollmentId,
      issuedAt: new Date(),
      status: 'issued',
      issuedById,
    },
  });

  if (enrollment.enrollmentStatus === 'completed') {
    assertTransition(ENROLLMENT_TRANSITIONS, 'completed', 'certified', 'enrollment');
    await prisma.enrollment.update({
      where: { id: enrollmentId },
      data: { enrollmentStatus: 'certified' },
    });
    await transitionEntityStatus({
      entityType: 'enrollment',
      entityId: enrollmentId,
      fromStatus: 'completed',
      toStatus: 'certified',
      triggeredByType: 'employee',
      triggeredById: issuedById,
      actorType: 'employee',
      actorId: issuedById,
      action: 'enrollment.certified',
    });
  }

  return cert;
}

/** Revoke the current issued certificate and issue a replacement. */
export async function reissueCertificate(enrollmentId: string, issuedById: string) {
  const enrollment = await prisma.enrollment.findUnique({ where: { id: enrollmentId } });
  if (!enrollment) throw new NotFoundError('Enrollment not found');

  if (!['completed', 'certified'].includes(enrollment.enrollmentStatus)) {
    throw new ConflictError('لا يمكن إعادة إصدار شهادة إلا بعد إكمال الدورة');
  }
  if (enrollment.paymentStatus !== 'paid_in_full') {
    throw new ConflictError('لا يمكن إعادة إصدار شهادة قبل سداد الرسوم بالكامل');
  }

  const cert = await prisma.$transaction(async (tx) => {
    await tx.certificate.updateMany({
      where: { enrollmentId, status: 'issued' },
      data: { status: 'revoked' },
    });
    return tx.certificate.create({
      data: {
        enrollmentId,
        issuedAt: new Date(),
        status: 'issued',
        issuedById,
      },
    });
  });

  if (enrollment.enrollmentStatus === 'completed') {
    assertTransition(ENROLLMENT_TRANSITIONS, 'completed', 'certified', 'enrollment');
    await prisma.enrollment.update({
      where: { id: enrollmentId },
      data: { enrollmentStatus: 'certified' },
    });
    await transitionEntityStatus({
      entityType: 'enrollment',
      entityId: enrollmentId,
      fromStatus: 'completed',
      toStatus: 'certified',
      triggeredByType: 'employee',
      triggeredById: issuedById,
      actorType: 'employee',
      actorId: issuedById,
      action: 'enrollment.certified',
    });
  }

  return cert;
}

export async function createEvaluationCampaign(
  courseId: string,
  type: 'post_session' | 'post_course',
  sessionId?: string,
  closesAt?: Date,
  client?: Prisma.TransactionClient
) {
  const db = client ?? prisma;
  if (type === 'post_course') {
    const existing = await db.evaluationCampaign.findFirst({
      where: { courseId, type: 'post_course' },
    });
    if (existing) {
      throw new ValidationError('A post-course evaluation campaign already exists for this course');
    }
  }

  const campaign = await db.evaluationCampaign.create({
    data: {
      courseId,
      sessionId,
      type,
      opensAt: new Date(),
      closesAt,
    },
  });

  const enrollments = await db.enrollment.findMany({
    where: { courseId, enrollmentStatus: { in: ['enrolled', 'attending', 'completed'] } },
    include: { student: { select: { id: true, fullName: true } } },
  });

  const tokens = [];
  for (const e of enrollments) {
    const rawToken = generateToken(32);
    const token = await db.evaluationToken.create({
      data: {
        campaignId: campaign.id,
        studentId: e.studentId,
        token: rawToken,
        expiresAt: closesAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    tokens.push({
      studentId: e.studentId,
      studentName: e.student.fullName,
      token: rawToken,
      tokenId: token.id,
      link: evalLink(rawToken),
    });
  }

  return { campaign, tokens };
}

export async function listCourseEvaluationCampaigns(
  courseId: string,
  actorId: string,
  actorPrivileges: PrivilegeCode[]
) {
  await assertCourseInstructorAccess(courseId, actorId, actorPrivileges);

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, name: true },
  });
  if (!course) throw new NotFoundError('Course not found');

  const campaigns = await prisma.evaluationCampaign.findMany({
    where: { courseId },
    orderBy: { opensAt: 'desc' },
    include: {
      session: { select: { id: true, sessionNumber: true } },
      tokens: {
        include: {
          student: { select: { id: true, fullName: true, phone: true } },
        },
      },
      evaluations: {
        include: {
          student: { select: { id: true, fullName: true, phone: true } },
        },
      },
    },
  });

  return campaigns.map((campaign) => {
    const evalByStudent = new Map(campaign.evaluations.map((ev) => [ev.studentId, ev]));
    const scores = campaign.evaluations;
    const avg = (key: 'courseScore' | 'teacherScore' | 'hallScore' | 'benefitLevel') =>
      scores.length
        ? scores.reduce((sum, ev) => sum + ev[key], 0) / scores.length
        : null;

    const students = campaign.tokens.map((t) => {
      const ev = evalByStudent.get(t.studentId);
      const unused = !t.usedAt && t.expiresAt > new Date();
      return {
        studentId: t.studentId,
        studentName: t.student.fullName,
        phone: t.student.phone,
        tokenId: t.id,
        status: ev ? 'submitted' : unused ? 'pending' : 'expired',
        link: unused ? evalLink(t.token) : null,
        evaluation: ev
          ? {
              id: ev.id,
              courseScore: ev.courseScore,
              teacherScore: ev.teacherScore,
              hallScore: ev.hallScore,
              benefitLevel: ev.benefitLevel,
              comment: ev.comment,
              recommendedCourses: ev.recommendedCourses,
              benefitReason: ev.benefitReason,
              submittedAt: ev.submittedAt,
              submittedVia: ev.submittedVia,
            }
          : null,
      };
    });

    return {
      id: campaign.id,
      type: campaign.type,
      opensAt: campaign.opensAt,
      closesAt: campaign.closesAt,
      session: campaign.session,
      responseCount: scores.length,
      tokenCount: campaign.tokens.length,
      averages: {
        courseScore: avg('courseScore'),
        teacherScore: avg('teacherScore'),
        hallScore: avg('hallScore'),
        benefitLevel: avg('benefitLevel'),
      },
      students,
    };
  });
}

export async function getEvaluationByToken(rawToken: string) {
  const token = await prisma.evaluationToken.findFirst({
    where: { token: rawToken, usedAt: null, expiresAt: { gt: new Date() } },
    include: {
      campaign: { include: { course: true, session: true } },
      student: true,
    },
  });
  if (!token) throw new NotFoundError('Invalid or expired evaluation link');
  return token;
}

export async function submitEvaluationViaToken(rawToken: string, body: Partial<EvaluationScores>) {
  const scores = normalizeEvaluationScores(body);

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM evaluation_tokens WHERE token = ${rawToken} FOR UPDATE`;
    const token = await tx.evaluationToken.findFirst({
      where: { token: rawToken, usedAt: null, expiresAt: { gt: new Date() } },
      include: { campaign: true },
    });
    if (!token) throw new NotFoundError('Invalid or expired evaluation link');

    const existing = await tx.evaluation.findUnique({
      where: {
        campaignId_studentId: {
          campaignId: token.campaignId,
          studentId: token.studentId,
        },
      },
    });
    if (existing) throw new ConflictError('تم إرسال التقييم مسبقاً');

    const enrollment = await tx.enrollment.findUnique({
      where: {
        studentId_courseId: {
          studentId: token.studentId,
          courseId: token.campaign.courseId,
        },
      },
    });

    const evaluation = await tx.evaluation.create({
      data: {
        campaignId: token.campaignId,
        studentId: token.studentId,
        enrollmentId: enrollment?.id,
        ...scores,
        submittedVia: 'magic_link',
      },
    });

    await tx.evaluationToken.update({
      where: { id: token.id },
      data: { usedAt: new Date() },
    });

    return evaluation;
  });
}

export async function submitEvaluationViaStaff(
  enrollmentId: string,
  body: Partial<EvaluationScores> & { campaignId?: string },
  submittedById: string
) {
  const enrollment = await prisma.enrollment.findUnique({ where: { id: enrollmentId } });
  if (!enrollment) throw new NotFoundError('Enrollment not found');

  const campaignId = body.campaignId;
  if (!campaignId) throw new ValidationError('campaignId مطلوب');

  const scores = normalizeEvaluationScores(body);

  return prisma.$transaction(async (tx) => {
    const campaign = await tx.evaluationCampaign.findFirst({
      where: { id: campaignId, courseId: enrollment.courseId },
    });
    if (!campaign) throw new NotFoundError('Evaluation campaign not found for this course');

    const existing = await tx.evaluation.findUnique({
      where: {
        campaignId_studentId: {
          campaignId: campaign.id,
          studentId: enrollment.studentId,
        },
      },
    });
    if (existing) throw new ConflictError('تم إرسال التقييم مسبقاً لهذا الطالب والحملة');

    return tx.evaluation.create({
      data: {
        campaignId: campaign.id,
        studentId: enrollment.studentId,
        enrollmentId,
        ...scores,
        submittedVia: 'staff_proxy' as EvaluationSubmitVia,
        submittedById,
      },
    });
  });
}

export async function softDeleteStudent(id: string, actorId: string) {
  await prisma.student.update({ where: { id }, data: { deletedAt: new Date() } });
  await writeAuditLog({
    actorType: 'employee',
    actorId,
    action: 'student.deleted',
    entityType: 'student',
    entityId: id,
  });
}

export { createStudentFromLead, toMinor };
