import { prisma } from '../lib/prisma.js';
import { PrivilegeCode } from '../config/index.js';
import { getUnreadCount } from './notification.service.js';
import { OPEN_TASK_STATUSES } from '../lib/tasks.js';

function endOfToday() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

export async function getDashboard(employeeId: string, privileges: PrivilegeCode[]) {
  const widgets: Record<string, unknown> = {};
  const isAdmin = privileges.includes('admin');

  if (isAdmin || privileges.includes('accountant')) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const payments = await prisma.studentPayment.findMany({
      where: { paidAt: { gte: monthStart }, voidedAt: null },
    });
    const paymentIncome = payments.reduce((s, p) => s + p.amountMinor, 0n);
    const refunds = await prisma.refund.findMany({
      where: {
        status: 'processed',
        processedAt: { gte: monthStart },
      },
      select: { amountMinor: true },
    });
    const refundTotal = refunds.reduce((s, r) => s + r.amountMinor, 0n);
    const monthlyRevenue = paymentIncome - refundTotal;

    const pendingWithdrawals = await prisma.walletWithdrawalRequest.count({
      where: { status: { in: ['requested', 'under_review', 'approved'] } },
    });

    widgets.finance = {
      monthlyRevenue: monthlyRevenue.toString(),
      pendingWithdrawals,
    };
  }

  if (isAdmin) {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    widgets.admin = {
      activeCourses: await prisma.course.count({
        where: { status: 'active', deletedAt: null },
      }),
      newLeads7d: await prisma.lead.count({
        where: { createdAt: { gte: sevenDaysAgo }, deletedAt: null },
      }),
      overdueTasks: await prisma.task.count({
        where: { status: 'late' },
      }),
      urgentTasks: await prisma.task.findMany({
        where: { status: { in: ['pending', 'late'] } },
        include: { course: { select: { name: true } } },
        take: 10,
        orderBy: { dueAt: 'asc' },
      }),
    };
  }

  if (isAdmin || privileges.includes('sales')) {
    const leadWhere = isAdmin
      ? { deletedAt: null }
      : { deletedAt: null, assignedEmployeeId: employeeId };

    const byStatus = await prisma.lead.groupBy({
      by: ['status'],
      where: leadWhere,
      _count: true,
    });

    widgets.sales = {
      pipeline: byStatus,
      followUpsToday: await prisma.lead.count({
        where: {
          ...leadWhere,
          nextFollowUpAt: { lte: endOfToday() },
          status: { notIn: ['lost', 'archived'] },
        },
      }),
    };
  }

  if (isAdmin || privileges.includes('media')) {
    widgets.media = {
      pendingTasks: await prisma.task.count({
        where: { specialty: 'media', status: { in: ['pending', 'in_progress'] } },
      }),
      overdueTasks: await prisma.task.findMany({
        where: { specialty: 'media', status: 'late' },
        include: { course: { select: { name: true } } },
        take: 10,
      }),
    };
  }

  if (isAdmin || privileges.includes('operation')) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    widgets.operation = {
      sessionsToday: await prisma.courseSession.count({
        where: { scheduledAt: { gte: today, lt: tomorrow } },
      }),
      enrollmentOpenCourses: await prisma.course.count({
        where: { status: 'enrollment_open' },
      }),
      logisticsTasks: await prisma.task.count({
        where: {
          specialty: { in: ['operation', 'logistics'] },
          status: { in: [...OPEN_TASK_STATUSES] },
        },
      }),
    };
  }

  if (isAdmin || privileges.includes('instructor')) {
    const wallet = await prisma.wallet.findUnique({ where: { ownerId: employeeId } });
    const upcoming = await prisma.courseSession.findMany({
      where: {
        course: { primaryInstructorId: employeeId },
        scheduledAt: { gte: new Date() },
        status: 'scheduled',
      },
      include: { course: { select: { name: true } } },
      take: 5,
      orderBy: { scheduledAt: 'asc' },
    });

    widgets.instructor = {
      walletBalance: wallet?.balanceMinor?.toString() ?? '0',
      upcomingSessions: upcoming,
    };
  }

  widgets.unreadNotifications = await getUnreadCount(employeeId);

  return widgets;
}
