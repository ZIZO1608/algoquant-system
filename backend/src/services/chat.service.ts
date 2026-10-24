import { Server as SocketIOServer } from 'socket.io';
import { prisma } from '../lib/prisma.js';
import { verifyAccessToken } from './auth.service.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../lib/errors.js';
import { getSocketIO } from '../lib/socket.js';

const MAX_MESSAGE_LENGTH = 4000;

export async function assertConversationMember(employeeId: string, conversationId: string) {
  const member = await prisma.conversationMember.findUnique({
    where: {
      conversationId_employeeId: { conversationId, employeeId },
    },
  });
  if (!member) throw new ForbiddenError('Not a member of this conversation');
  return member;
}

export async function getOrCreateTeamChannel(forEmployeeId?: string) {
  let conv = await prisma.conversation.findFirst({
    where: { type: 'team' },
  });

  if (!conv) {
    conv = await prisma.conversation.create({
      data: { type: 'team', title: 'فريق العمل' },
    });
  }

  // Keep every active employee as a member (covers accounts created after the channel).
  const employees = await prisma.employee.findMany({
    where: { deletedAt: null, isActive: true },
    select: { id: true },
  });
  const existing = await prisma.conversationMember.findMany({
    where: { conversationId: conv.id },
    select: { employeeId: true },
  });
  const existingIds = new Set(existing.map((m) => m.employeeId));
  const missing = employees.filter((e) => !existingIds.has(e.id));
  if (missing.length) {
    await prisma.conversationMember.createMany({
      data: missing.map((e) => ({
        conversationId: conv.id,
        employeeId: e.id,
      })),
      skipDuplicates: true,
    });
  }

  // Ensure the requesting user is a member even if inactive filter missed them.
  if (forEmployeeId && !existingIds.has(forEmployeeId) && !missing.some((e) => e.id === forEmployeeId)) {
    await prisma.conversationMember.upsert({
      where: {
        conversationId_employeeId: {
          conversationId: conv.id,
          employeeId: forEmployeeId,
        },
      },
      create: { conversationId: conv.id, employeeId: forEmployeeId },
      update: {},
    });
  }

  return prisma.conversation.findUniqueOrThrow({
    where: { id: conv.id },
    include: {
      members: {
        include: {
          employee: {
            select: {
              id: true,
              fullName: true,
              privileges: {
                take: 3,
                include: { privilege: { select: { labelAr: true, code: true } } },
              },
            },
          },
        },
      },
      messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      course: { select: { id: true, name: true } },
    },
  });
}

export async function getOrCreateCourseChannel(courseId: string) {
  let conv = await prisma.conversation.findFirst({
    where: { type: 'course_channel', courseId },
  });
  if (!conv) {
    const course = await prisma.course.findUnique({ where: { id: courseId } });
    conv = await prisma.conversation.create({
      data: {
        type: 'course_channel',
        courseId,
        title: course?.name ?? 'Course Channel',
      },
    });
  }
  return conv;
}

export async function getOrCreateDM(employeeA: string, employeeB: string) {
  const existing = await prisma.conversation.findMany({
    where: { type: 'dm' },
    include: { members: true },
  });

  for (const conv of existing) {
    const ids = conv.members.map((m) => m.employeeId).sort();
    if (ids.length === 2 && ids[0] === [employeeA, employeeB].sort()[0] && ids[1] === [employeeA, employeeB].sort()[1]) {
      return conv;
    }
  }

  const conv = await prisma.conversation.create({
    data: { type: 'dm' },
  });
  await prisma.conversationMember.createMany({
    data: [
      { conversationId: conv.id, employeeId: employeeA },
      { conversationId: conv.id, employeeId: employeeB },
    ],
  });
  return conv;
}

export async function listConversations(employeeId: string) {
  // Sync team membership before listing so every employee can see/send in فريق العمل.
  await getOrCreateTeamChannel(employeeId);

  return prisma.conversation.findMany({
    where: {
      members: { some: { employeeId } },
    },
    include: {
      members: {
        include: {
          employee: {
            select: {
              id: true,
              fullName: true,
              privileges: {
                take: 3,
                include: { privilege: { select: { labelAr: true, code: true } } },
              },
            },
          },
        },
      },
      messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      course: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getMessages(conversationId: string, employeeId: string, limit = 50) {
  await assertConversationMember(employeeId, conversationId);

  return prisma.message.findMany({
    where: { conversationId, deletedAt: null },
    include: {
      sender: { select: { id: true, fullName: true } },
      attachments: true,
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });
}

export async function sendMessage(
  conversationId: string,
  senderId: string,
  body: string,
  attachmentKeys?: { storageKey: string; mime: string; fileObjectId?: string }[]
) {
  await assertConversationMember(senderId, conversationId);

  const text = typeof body === 'string' ? body.trim() : '';
  if (!text && !(attachmentKeys?.length)) {
    throw new ValidationError('الرسالة فارغة');
  }
  if (text.length > MAX_MESSAGE_LENGTH) {
    throw new ValidationError(`الرسالة أطول من ${MAX_MESSAGE_LENGTH} حرفاً`);
  }

  const message = await prisma.message.create({
    data: {
      conversationId,
      senderId,
      body: text || ' ',
      attachments: attachmentKeys?.length
        ? {
            create: attachmentKeys.map((a) => ({
              storageKey: a.storageKey,
              mime: a.mime,
              fileObjectId: a.fileObjectId || null,
            })),
          }
        : undefined,
    },
    include: {
      sender: { select: { id: true, fullName: true } },
      attachments: true,
    },
  });

  const fileIds = (attachmentKeys ?? [])
    .map((a) => a.fileObjectId)
    .filter((id): id is string => Boolean(id));
  if (fileIds.length) {
    await prisma.fileObject.updateMany({
      where: { id: { in: fileIds } },
      data: { entityType: 'message', entityId: message.id },
    });
  }

  const members = await prisma.conversationMember.findMany({
    where: { conversationId, employeeId: { not: senderId } },
  });

  const io = getSocketIO();
  // Live chat updates only — do not create bell notifications for messages.
  for (const m of members) {
    io?.to(`employee:${m.employeeId}`).emit('chat:message', {
      conversationId,
      message,
    });
  }

  io?.to(`conversation:${conversationId}`).emit('chat:message', {
    conversationId,
    message,
  });

  return message;
}

export async function markConversationRead(conversationId: string, employeeId: string) {
  return prisma.conversationMember.update({
    where: {
      conversationId_employeeId: { conversationId, employeeId },
    },
    data: { lastReadAt: new Date() },
    include: {
      employee: {
        select: {
          id: true,
          fullName: true,
          privileges: {
            take: 3,
            include: { privilege: { select: { labelAr: true, code: true } } },
          },
        },
      },
    },
  });
}

export function setupSocketAuth(io: SocketIOServer) {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error('Unauthorized'));
    try {
      const user = verifyAccessToken(token);
      socket.data.user = user;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user as { sub: string };
    socket.join(`employee:${user.sub}`);
    // Broadcasts every employee receives (website bot conversations).
    socket.join('staff');

    socket.on('join:conversation', async (conversationId: string) => {
      try {
        await assertConversationMember(user.sub, conversationId);
        socket.join(`conversation:${conversationId}`);
      } catch {
        socket.emit('chat:error', { code: 'FORBIDDEN', message: 'Not a member of this conversation' });
      }
    });

    socket.on('chat:read', async (conversationId: string) => {
      const updated = await markConversationRead(conversationId, user.sub);
      socket.to(`conversation:${conversationId}`).emit('chat:read', {
        conversationId,
        employeeId: user.sub,
        lastReadAt: updated.lastReadAt?.toISOString() ?? new Date().toISOString(),
        employee: updated.employee,
      });
    });
  });
}
