import { prisma } from '../lib/prisma.js';
import { Prisma } from '@prisma/client';
import { getSocketIO } from '../lib/socket.js';

const CHAT_NOTIFICATION_TYPE = 'chat_message';

export async function createNotification(data: {
  employeeId: string;
  type: string;
  title: string;
  body?: string;
  payload?: Record<string, unknown>;
}) {
  const notification = await prisma.notification.create({
    data: {
      employeeId: data.employeeId,
      type: data.type,
      title: data.title,
      body: data.body,
      payload: (data.payload ?? {}) as Prisma.InputJsonValue,
    },
  });

  try {
    const io = getSocketIO();
    io?.to(`employee:${data.employeeId}`).emit('notification', notification);
  } catch {
    // Socket may not be initialized in tests
  }

  return notification;
}

export async function listNotifications(employeeId: string, unreadOnly = false) {
  return prisma.notification.findMany({
    where: {
      employeeId,
      type: { not: CHAT_NOTIFICATION_TYPE },
      ...(unreadOnly ? { readAt: null } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}

export async function markNotificationRead(id: string, employeeId: string) {
  return prisma.notification.updateMany({
    where: { id, employeeId },
    data: { readAt: new Date() },
  });
}

export async function markAllNotificationsRead(employeeId: string) {
  return prisma.notification.updateMany({
    where: {
      employeeId,
      readAt: null,
      type: { not: CHAT_NOTIFICATION_TYPE },
    },
    data: { readAt: new Date() },
  });
}

export async function getUnreadCount(employeeId: string) {
  return prisma.notification.count({
    where: {
      employeeId,
      readAt: null,
      type: { not: CHAT_NOTIFICATION_TYPE },
    },
  });
}

export async function notifyTasksDueSoon() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const now = new Date();

  const tasks = await prisma.task.findMany({
    where: {
      status: { in: ['pending', 'in_progress'] },
      dueAt: { gte: now, lte: tomorrow },
      assignedEmployeeId: { not: null },
    },
  });

  for (const task of tasks) {
    if (task.assignedEmployeeId) {
      await createNotification({
        employeeId: task.assignedEmployeeId,
        type: 'task_due_soon',
        title: 'مهمة تستحق قريباً',
        body: task.title,
        payload: { taskId: task.id },
      });
    }
  }
}

export async function flagStuckLeads(stuckDays = 7) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - stuckDays);

  const leads = await prisma.lead.findMany({
    where: {
      deletedAt: null,
      status: { in: ['new', 'contacted', 'interested'] },
      updatedAt: { lt: cutoff },
      stuckFlaggedAt: null,
    },
  });

  for (const lead of leads) {
    await prisma.lead.update({
      where: { id: lead.id },
      data: { stuckFlaggedAt: new Date() },
    });
    if (lead.assignedEmployeeId) {
      await createNotification({
        employeeId: lead.assignedEmployeeId,
        type: 'lead_stuck',
        title: 'عميل بدون متابعة',
        body: lead.fullName,
        payload: { leadId: lead.id, status: lead.status },
      });
    }
  }
  return leads.length;
}

/** Notify assignees when a lead's nextFollowUpAt is due. */
export async function flagDueFollowUps() {
  const now = new Date();
  const leads = await prisma.lead.findMany({
    where: {
      deletedAt: null,
      nextFollowUpAt: { lte: now },
      followUpFlaggedAt: null,
      status: { notIn: ['lost', 'archived'] },
    },
  });

  for (const lead of leads) {
    await prisma.lead.update({
      where: { id: lead.id },
      data: { followUpFlaggedAt: now },
    });
    if (lead.assignedEmployeeId) {
      await createNotification({
        employeeId: lead.assignedEmployeeId,
        type: 'lead_follow_up_due',
        title: 'موعد متابعة عميل',
        body: lead.fullName,
        payload: { leadId: lead.id, nextFollowUpAt: lead.nextFollowUpAt },
      });
    }
  }
  return leads.length;
}
