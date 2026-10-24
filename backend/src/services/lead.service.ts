import { LeadStatus, ActorType, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import {
  assertTransition,
  getAllowedTransitions,
  LEAD_TRANSITIONS,
  PAYMENT_TRANSITIONS,
} from '../state-machines/transitions.js';
import { transitionEntityStatus, writeAuditLog } from './audit.service.js';
import { NotFoundError, ForbiddenError, ValidationError, ConflictError } from '../lib/errors.js';
import { normalizeSearchText } from '../lib/crypto.js';
import { PrivilegeCode } from '../config/index.js';
import { hasAnyPrivilege } from './auth.service.js';
import { createNotification } from './notification.service.js';
import { createStudentFromLead } from './enrollment-bridge.service.js';
import { toMinor, addMinor, paymentStatusFromAmounts } from '../lib/money.js';
import { assertCourseAcceptsEnrollment } from './student.service.js';
import {
  assertStudentCanEnroll,
  reactivateStudentOnEnrollment,
} from './enrollment-status.service.js';

/** Statuses from which convert-and-pay may start, with steps to enrolled. */
const CONVERT_STATUS_PATH: Partial<Record<LeadStatus, LeadStatus[]>> = {
  interested: ['paid', 'enrolled'],
  paid: ['enrolled'],
  enrolled: [],
};

export interface LeadFilters {
  status?: LeadStatus;
  sourceId?: string;
  assignedEmployeeId?: string;
  search?: string;
  interestArea?: string;
  leadClassification?: string;
  readyToRegister?: string;
}

export async function listLeads(
  filters: LeadFilters,
  callerPrivileges: PrivilegeCode[],
  callerId: string
) {
  const isAdmin = callerPrivileges.includes('admin');
  const isSales = callerPrivileges.includes('sales');

  const where: Record<string, unknown> = { deletedAt: null };
  if (filters.status) where.status = filters.status;
  if (filters.sourceId) where.sourceId = filters.sourceId;
  if (filters.interestArea) {
    where.extraData = { path: ['interest_area'], equals: filters.interestArea };
  }
  if (filters.leadClassification) {
    where.extraData = {
      ...(where.extraData as object),
      path: ['lead_classification'],
      equals: filters.leadClassification,
    };
  }
  if (filters.readyToRegister) {
    where.extraData = {
      path: ['ready_to_register'],
      equals: filters.readyToRegister,
    };
  }
  if (filters.search) {
    where.OR = [
      { fullName: { contains: filters.search, mode: 'insensitive' } },
      { phone: { contains: filters.search } },
      { searchText: { contains: normalizeSearchText(filters.search) } },
    ];
  }
  if (!isAdmin && isSales) {
    where.assignedEmployeeId = callerId;
  } else if (filters.assignedEmployeeId) {
    where.assignedEmployeeId = filters.assignedEmployeeId;
  }

  return prisma.lead.findMany({
    where,
    include: {
      source: true,
      requestedTrack: true,
      assignedEmployee: { select: { id: true, fullName: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function getLead(id: string) {
  const lead = await prisma.lead.findFirst({
    where: { id, deletedAt: null },
    include: {
      source: true,
      requestedTrack: true,
      assignedEmployee: { select: { id: true, fullName: true } },
      activities: { orderBy: { createdAt: 'desc' }, take: 50 },
      // What this lead turned into, so the CRM page can link to the student and the course.
      enrollments: {
        select: {
          id: true,
          enrollmentStatus: true,
          paymentStatus: true,
          enrolledAt: true,
          student: { select: { id: true, fullName: true } },
          course: { select: { id: true, name: true } },
        },
        orderBy: { enrolledAt: 'desc' },
      },
    },
  });
  if (!lead) throw new NotFoundError('Lead not found');
  return lead;
}

export async function createLead(
  data: {
    fullName: string;
    phone: string;
    sourceId: string;
    requestedTrackId?: string;
    requestedCourseText?: string;
    assignedEmployeeId?: string;
    notes?: string;
    extraData?: Record<string, unknown>;
    externalLeadId?: string;
    sourceSystem?: string;
    force?: boolean;
  },
  actorType: ActorType = 'employee',
  actorId?: string
) {
  const force = Boolean(data.force) || actorType === 'bot_webhook';
  if (data.phone && !force) {
    const dup = await prisma.lead.findFirst({
      where: { phone: data.phone, deletedAt: null },
      select: { id: true, fullName: true, status: true },
    });
    if (dup) {
      throw new ConflictError('يوجد عميل محتمل بنفس رقم الهاتف — أعد المحاولة مع force=true', {
        leadId: dup.id,
        fullName: dup.fullName,
        status: dup.status,
      });
    }
  }

  const lead = await prisma.lead.create({
    data: {
      fullName: data.fullName,
      phone: data.phone,
      sourceId: data.sourceId,
      requestedTrackId: data.requestedTrackId,
      requestedCourseText: data.requestedCourseText ?? (data.extraData?.interest_area as string),
      assignedEmployeeId: data.assignedEmployeeId,
      notes: data.notes,
      extraData: (data.extraData ?? {}) as Prisma.InputJsonValue,
      externalLeadId: data.externalLeadId,
      sourceSystem: data.sourceSystem,
      searchText: normalizeSearchText(data.fullName, data.phone),
      status: 'new',
    },
  });

  await prisma.leadActivity.create({
    data: {
      leadId: lead.id,
      type: 'created',
      body: 'Lead created',
      actorType,
      actorEmployeeId: actorId,
    },
  });

  await writeAuditLog({
    actorType,
    actorId: actorId ?? null,
    action: 'lead.created',
    entityType: 'lead',
    entityId: lead.id,
    newValue: { fullName: data.fullName, sourceId: data.sourceId },
  });

  if (data.assignedEmployeeId) {
    await createNotification({
      employeeId: data.assignedEmployeeId,
      type: 'new_lead',
      title: 'عميل محتمل جديد',
      body: `${data.fullName} — ${data.phone}`,
      payload: { leadId: lead.id },
    });
  }

  return getLead(lead.id);
}

export async function updateLead(
  id: string,
  data: Partial<{
    fullName: string;
    phone: string;
    requestedTrackId: string;
    requestedCourseText: string;
    notes: string;
  }>,
  actorId: string
) {
  const lead = await getLead(id);
  const updated = await prisma.lead.update({
    where: { id },
    data: {
      ...data,
      searchText: data.fullName
        ? normalizeSearchText(data.fullName, data.phone ?? lead.phone)
        : undefined,
    },
  });
  await writeAuditLog({
    actorType: 'employee',
    actorId,
    action: 'lead.updated',
    entityType: 'lead',
    entityId: id,
    oldValue: lead,
    newValue: data,
  });
  return updated;
}

export async function transitionLead(
  id: string,
  toStatus: LeadStatus,
  actorId: string,
  reason?: string
) {
  const lead = await getLead(id);
  assertTransition(LEAD_TRANSITIONS, lead.status, toStatus, 'lead');

  const clearFollowUp = toStatus === 'lost' || toStatus === 'archived';
  await prisma.lead.update({
    where: { id },
    data: {
      status: toStatus,
      ...(clearFollowUp ? { nextFollowUpAt: null, followUpFlaggedAt: null } : {}),
    },
  });

  await transitionEntityStatus({
    entityType: 'lead',
    entityId: id,
    fromStatus: lead.status,
    toStatus,
    triggeredByType: 'employee',
    triggeredById: actorId,
    reason,
    actorType: 'employee',
    actorId,
    action: 'lead.status_change',
  });

  await prisma.leadActivity.create({
    data: {
      leadId: id,
      type: 'status_change',
      body: `${lead.status} → ${toStatus}${reason ? `: ${reason}` : ''}`,
      actorType: 'employee',
      actorEmployeeId: actorId,
    },
  });

  if (toStatus === 'enrolled') {
    // Lead has no studentId FK — link is by phone (find-or-create Student)
    await createStudentFromLead(id);
  }

  return getLead(id);
}

export async function assignLead(id: string, employeeId: string, actorId: string) {
  const lead = await getLead(id);
  await prisma.lead.update({
    where: { id },
    data: { assignedEmployeeId: employeeId },
  });
  await writeAuditLog({
    actorType: 'employee',
    actorId,
    action: 'lead.assigned',
    entityType: 'lead',
    entityId: id,
    oldValue: { assignedEmployeeId: lead.assignedEmployeeId },
    newValue: { assignedEmployeeId: employeeId },
  });
  await createNotification({
    employeeId,
    type: 'lead_assigned',
    title: 'تم تعيين عميل لك',
    body: lead.fullName,
    payload: { leadId: id },
  });
  return getLead(id);
}

export async function addLeadNote(id: string, body: string, actorId: string) {
  await getLead(id);
  return prisma.leadActivity.create({
    data: {
      leadId: id,
      type: 'note',
      body,
      actorType: 'employee',
      actorEmployeeId: actorId,
    },
  });
}

export function getLeadAllowedTransitions(status: LeadStatus) {
  return getAllowedTransitions(LEAD_TRANSITIONS, status);
}

export async function assertLeadAccess(
  leadId: string,
  callerId: string,
  privileges: PrivilegeCode[]
) {
  if (hasAnyPrivilege(privileges, ['admin'])) return;
  const lead = await getLead(leadId);
  if (lead.assignedEmployeeId !== callerId) {
    throw new ForbiddenError('Not assigned to this lead');
  }
}

/** Set or clear the independent follow-up reminder on a non-terminal lead. */
export async function setLeadFollowUp(
  id: string,
  nextFollowUpAt: Date | null,
  actorId: string
) {
  const lead = await getLead(id);
  if (lead.status === 'lost' || lead.status === 'archived') {
    throw new ValidationError('لا يمكن تعيين متابعة لعميل مغلق أو مؤرشف');
  }

  const updated = await prisma.lead.update({
    where: { id },
    data: {
      nextFollowUpAt,
      followUpFlaggedAt: null,
    },
  });

  await writeAuditLog({
    actorType: 'employee',
    actorId,
    action: 'lead.follow_up_set',
    entityType: 'lead',
    entityId: id,
    oldValue: { nextFollowUpAt: lead.nextFollowUpAt },
    newValue: { nextFollowUpAt },
  });

  await prisma.leadActivity.create({
    data: {
      leadId: id,
      type: 'follow_up',
      body: nextFollowUpAt
        ? `متابعة مجدولة: ${nextFollowUpAt.toISOString()}`
        : 'تم إلغاء موعد المتابعة',
      actorType: 'employee',
      actorEmployeeId: actorId,
    },
  });

  return updated;
}

export async function softDeleteLead(id: string, actorId: string) {
  await getLead(id);
  await prisma.lead.update({ where: { id }, data: { deletedAt: new Date() } });
  await writeAuditLog({
    actorType: 'employee',
    actorId,
    action: 'lead.deleted',
    entityType: 'lead',
    entityId: id,
  });
}

/**
 * Close the cash loop from CRM: advance lead → student → enroll → optional first payment.
 * Sales can use this without needing separate enroll/payment privileges.
 */
export async function convertLeadWithPayment(
  leadId: string,
  data: {
    courseId: string;
    amountMinor: bigint | number | string;
    method?: string;
    note?: string;
    totalPriceMinor?: bigint | number | string;
  },
  actorId: string,
  actorPrivileges: PrivilegeCode[]
) {
  if (!hasAnyPrivilege(actorPrivileges, ['admin', 'sales', 'operation', 'accountant'])) {
    throw new ForbiddenError('Insufficient privileges');
  }
  // Sales only for their assigned leads; ops/finance/admin can convert any
  if (!hasAnyPrivilege(actorPrivileges, ['admin', 'operation', 'accountant'])) {
    await assertLeadAccess(leadId, actorId, actorPrivileges);
  }

  let lead = await getLead(leadId);
  const path = CONVERT_STATUS_PATH[lead.status];
  if (path === undefined) {
    throw new ValidationError(
      'لا يمكن التحويل من هذه الحالة — انقل العميل إلى مهتم أو مدفوع أولاً'
    );
  }

  const course = await prisma.course.findFirst({
    where: { id: data.courseId, deletedAt: null },
  });
  if (!course) throw new NotFoundError('Course not found');
  if (!['enrollment_open', 'active'].includes(course.status)) {
    throw new ConflictError(
      `لا يمكن التسجيل في دورة بحالة «${course.status}» — يجب أن تكون مفتوحة للتسجيل أو نشطة`
    );
  }

  const amountMinor = typeof data.amountMinor === 'bigint' ? data.amountMinor : toMinor(data.amountMinor);
  if (amountMinor < 0n) throw new ValidationError('مبلغ الدفعة غير صالح');

  const totalPriceMinor =
    data.totalPriceMinor != null
      ? typeof data.totalPriceMinor === 'bigint'
        ? data.totalPriceMinor
        : toMinor(data.totalPriceMinor)
      : course.priceMinor;

  // Advance intermediate statuses only — leave terminal `enrolled` until enrollment/payment succeed
  const intermediate = path.filter((s) => s !== 'enrolled');
  for (const step of intermediate) {
    lead = await transitionLead(leadId, step, actorId, 'تحويل وتسجيل في دورة');
  }

  // Assigned inside the transaction; the cast keeps TypeScript from narrowing it to null.
  let payment = null as { id: string; receiptNo: number } | null;
  const conversion = await prisma.$transaction(async (tx) => {
    const currentLead = await tx.lead.findUnique({ where: { id: leadId } });
    if (!currentLead) throw new NotFoundError('Lead not found');

    let student = currentLead.phone
      ? await tx.student.findFirst({
          where: { phone: currentLead.phone, deletedAt: null },
        })
      : null;

    if (!student) {
      student = await tx.student.create({
        data: {
          fullName: currentLead.fullName,
          phone: currentLead.phone,
          searchText: normalizeSearchText(currentLead.fullName, currentLead.phone),
        },
      });
    }

    let enrollment = await tx.enrollment.findUnique({
      where: { studentId_courseId: { studentId: student.id, courseId: course.id } },
    });

    if (enrollment) {
      await tx.$queryRaw`SELECT id FROM enrollments WHERE id = ${enrollment.id} FOR UPDATE`;
      enrollment = await tx.enrollment.findUniqueOrThrow({ where: { id: enrollment.id } });
    } else {
      assertStudentCanEnroll(student);
      await assertCourseAcceptsEnrollment(course.id, tx);
      await reactivateStudentOnEnrollment(student, actorId, tx);
      enrollment = await tx.enrollment.create({
        data: {
          studentId: student.id,
          courseId: course.id,
          leadId,
          totalPriceMinor,
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
        newValue: { studentId: student.id, courseId: course.id },
      });
    }

    if (amountMinor > 0n) {
      const newPaid = addMinor(enrollment.amountPaidMinor, amountMinor);
      if (newPaid > enrollment.totalPriceMinor) {
        throw new ValidationError('مبلغ الدفع يتجاوز إجمالي سعر التسجيل');
      }
      payment = await tx.studentPayment.create({
        data: {
          enrollmentId: enrollment.id,
          amountMinor,
          receivedById: actorId,
          method: data.method,
          note: data.note || 'دفعة من تحويل العميل',
        },
      });
      const paymentStatus = paymentStatusFromAmounts(enrollment.totalPriceMinor, newPaid);
      if (enrollment.paymentStatus !== paymentStatus) {
        assertTransition(PAYMENT_TRANSITIONS, enrollment.paymentStatus, paymentStatus, 'payment');
      }
      enrollment = await tx.enrollment.update({
        where: { id: enrollment.id },
        data: { amountPaidMinor: newPaid, paymentStatus },
      });
    }

    return { student, enrollment };
  });

  // Only now move lead to terminal enrolled (createStudentFromLead is idempotent by phone)
  if (lead.status !== 'enrolled') {
    lead = await transitionLead(leadId, 'enrolled', actorId, 'تحويل وتسجيل في دورة');
  }

  await prisma.leadActivity.create({
    data: {
      leadId,
      type: 'conversion',
      body: `تسجيل في دورة «${course.name}»${amountMinor > 0n ? ` + دفعة` : ''}`,
      actorType: 'employee',
      actorEmployeeId: actorId,
    },
  });

  await writeAuditLog({
    actorType: 'employee',
    actorId,
    action: 'lead.convert_with_payment',
    entityType: 'lead',
    entityId: leadId,
    newValue: {
      courseId: course.id,
      enrollmentId: conversion.enrollment.id,
      studentId: conversion.student.id,
      amountMinor: amountMinor.toString(),
    },
  });

  return {
    lead: await getLead(leadId),
    student: conversion.student,
    enrollment: conversion.enrollment,
    // Set when money was taken, so the UI can offer its receipt.
    payment: payment ? { id: payment.id, receiptNo: payment.receiptNo } : null,
    course: { id: course.id, name: course.name, priceMinor: course.priceMinor },
  };
}
