import { prisma } from '../lib/prisma.js';
import { hashToken, generateToken } from '../lib/crypto.js';
import { config, EXPENSE_CATEGORIES, LEAD_SOURCES } from '../config/index.js';
import {
  defaultOffsetForStage,
  isLifecycleStageKey,
} from '../config/lifecycle.js';
import { NotFoundError, ConflictError, ValidationError } from '../lib/errors.js';
import { writeAuditLog } from './audit.service.js';

function normalizeTemplateItemTiming(phaseKey: string, offsetType?: string, offsetValue?: number) {
  if (!isLifecycleStageKey(phaseKey)) {
    throw new ValidationError('المرحلة يجب أن تكون من مراحل دورة حياة الدورة المحددة');
  }
  const defaults = defaultOffsetForStage(phaseKey);
  if (phaseKey === 'before_start') {
    const days = Math.max(1, Math.abs(Number(offsetValue) || defaults.offsetValue));
    return { offsetType: 'days_from_start' as const, offsetValue: days };
  }
  if (phaseKey === 'after_end') {
    const days = Math.max(1, Math.abs(Number(offsetValue) || defaults.offsetValue));
    return { offsetType: 'days_from_start' as const, offsetValue: days };
  }
  if (phaseKey === 'during') {
    const n = Number(offsetValue);
    // 0 = legacy auto-distribute; >= 1 = specific session number
    if (!Number.isFinite(n) || n <= 0) {
      return { offsetType: 'session_number' as const, offsetValue: 0 };
    }
    return { offsetType: 'session_number' as const, offsetValue: Math.floor(n) };
  }
  // start / end — timing is resolved from the stage at course attach time
  return defaults;
}

export async function getAppSettings() {
  const settings = await prisma.appSetting.findMany();
  const finance = await prisma.settingsFinance.findUnique({ where: { id: 'singleton' } });
  const map: Record<string, unknown> = {};
  for (const s of settings) map[s.key] = s.value;
  return {
    ...map,
    currencyCode: finance?.currencyCode ?? 'SYP',
    currencyLabel: finance?.currencyLabel ?? 'ل.س',
    defaultTeacherPayPercent: finance?.defaultTeacherPayPercent ?? 50,
    leadStuckDays: (map.leadStuckDays as number) ?? 7,
  };
}

export async function updateAppSettings(
  updates: Record<string, unknown>,
  actorId: string
) {
  for (const [key, value] of Object.entries(updates)) {
    if (['currencyCode', 'currencyLabel', 'defaultTeacherPayPercent'].includes(key)) {
      await prisma.settingsFinance.upsert({
        where: { id: 'singleton' },
        create: {
          id: 'singleton',
          currencyCode: (updates.currencyCode as string) ?? 'SYP',
          currencyLabel: (updates.currencyLabel as string) ?? 'ل.س',
          defaultTeacherPayPercent: (updates.defaultTeacherPayPercent as number) ?? 50,
        },
        update: {
          ...(updates.currencyCode ? { currencyCode: updates.currencyCode as string } : {}),
          ...(updates.currencyLabel ? { currencyLabel: updates.currencyLabel as string } : {}),
          ...(updates.defaultTeacherPayPercent
            ? { defaultTeacherPayPercent: updates.defaultTeacherPayPercent as number }
            : {}),
        },
      });
    } else {
      await prisma.appSetting.upsert({
        where: { key },
        create: { key, value: value as object },
        update: { value: value as object },
      });
    }
  }

  await writeAuditLog({
    actorType: 'employee',
    actorId,
    action: 'settings.updated',
    entityType: 'app_settings',
    newValue: updates,
  });

  return getAppSettings();
}

// Tracks
export async function listTracks() {
  return prisma.courseTrack.findMany({
    orderBy: { nameAr: 'asc' },
  });
}

export async function createTrack(nameAr: string, nameEn?: string) {
  return prisma.courseTrack.create({
    data: {
      nameAr,
      nameEn,
    },
  });
}

export async function updateTrack(
  id: string,
  data: {
    nameAr?: string;
    nameEn?: string;
    isActive?: boolean;
  }
) {
  return prisma.courseTrack.update({
    where: { id },
    data,
  });
}

export async function deleteTrack(id: string) {
  const [courses, leads] = await Promise.all([
    prisma.course.count({ where: { trackId: id, deletedAt: null } }),
    prisma.lead.count({ where: { requestedTrackId: id } }),
  ]);
  if (courses > 0 || leads > 0) {
    throw new ConflictError('لا يمكن حذف المسار لوجود دورات أو عملاء مرتبطين به');
  }
  await prisma.courseTrack.delete({ where: { id } });
}

// Expense categories
export async function listExpenseCategories() {
  return prisma.expenseCategory.findMany({ orderBy: { labelAr: 'asc' } });
}

export async function createExpenseCategory(code: string, labelAr: string) {
  return prisma.expenseCategory.create({ data: { code, labelAr } });
}

export async function updateExpenseCategory(
  id: string,
  data: { labelAr?: string; isActive?: boolean }
) {
  return prisma.expenseCategory.update({ where: { id }, data });
}

export async function deleteExpenseCategory(id: string) {
  const category = await prisma.expenseCategory.findUnique({ where: { id } });
  if (!category) throw new NotFoundError('الفئة غير موجودة');
  const expenseCount = await prisma.expense.count({
    where: { categoryId: id, deletedAt: null },
  });
  if (expenseCount > 0) {
    throw new ConflictError('لا يمكن حذف الفئة لوجود مصروفات مرتبطة بها');
  }
  await prisma.expenseCategory.delete({ where: { id } });
}

// Lead sources
export async function listLeadSources() {
  return prisma.leadSource.findMany({ orderBy: { labelAr: 'asc' } });
}

export async function createLeadSource(code: string, labelAr: string) {
  return prisma.leadSource.create({ data: { code, labelAr, isSystem: false } });
}

export async function updateLeadSource(
  id: string,
  data: { labelAr?: string; isActive?: boolean }
) {
  return prisma.leadSource.update({ where: { id }, data });
}

export async function deleteLeadSource(id: string, actorId: string) {
  const source = await prisma.leadSource.findUnique({ where: { id } });
  if (!source) throw new NotFoundError('المصدر غير موجود');
  if (source.isSystem) {
    throw new ConflictError('لا يمكن حذف مصدر نظام');
  }

  const leadCount = await prisma.lead.count({ where: { sourceId: id } });
  if (leadCount > 0) {
    throw new ConflictError(`لا يمكن حذف المصدر لوجود ${leadCount} عميل مرتبط به`);
  }

  await prisma.leadSource.delete({ where: { id } });
  await writeAuditLog({
    actorType: 'employee',
    actorId,
    action: 'lead_source.deleted',
    entityType: 'lead_source',
    entityId: id,
    oldValue: { code: source.code, labelAr: source.labelAr },
  });
}

// Stakeholder profit-share rules
export async function listStakeholderRules() {
  return prisma.stakeholderRule.findMany({
    include: { employee: { select: { id: true, fullName: true, email: true, isActive: true } } },
    orderBy: { createdAt: 'asc' },
  });
}

function assertValidPercent(percent: number) {
  if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
    throw new ValidationError('النسبة يجب أن تكون أكبر من 0 وألا تتجاوز 100');
  }
}

async function assertPercentSumOk(percent: number, excludeId?: string) {
  const existing = await prisma.stakeholderRule.findMany({
    where: excludeId ? { id: { not: excludeId } } : undefined,
    select: { percent: true },
  });
  const sum = existing.reduce((s, r) => s + r.percent, 0) + percent;
  if (sum > 100) {
    throw new ValidationError(`مجموع نسب الشركاء لا يجوز أن يتجاوز 100٪ (سيصبح ${sum})`);
  }
}

export async function createStakeholderRule(employeeId: string, percent: number) {
  assertValidPercent(percent);
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, deletedAt: null },
  });
  if (!employee) throw new NotFoundError('Employee not found');
  if (!employee.isActive) throw new ValidationError('لا يمكن إضافة شريك غير نشط');

  const dup = await prisma.stakeholderRule.findUnique({ where: { employeeId } });
  if (dup) throw new ConflictError('يوجد قاعدة ربح لهذا الموظف بالفعل');

  await assertPercentSumOk(percent);

  return prisma.stakeholderRule.create({
    data: { employeeId, percent },
    include: { employee: { select: { id: true, fullName: true, email: true } } },
  });
}

export async function updateStakeholderRule(id: string, percent: number) {
  assertValidPercent(percent);
  const rule = await prisma.stakeholderRule.findUnique({ where: { id } });
  if (!rule) throw new NotFoundError('Stakeholder rule not found');
  await assertPercentSumOk(percent, id);
  return prisma.stakeholderRule.update({
    where: { id },
    data: { percent },
    include: { employee: { select: { id: true, fullName: true, email: true } } },
  });
}

export async function deleteStakeholderRule(id: string) {
  const rule = await prisma.stakeholderRule.findUnique({ where: { id } });
  if (!rule) throw new NotFoundError('Stakeholder rule not found');
  await prisma.stakeholderRule.delete({ where: { id } });
}

// Task path templates
export async function listTaskPathTemplates() {
  return prisma.taskPathTemplate.findMany({
    include: { items: { orderBy: { sortOrder: 'asc' } } },
    orderBy: { name: 'asc' },
  });
}

export async function getTaskPathTemplate(id: string) {
  const t = await prisma.taskPathTemplate.findUnique({
    where: { id },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!t) throw new NotFoundError('Template not found');
  return t;
}

export async function createTaskPathTemplate(name: string, description?: string) {
  return prisma.taskPathTemplate.create({ data: { name, description } });
}

export async function updateTaskPathTemplate(
  id: string,
  data: { name?: string; description?: string; isActive?: boolean }
) {
  return prisma.taskPathTemplate.update({ where: { id }, data });
}

export async function addTemplateItem(
  templateId: string,
  item: {
    title: string;
    phaseKey: string;
    specialty: string;
    offsetType: string;
    offsetValue: number;
    sortOrder?: number;
    notes?: string;
  }
) {
  const timing = normalizeTemplateItemTiming(item.phaseKey, item.offsetType, item.offsetValue);

  let sortOrder = item.sortOrder;
  if (sortOrder === undefined || sortOrder === null) {
    const last = await prisma.taskPathTemplateItem.findFirst({
      where: { templateId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    sortOrder = (last?.sortOrder ?? -1) + 1;
  }

  return prisma.taskPathTemplateItem.create({
    data: {
      templateId,
      title: item.title,
      phaseKey: item.phaseKey,
      specialty: item.specialty as 'sales',
      offsetType: timing.offsetType,
      offsetValue: timing.offsetValue,
      sortOrder,
      notes: item.notes,
    },
  });
}

export async function updateTemplateItem(
  id: string,
  data: Partial<{
    title: string;
    phaseKey: string;
    specialty: string;
    offsetType: string;
    offsetValue: number;
    sortOrder: number;
    notes: string;
  }>
) {
  const existing = await prisma.taskPathTemplateItem.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Template item not found');

  const phaseKey = data.phaseKey ?? existing.phaseKey;
  const timing = normalizeTemplateItemTiming(
    phaseKey,
    data.offsetType ?? existing.offsetType,
    data.offsetValue ?? existing.offsetValue
  );

  return prisma.taskPathTemplateItem.update({
    where: { id },
    data: {
      title: data.title,
      phaseKey,
      specialty: data.specialty as 'sales' | undefined,
      offsetType: timing.offsetType,
      offsetValue: timing.offsetValue,
      sortOrder: data.sortOrder,
      notes: data.notes,
    },
  });
}

export async function deleteTemplateItem(id: string, actorId?: string) {
  const item = await prisma.taskPathTemplateItem.findUnique({ where: { id } });
  if (!item) throw new NotFoundError('البند غير موجود');

  const taskCount = await prisma.task.count({
    where: { templateItemId: id, deletedAt: null },
  });
  if (taskCount > 0) {
    throw new ConflictError(`لا يمكن حذف البند لوجود ${taskCount} مهمة مرتبطة به`);
  }

  await prisma.taskPathTemplateItem.delete({ where: { id } });
  if (actorId) {
    await writeAuditLog({
      actorType: 'employee',
      actorId,
      action: 'template_item.deleted',
      entityType: 'task_path_template_item',
      entityId: id,
      oldValue: { title: item.title, templateId: item.templateId },
    });
  }
}

export async function reorderTemplateItems(templateId: string, orderedIds: string[]) {
  const items = await prisma.taskPathTemplateItem.findMany({
    where: { templateId },
    select: { id: true },
  });
  const existingIds = new Set(items.map((i) => i.id));
  if (
    orderedIds.length !== items.length ||
    orderedIds.some((id) => !existingIds.has(id))
  ) {
    throw new ValidationError('قائمة ترتيب البنود غير صالحة');
  }

  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.taskPathTemplateItem.update({
        where: { id },
        data: { sortOrder: index },
      })
    )
  );

  return getTaskPathTemplate(templateId);
}

// Webhook settings
export async function getWebhookSettings() {
  let settings = await prisma.settingsWebhook.findUnique({ where: { id: 'singleton' } });
  if (!settings) {
    const token = config.webhookDefaultSecret;
    settings = await prisma.settingsWebhook.create({
      data: {
        id: 'singleton',
        secretTokenHash: hashToken(token),
        secretHint: token.slice(-4),
      },
    });
  }
  const [total, success] = await Promise.all([
    prisma.webhookInboundLog.count(),
    prisma.webhookInboundLog.count({ where: { success: true } }),
  ]);
  return {
    publicPath: settings.publicPath,
    secretHint: settings.secretHint,
    rotatedAt: settings.rotatedAt,
    stats: { total, success, failed: total - success },
  };
}

export async function rotateWebhookSecret(actorId: string) {
  const token = generateToken(32);
  await prisma.settingsWebhook.upsert({
    where: { id: 'singleton' },
    create: {
      id: 'singleton',
      secretTokenHash: hashToken(token),
      secretHint: token.slice(-4),
    },
    update: {
      secretTokenHash: hashToken(token),
      secretHint: token.slice(-4),
      rotatedAt: new Date(),
    },
  });
  await writeAuditLog({
    actorType: 'employee',
    actorId,
    action: 'webhook.secret_rotated',
    entityType: 'settings_webhook',
    entityId: 'singleton',
  });
  return { token, hint: token.slice(-4) };
}

export async function getWebhookLogs(limit = 50, offset = 0) {
  return prisma.webhookInboundLog.findMany({
    orderBy: { receivedAt: 'desc' },
    take: limit,
    skip: offset,
  });
}

export async function getAuditLogs(filters: {
  employeeId?: string;
  entityType?: string;
  action?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}) {
  return prisma.auditLog.findMany({
    where: {
      ...(filters.employeeId ? { actorId: filters.employeeId } : {}),
      ...(filters.entityType ? { entityType: filters.entityType } : {}),
      ...(filters.action ? { action: { contains: filters.action } } : {}),
      ...(filters.from || filters.to
        ? {
            createdAt: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {}),
            },
          }
        : {}),
    },
    include: { actor: { select: { id: true, fullName: true } } },
    orderBy: { createdAt: 'desc' },
    take: filters.limit ?? 50,
    skip: filters.offset ?? 0,
  });
}

export { LEAD_SOURCES, EXPENSE_CATEGORIES };
