import { prisma } from '../../src/lib/prisma.js';
import { hashPassword } from '../../src/services/auth.service.js';
import { PrivilegeCode } from '../../src/config/index.js';

let seq = 0;
function next(prefix: string) {
  seq += 1;
  return `${prefix}-${seq}-${Date.now()}`;
}

export async function ensurePrivileges() {
  const codes: PrivilegeCode[] = [
    'admin',
    'sales',
    'media',
    'operation',
    'instructor',
    'accountant',
  ];
  for (const code of codes) {
    await prisma.privilege.upsert({
      where: { code },
      create: { code, labelAr: code, labelEn: code },
      update: {},
    });
  }
}

export async function createEmployee(opts: {
  email?: string;
  privileges?: PrivilegeCode[];
  isSalaried?: boolean;
  monthlySalaryMinor?: bigint;
  salaryDayOfMonth?: number;
  isActive?: boolean;
  fullName?: string;
}) {
  await ensurePrivileges();
  const email = opts.email ?? `${next('emp')}@test.local`;
  const isSalaried = opts.isSalaried !== false;
  const employee = await prisma.employee.create({
    data: {
      email,
      fullName: opts.fullName ?? 'Test Employee',
      passwordHash: await hashPassword('password123'),
      isSalaried,
      monthlySalaryMinor: isSalaried ? (opts.monthlySalaryMinor ?? 1_000_000n) : null,
      salaryDayOfMonth: isSalaried ? (opts.salaryDayOfMonth ?? 1) : null,
      isActive: opts.isActive ?? true,
    },
  });

  const privs = opts.privileges ?? ['admin'];
  for (const code of privs) {
    const privilege = await prisma.privilege.findUniqueOrThrow({ where: { code } });
    await prisma.employeePrivilege.create({
      data: { employeeId: employee.id, privilegeId: privilege.id },
    });
  }
  return employee;
}

export async function createTrack() {
  return prisma.courseTrack.create({
    data: { nameAr: next('track'), isActive: true },
  });
}

export async function createCourse(opts?: {
  primaryInstructorId?: string;
  priceMinor?: bigint;
  sessionCount?: number;
  capacity?: number;
  status?: 'draft' | 'planned' | 'enrollment_open' | 'active' | 'completed' | 'archived';
  startDate?: Date;
}) {
  const track = await createTrack();
  return prisma.course.create({
    data: {
      name: next('course'),
      trackId: track.id,
      startDate: opts?.startDate ?? new Date(),
      sessionCount: opts?.sessionCount ?? 4,
      totalHours: 8,
      priceMinor: opts?.priceMinor ?? 500_000n,
      capacity: opts?.capacity ?? 20,
      primaryInstructorId: opts?.primaryInstructorId,
      status: opts?.status ?? 'active',
    },
  });
}

export async function createEnrollment(opts: {
  courseId: string;
  studentId?: string;
  totalPriceMinor?: bigint;
  amountPaidMinor?: bigint;
}) {
  let studentId = opts.studentId;
  if (!studentId) {
    const student = await prisma.student.create({
      data: {
        fullName: next('student'),
        phone: `09${String(seq).padStart(8, '0')}`,
      },
    });
    studentId = student.id;
  }
  const paid = opts.amountPaidMinor ?? 0n;
  const total = opts.totalPriceMinor ?? 500_000n;
  return prisma.enrollment.create({
    data: {
      courseId: opts.courseId,
      studentId,
      totalPriceMinor: total,
      amountPaidMinor: paid,
      paymentStatus: paid <= 0n ? 'unpaid' : paid >= total ? 'paid_in_full' : 'partially_paid',
    },
  });
}

export async function createExpenseCategory() {
  return prisma.expenseCategory.upsert({
    where: { code: 'test_ops' },
    create: { code: 'test_ops', labelAr: 'تشغيل', isSystem: false },
    update: {},
  });
}
