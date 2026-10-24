import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { hashToken } from '../src/lib/crypto.js';
import {
  PRIVILEGE_CODES,
  LEAD_SOURCES,
  EXPENSE_CATEGORIES,
  config,
} from '../src/config/index.js';

const prisma = new PrismaClient();

const PRIVILEGE_LABELS: Record<string, { ar: string; en: string }> = {
  admin: { ar: 'مدير', en: 'Admin' },
  sales: { ar: 'مبيعات', en: 'Sales' },
  media: { ar: 'ميديا', en: 'Media' },
  operation: { ar: 'عمليات', en: 'Operation' },
  instructor: { ar: 'مدرب', en: 'Instructor' },
  accountant: { ar: 'محاسب', en: 'Accountant' },
};

async function main() {
  console.log('Seeding database...');

  for (const code of PRIVILEGE_CODES) {
    await prisma.privilege.upsert({
      where: { code },
      create: {
        code,
        labelAr: PRIVILEGE_LABELS[code].ar,
        labelEn: PRIVILEGE_LABELS[code].en,
      },
      update: {},
    });
  }

  for (const src of LEAD_SOURCES) {
    await prisma.leadSource.upsert({
      where: { code: src.code },
      create: { code: src.code, labelAr: src.labelAr, isSystem: true },
      update: { labelAr: src.labelAr, isSystem: true },
    });
  }

  for (const cat of EXPENSE_CATEGORIES) {
    await prisma.expenseCategory.upsert({
      where: { code: cat.code },
      create: { code: cat.code, labelAr: cat.labelAr, isSystem: true },
      update: {},
    });
  }

  await prisma.settingsFinance.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton' },
    update: {},
  });

  const webhookToken = config.webhookDefaultSecret;
  await prisma.settingsWebhook.upsert({
    where: { id: 'singleton' },
    create: {
      id: 'singleton',
      secretTokenHash: hashToken(webhookToken),
      secretHint: webhookToken.slice(-4),
    },
    update: {},
  });

  await prisma.appSetting.upsert({
    where: { key: 'leadStuckDays' },
    create: { key: 'leadStuckDays', value: 7 },
    update: {},
  });

  const adminPriv = await prisma.privilege.findUnique({ where: { code: 'admin' } });
  const existingAdmin = await prisma.employee.findUnique({
    where: { email: config.bootstrap.adminEmail },
  });

  if (!existingAdmin && adminPriv) {
    const passwordHash = await bcrypt.hash(config.bootstrap.adminPassword, 12);
    const admin = await prisma.employee.create({
      data: {
        email: config.bootstrap.adminEmail,
        passwordHash,
        fullName: 'مدير النظام',
        isSalaried: true,
        isActive: true,
      },
    });

    await prisma.employeePrivilege.create({
      data: { employeeId: admin.id, privilegeId: adminPriv.id },
    });

    await prisma.wallet.create({ data: { ownerId: admin.id } });

    console.log(`Bootstrap admin created: ${config.bootstrap.adminEmail}`);
  }

  // Demo tracks
  const aiTrack = await prisma.courseTrack.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    create: { id: '00000000-0000-0000-0000-000000000001', nameAr: 'الذكاء الاصطناعي', nameEn: 'AI' },
    update: {},
  });

  await prisma.courseTrack.upsert({
    where: { id: '00000000-0000-0000-0000-000000000002' },
    create: { id: '00000000-0000-0000-0000-000000000002', nameAr: 'التداول', nameEn: 'Trading' },
    update: {},
  });

  console.log('Seed completed.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
