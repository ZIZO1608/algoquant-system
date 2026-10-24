import { prisma } from '../lib/prisma.js';
import { hashPassword } from './auth.service.js';
import { writeAuditLog } from './audit.service.js';
import { NotFoundError, ValidationError, ConflictError } from '../lib/errors.js';
import { PrivilegeCode } from '../config/index.js';
import { normalizeSearchText } from '../lib/crypto.js';
import { OPEN_TASK_STATUSES } from '../lib/tasks.js';

function stripSecrets<T extends { passwordHash?: string }>(employee: T) {
  const { passwordHash: _passwordHash, ...safe } = employee;
  return safe;
}

/** Full HR payload for admin Settings (salary, wallet, etc.). */
export async function listEmployees(includeDeleted = false) {
  const rows = await prisma.employee.findMany({
    where: includeDeleted ? {} : { deletedAt: null },
    include: {
      privileges: { include: { privilege: true } },
      wallet: true,
    },
    orderBy: { fullName: 'asc' },
  });
  return rows.map(stripSecrets);
}

/**
 * Safe directory for assignee / chat pickers.
 * Active staff only — no salary, wallet, or password hash.
 */
export async function listEmployeeDirectory() {
  return prisma.employee.findMany({
    where: { deletedAt: null, isActive: true },
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      isActive: true,
      isSalaried: true,
      privileges: { include: { privilege: true } },
    },
    orderBy: { fullName: 'asc' },
  });
}

export async function getEmployee(id: string) {
  const employee = await prisma.employee.findFirst({
    where: { id, deletedAt: null },
    include: {
      privileges: { include: { privilege: true } },
      wallet: true,
      rating: true,
    },
  });
  if (!employee) throw new NotFoundError('Employee not found');
  return stripSecrets(employee);
}

function normalizeSalaryDay(day?: number | null) {
  const n = Number(day);
  if (!Number.isFinite(n)) return 1;
  return Math.min(28, Math.max(1, Math.round(n)));
}

export async function createEmployee(
  data: {
    email: string;
    password: string;
    fullName: string;
    phone?: string;
    isSalaried?: boolean;
    monthlySalaryMinor?: bigint;
    salaryDayOfMonth?: number | null;
    privilegeCodes?: PrivilegeCode[];
  },
  actorId: string
) {
  const existing = await prisma.employee.findUnique({ where: { email: data.email } });
  if (existing) throw new ValidationError('Email already in use');

  const isSalaried = data.isSalaried !== false;
  if (isSalaried && (!data.monthlySalaryMinor || data.monthlySalaryMinor <= 0n)) {
    throw new ValidationError('يجب تحديد الراتب الشهري لموظفي الراتب الثابت');
  }

  const passwordHash = await hashPassword(data.password);
  const employee = await prisma.employee.create({
    data: {
      email: data.email,
      passwordHash,
      fullName: data.fullName,
      phone: data.phone,
      isSalaried,
      monthlySalaryMinor: isSalaried ? data.monthlySalaryMinor : null,
      salaryDayOfMonth: isSalaried ? normalizeSalaryDay(data.salaryDayOfMonth) : null,
    },
  });

  await prisma.wallet.create({
    data: { ownerId: employee.id },
  });

  if (data.privilegeCodes?.length) {
    await setEmployeePrivileges(employee.id, data.privilegeCodes, actorId);
  }

  // Add new hires to the shared team channel so they can read/send immediately.
  try {
    const { getOrCreateTeamChannel } = await import('./chat.service.js');
    await getOrCreateTeamChannel(employee.id);
  } catch {
    // non-blocking
  }

  await writeAuditLog({
    actorType: 'employee',
    actorId,
    action: 'employee.created',
    entityType: 'employee',
    entityId: employee.id,
    newValue: { email: data.email, fullName: data.fullName },
  });

  return getEmployee(employee.id);
}

const OPEN_LEAD_STATUSES = [
  'new',
  'contacted',
  'interested',
  'paid',
] as const;

export async function getEmployeeDependencies(employeeId: string) {
  const [leads, tasks, primaryCourses, instructorLinks] = await Promise.all([
    prisma.lead.findMany({
      where: {
        assignedEmployeeId: employeeId,
        deletedAt: null,
        status: { in: [...OPEN_LEAD_STATUSES] },
      },
      select: { id: true, fullName: true, status: true },
    }),
    prisma.task.findMany({
      where: {
        assignedEmployeeId: employeeId,
        deletedAt: null,
        status: { in: [...OPEN_TASK_STATUSES] },
      },
      select: { id: true, title: true, status: true, courseId: true },
    }),
    prisma.course.findMany({
      where: { primaryInstructorId: employeeId, deletedAt: null },
      select: { id: true, name: true, status: true },
    }),
    prisma.courseInstructor.findMany({
      where: { employeeId, course: { deletedAt: null } },
      select: { courseId: true, course: { select: { id: true, name: true, status: true } } },
    }),
  ]);

  const courseMap = new Map<string, { id: string; name: string; status: string }>();
  for (const c of primaryCourses) courseMap.set(c.id, c);
  for (const link of instructorLinks) {
    courseMap.set(link.course.id, link.course);
  }

  return {
    leads,
    tasks,
    courses: [...courseMap.values()],
    hasDependencies: leads.length + tasks.length + courseMap.size > 0,
  };
}

async function resolveEmployeeWork(
  employeeId: string,
  opts: { reassignToId?: string; confirmOrphan?: boolean }
) {
  const deps = await getEmployeeDependencies(employeeId);
  if (!deps.hasDependencies) return deps;

  if (opts.reassignToId) {
    if (opts.reassignToId === employeeId) {
      throw new ValidationError('لا يمكن إعادة التعيين لنفس الموظف');
    }
    await getEmployee(opts.reassignToId);
    await prisma.$transaction([
      prisma.lead.updateMany({
        where: { id: { in: deps.leads.map((l) => l.id) } },
        data: { assignedEmployeeId: opts.reassignToId },
      }),
      prisma.task.updateMany({
        where: { id: { in: deps.tasks.map((t) => t.id) } },
        data: { assignedEmployeeId: opts.reassignToId },
      }),
      prisma.course.updateMany({
        where: { primaryInstructorId: employeeId, deletedAt: null },
        data: { primaryInstructorId: opts.reassignToId },
      }),
    ]);
    for (const course of deps.courses) {
      await prisma.courseInstructor.upsert({
        where: {
          courseId_employeeId: { courseId: course.id, employeeId: opts.reassignToId },
        },
        create: { courseId: course.id, employeeId: opts.reassignToId },
        update: {},
      });
      await prisma.courseInstructor.deleteMany({
        where: { courseId: course.id, employeeId },
      });
    }
    return deps;
  }

  if (opts.confirmOrphan) {
    await prisma.$transaction([
      prisma.lead.updateMany({
        where: { id: { in: deps.leads.map((l) => l.id) } },
        data: { assignedEmployeeId: null },
      }),
      prisma.task.updateMany({
        where: { id: { in: deps.tasks.map((t) => t.id) } },
        data: { assignedEmployeeId: null },
      }),
      prisma.course.updateMany({
        where: { primaryInstructorId: employeeId, deletedAt: null },
        data: { primaryInstructorId: null },
      }),
      prisma.courseInstructor.deleteMany({ where: { employeeId } }),
    ]);
    return deps;
  }

  throw new ConflictError('الموظف لديه تعيينات مفتوحة — أعد التعيين أو أكّد التعطيل مع orphan', {
    leads: deps.leads,
    tasks: deps.tasks,
    courses: deps.courses,
  });
}

export async function updateEmployee(
  id: string,
  data: Partial<{
    fullName: string;
    phone: string;
    isSalaried: boolean;
    monthlySalaryMinor: bigint | null;
    salaryDayOfMonth: number | null;
    isActive: boolean;
    password: string;
    reassignToId?: string;
    confirmOrphan?: boolean;
  }>,
  actorId: string
) {
  const employee = await getEmployee(id);
  const { reassignToId, confirmOrphan, ...fields } = data;
  const updateData: Record<string, unknown> = { ...fields };
  if (data.password) {
    updateData.passwordHash = await hashPassword(data.password);
    delete updateData.password;
  }

  const nextSalaried = data.isSalaried !== undefined ? data.isSalaried : employee.isSalaried;
  if (nextSalaried) {
    const salary =
      data.monthlySalaryMinor !== undefined
        ? data.monthlySalaryMinor
        : employee.monthlySalaryMinor;
    if (!salary || salary <= 0n) {
      throw new ValidationError('يجب تحديد الراتب الشهري لموظفي الراتب الثابت');
    }
    if (data.salaryDayOfMonth !== undefined) {
      updateData.salaryDayOfMonth = normalizeSalaryDay(data.salaryDayOfMonth);
    } else if (!employee.salaryDayOfMonth) {
      updateData.salaryDayOfMonth = 1;
    }
  } else if (data.isSalaried === false) {
    updateData.monthlySalaryMinor = null;
    updateData.salaryDayOfMonth = null;
  }

  if (data.isActive === false) {
    await resolveEmployeeWork(id, { reassignToId, confirmOrphan });
  }

  await prisma.employee.update({ where: { id }, data: updateData });

  if (data.isActive === false) {
    const { revokeAllRefreshTokens } = await import('./auth.service.js');
    await revokeAllRefreshTokens(id);
  }

  const { password: _password, ...fieldsForAudit } = fields;

  await writeAuditLog({
    actorType: 'employee',
    actorId,
    action: 'employee.updated',
    entityType: 'employee',
    entityId: id,
    oldValue: { fullName: employee.fullName },
    newValue: fieldsForAudit,
  });

  return getEmployee(id);
}

export async function softDeleteEmployee(
  id: string,
  actorId: string,
  opts?: { reassignToId?: string; confirmOrphan?: boolean }
) {
  await getEmployee(id);
  await resolveEmployeeWork(id, opts ?? {});
  await prisma.employee.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false },
  });
  const { revokeAllRefreshTokens } = await import('./auth.service.js');
  await revokeAllRefreshTokens(id);
  await writeAuditLog({
    actorType: 'employee',
    actorId,
    action: 'employee.deleted',
    entityType: 'employee',
    entityId: id,
  });
}

export async function setEmployeePrivileges(
  employeeId: string,
  privilegeCodes: PrivilegeCode[],
  changedById: string
) {
  await getEmployee(employeeId);

  const privileges = await prisma.privilege.findMany({
    where: { code: { in: privilegeCodes } },
  });

  const current = await prisma.employeePrivilege.findMany({
    where: { employeeId },
    include: { privilege: true },
  });

  const currentCodes = new Set(current.map((c) => c.privilege.code));
  const newCodes = new Set(privilegeCodes);

  for (const priv of privileges) {
    if (!currentCodes.has(priv.code)) {
      await prisma.employeePrivilege.create({
        data: { employeeId, privilegeId: priv.id, assignedById: changedById },
      });
      await prisma.privilegeChangeLog.create({
        data: {
          employeeId,
          privilegeId: priv.id,
          action: 'added',
          changedById,
        },
      });
      await writeAuditLog({
        actorType: 'employee',
        actorId: changedById,
        action: 'privilege.added',
        entityType: 'employee',
        entityId: employeeId,
        newValue: { privilege: priv.code },
      });
    }
  }

  for (const ep of current) {
    if (!newCodes.has(ep.privilege.code as PrivilegeCode)) {
      await prisma.employeePrivilege.delete({
        where: {
          employeeId_privilegeId: {
            employeeId,
            privilegeId: ep.privilegeId,
          },
        },
      });
      await prisma.privilegeChangeLog.create({
        data: {
          employeeId,
          privilegeId: ep.privilegeId,
          action: 'removed',
          changedById,
        },
      });
      await writeAuditLog({
        actorType: 'employee',
        actorId: changedById,
        action: 'privilege.removed',
        entityType: 'employee',
        entityId: employeeId,
        oldValue: { privilege: ep.privilege.code },
      });
    }
  }

  return getEmployee(employeeId);
}

export async function markAbsence(
  employeeId: string,
  date: Date,
  reason: string | undefined,
  markedById: string
) {
  return prisma.employeeAbsence.upsert({
    where: {
      employeeId_date: { employeeId, date },
    },
    create: { employeeId, date, reason, markedById },
    update: { reason, markedById },
  });
}

export async function getAbsences(employeeId: string, year?: number, month?: number) {
  const where: { employeeId: string; date?: { gte: Date; lte: Date } } = { employeeId };
  if (year && month) {
    where.date = {
      gte: new Date(year, month - 1, 1),
      lte: new Date(year, month, 0),
    };
  }
  return prisma.employeeAbsence.findMany({ where, orderBy: { date: 'desc' } });
}

export async function getRatingsLeaderboard() {
  return prisma.employeeRating.findMany({
    include: { employee: { select: { id: true, fullName: true } } },
    orderBy: { score: 'desc' },
  });
}

export async function submitAvailability(
  employeeId: string,
  startsAt: Date,
  endsAt: Date,
  note?: string
) {
  if (!(endsAt instanceof Date)) endsAt = new Date(endsAt);
  if (!(startsAt instanceof Date)) startsAt = new Date(startsAt);
  if (endsAt.getTime() <= startsAt.getTime()) {
    throw new ValidationError('وقت النهاية يجب أن يكون بعد وقت البداية');
  }
  return prisma.instructorAvailability.create({
    data: { employeeId, startsAt, endsAt, note },
  });
}

export { normalizeSearchText };
