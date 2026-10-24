import { prisma } from '../lib/prisma.js';
import { deleteFile, getPresignedUrl, uploadFile } from '../lib/s3.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../lib/errors.js';
import { hasAnyPrivilege } from './auth.service.js';
import { PrivilegeCode } from '../config/index.js';
import { assertCourseInstructorAccess } from './course.service.js';

const COURSE_PURPOSES = new Set(['materials', 'media', 'certificates', 'other']);

async function canAccessFile(
  file: { entityType: string | null; entityId: string | null; uploadedById: string },
  privileges: PrivilegeCode[],
  employeeId: string
): Promise<boolean> {
  if (hasAnyPrivilege(privileges, ['admin'])) return true;

  if (file.entityType === 'course') {
    if (hasAnyPrivilege(privileges, ['operation', 'media'])) return true;
    if (hasAnyPrivilege(privileges, ['instructor']) && file.entityId) {
      try {
        await assertCourseInstructorAccess(file.entityId, employeeId, privileges);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  if (
    (file.entityType === 'message' || file.entityType === 'conversation') &&
    file.entityId
  ) {
    let conversationId = file.entityId;
    if (file.entityType === 'message') {
      const msg = await prisma.message.findUnique({
        where: { id: file.entityId },
        select: { conversationId: true },
      });
      if (!msg) return false;
      conversationId = msg.conversationId;
    }
    const member = await prisma.conversationMember.findUnique({
      where: {
        conversationId_employeeId: { conversationId, employeeId },
      },
    });
    return Boolean(member);
  }

  // null or any other client-supplied string: uploader or privileged ops/media
  if (hasAnyPrivilege(privileges, ['operation', 'media'])) return true;
  return file.uploadedById === employeeId;
}

export async function listFiles(
  filters: {
    entityType?: string;
    entityId?: string;
    purpose?: string;
  },
  privileges: PrivilegeCode[],
  employeeId: string
) {
  const where: {
    entityType?: string;
    entityId?: string;
    purpose?: string;
  } = {};
  if (filters.entityType) where.entityType = filters.entityType;
  if (filters.entityId) where.entityId = filters.entityId;
  if (filters.purpose) where.purpose = filters.purpose;

  const files = await prisma.fileObject.findMany({
    where,
    include: {
      uploadedBy: { select: { id: true, fullName: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (hasAnyPrivilege(privileges, ['admin'])) return files;

  const allowed = [];
  for (const file of files) {
    if (await canAccessFile(file, privileges, employeeId)) {
      allowed.push(file);
    }
  }
  return allowed;
}

export async function createUploadedFile(input: {
  buffer: Buffer;
  mime: string;
  size: number;
  originalName: string;
  purpose: string;
  entityType?: string;
  entityId?: string;
  uploadedById: string;
}) {
  let purpose = input.purpose || 'general';
  if (input.entityType === 'course') {
    if (!input.entityId) throw new ValidationError('entityId is required for course files');
    if (!COURSE_PURPOSES.has(purpose)) purpose = 'other';

    const course = await prisma.course.findFirst({
      where: { id: input.entityId, deletedAt: null },
      select: { id: true },
    });
    if (!course) throw new NotFoundError('Course not found');
  }

  const storagePurpose =
    input.entityType && input.entityId
      ? `${input.entityType}/${input.entityId}/${purpose}`
      : purpose;

  const { storageKey, bucket, size } = await uploadFile(input.buffer, input.mime, storagePurpose);

  return prisma.fileObject.create({
    data: {
      storageKey,
      bucket,
      mime: input.mime,
      size: size || input.size,
      uploadedById: input.uploadedById,
      purpose,
      originalName: input.originalName || null,
      entityType: input.entityType || null,
      entityId: input.entityId || null,
    },
    include: {
      uploadedBy: { select: { id: true, fullName: true } },
    },
  });
}

export async function getFileDownloadUrl(
  id: string,
  privileges: PrivilegeCode[],
  employeeId: string
) {
  const file = await prisma.fileObject.findUnique({ where: { id } });
  if (!file) throw new NotFoundError('File not found');
  if (!(await canAccessFile(file, privileges, employeeId))) {
    throw new ForbiddenError('Insufficient privileges to access this file');
  }
  const url = await getPresignedUrl(file.storageKey);
  return {
    url,
    file: {
      id: file.id,
      originalName: file.originalName,
      mime: file.mime,
      size: file.size,
    },
  };
}

export async function removeFile(id: string, actorPrivileges: PrivilegeCode[]) {
  if (!hasAnyPrivilege(actorPrivileges, ['admin', 'operation', 'media'])) {
    throw new ForbiddenError('Insufficient privileges to delete files');
  }

  const file = await prisma.fileObject.findUnique({ where: { id } });
  if (!file) throw new NotFoundError('File not found');

  try {
    await deleteFile(file.storageKey);
  } catch {
    // Still remove DB row if object already gone from storage
  }

  await prisma.fileObject.delete({ where: { id } });
  return { ok: true };
}
