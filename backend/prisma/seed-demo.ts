/**
 * Demo data for the live presentation (see demo-run-sheet.html).
 *
 * Run AFTER the base seed (`npm run db:seed`), because it relies on:
 *   - privileges, lead sources, task phases, tracks, bootstrap admin
 *     (all created by prisma/seed.ts)
 *
 * Usage:
 *   npm run db:seed-demo
 *
 * It is safe to re-run: employees/template are looked up by unique fields
 * first, and the lead/course names are tagged with "(عرض)" so you can find
 * and wipe them easily if you want a clean re-run (see RESET note at the
 * bottom of this file).
 *
 * Every block below is labelled with the timecode from demo-run-sheet.html
 * so you can see exactly which screen it feeds.
 */

import { PrismaClient } from '@prisma/client';
import { config } from '../src/config/index.js';
import { createEmployee } from '../src/services/employee.service.js';
import {
  createTaskPathTemplate,
  addTemplateItem,
} from '../src/services/settings.service.js';
import { createCourse } from '../src/services/course.service.js';
import { createLead, transitionLead, convertLeadWithPayment, setLeadFollowUp } from '../src/services/lead.service.js';
import {
  enrollStudent,
  recordPayment,
  recordAttendance,
} from '../src/services/student.service.js';
import { transitionTask } from '../src/services/course.service.js';

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'Demo@123';
const AI_TRACK_ID = '00000000-0000-0000-0000-000000000001';
const TRADING_TRACK_ID = '00000000-0000-0000-0000-000000000002';

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setHours(9, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
}

async function getOrCreateEmployee(
  email: string,
  data: Parameters<typeof createEmployee>[0],
  actorId: string
) {
  const existing = await prisma.employee.findUnique({ where: { email } });
  if (existing) return existing;
  return createEmployee(data, actorId);
}

async function main() {
  console.log('Seeding demo data for the presentation...');

  const admin = await prisma.employee.findUnique({
    where: { email: config.bootstrap.adminEmail },
  });
  if (!admin) {
    throw new Error(
      'Bootstrap admin not found. Run `npm run db:seed` first, then re-run this script.'
    );
  }

  // ── 0:30 Setup — الموظفون والصلاحيات ──────────────────────────────────────
  const sales = await getOrCreateEmployee(
    'reem.sales@algoquant.local',
    {
      email: 'reem.sales@algoquant.local',
      password: DEMO_PASSWORD,
      fullName: 'ريم الحلبي',
      phone: '0933100201',
      isSalaried: true,
      monthlySalaryMinor: 1_500_000n,
      privilegeCodes: ['sales'],
    },
    admin.id
  );

  const media = await getOrCreateEmployee(
    'karim.media@algoquant.local',
    {
      email: 'karim.media@algoquant.local',
      password: DEMO_PASSWORD,
      fullName: 'كريم النجار',
      phone: '0933100202',
      isSalaried: true,
      monthlySalaryMinor: 1_400_000n,
      privilegeCodes: ['media'],
    },
    admin.id
  );

  const ops = await getOrCreateEmployee(
    'sara.ops@algoquant.local',
    {
      email: 'sara.ops@algoquant.local',
      password: DEMO_PASSWORD,
      fullName: 'سارة قاسم',
      phone: '0933100203',
      isSalaried: true,
      monthlySalaryMinor: 1_450_000n,
      privilegeCodes: ['operation'],
    },
    admin.id
  );

  const accountant = await getOrCreateEmployee(
    'fadi.finance@algoquant.local',
    {
      email: 'fadi.finance@algoquant.local',
      password: DEMO_PASSWORD,
      fullName: 'فادي عيسى',
      phone: '0933100204',
      isSalaried: true,
      monthlySalaryMinor: 1_600_000n,
      privilegeCodes: ['accountant'],
    },
    admin.id
  );

  const instructor = await getOrCreateEmployee(
    'omar.instructor@algoquant.local',
    {
      email: 'omar.instructor@algoquant.local',
      password: DEMO_PASSWORD,
      fullName: 'د. عمر الشامي',
      phone: '0933100205',
      isSalaried: false,
      privilegeCodes: ['instructor'],
    },
    admin.id
  );

  console.log('Employees ready. Demo password for all of them:', DEMO_PASSWORD);

  // ── 0:30 Setup — قوالب مسار المهام ──────────────────────────────────────
  // "القالب هو السر: تعرّف الشغل مرة، وكل دورة جديدة تنسخ المهام"
  let template = await prisma.taskPathTemplate.findFirst({
    where: { name: 'مسار دورة الذكاء الاصطناعي القياسي' },
  });
  if (!template) {
    template = await createTaskPathTemplate(
      'مسار دورة الذكاء الاصطناعي القياسي',
      'المهام المتكررة لأي دفعة من مسار الذكاء الاصطناعي — من التحضير قبل البداية وحتى الشهادات'
    );

    await addTemplateItem(template.id, {
      title: 'تأكيد قائمة المسجلين ودفعاتهم',
      phaseKey: 'before_start',
      specialty: 'sales',
      offsetType: 'days_from_start',
      offsetValue: 2,
    });
    await addTemplateItem(template.id, {
      title: 'حجز القاعة وتجهيز الأجهزة',
      phaseKey: 'before_start',
      specialty: 'logistics',
      offsetType: 'days_from_start',
      offsetValue: 1,
    });
    await addTemplateItem(template.id, {
      title: 'تأكيد حضور المدرب وتجهيزاته',
      phaseKey: 'before_start',
      specialty: 'operation',
      offsetType: 'days_from_start',
      offsetValue: 1,
    });
    await addTemplateItem(template.id, {
      title: 'تصوير الجلسة الأولى للإعلانات',
      phaseKey: 'start',
      specialty: 'media',
      offsetType: 'session_number',
      offsetValue: 1,
    });
    await addTemplateItem(template.id, {
      title: 'متابعة الحضور أسبوعياً',
      phaseKey: 'during',
      specialty: 'logistics',
      offsetType: 'session_number',
      offsetValue: 0,
    });
    await addTemplateItem(template.id, {
      title: 'نشر تحديث أسبوعي على انستغرام',
      phaseKey: 'during',
      specialty: 'media',
      offsetType: 'session_number',
      offsetValue: 0,
    });
    await addTemplateItem(template.id, {
      title: 'جمع تقييمات الطلاب ونتائج الدورة',
      phaseKey: 'end',
      specialty: 'operation',
      offsetType: 'session_number',
      offsetValue: -1,
    });
    await addTemplateItem(template.id, {
      title: 'إصدار تقرير الإيرادات النهائي للدورة',
      phaseKey: 'after_end',
      specialty: 'accountant',
      offsetType: 'days_from_start',
      offsetValue: 3,
    });
    await addTemplateItem(template.id, {
      title: 'إصدار الشهادات وتسليمها للطلاب',
      phaseKey: 'after_end',
      specialty: 'operation',
      offsetType: 'days_from_start',
      offsetValue: 5,
    });
  }

  // ── 2:30 Course — الدورات ← دورة الحياة (المهام ظهرت) ───────────────────
  // startDate 21 days ago so the course is already "active": some sessions
  // are done (good for the attendance demo), some are still upcoming.
  const courseStart = daysFromNow(-21);
  let course = await prisma.course.findFirst({
    where: { name: 'دفعة الذكاء الاصطناعي التطبيقي — أغسطس' },
  });
  if (!course) {
    course = await createCourse(
      {
        name: 'دفعة الذكاء الاصطناعي التطبيقي — أغسطس',
        trackId: AI_TRACK_ID,
        startDate: courseStart,
        sessionCount: 8,
        totalHours: 24,
        priceMinor: 2_500_000n,
        capacity: 20,
        primaryInstructorId: instructor.id,
        teacherPayMode: 'percent',
        payPercent: 50,
        taskPathTemplateId: template.id,
      },
      admin.id
    );
  }

  const sessions = await prisma.courseSession.findMany({
    where: { courseId: course.id },
    orderBy: { sessionNumber: 'asc' },
  });

  // ── 4:30 Lead + money — اللحظة الحاسمة ───────────────────────────────────
  // العميل يدخل من بوت التأهيل، يتحرك بالـ CRM لحد التفاوض، ثم "تسجيل
  // وتحصيل" يحوّله لطالب + تسجيل + دفعة بضغطة واحدة.
  const existingHeadlineLead = await prisma.lead.findFirst({
    where: { phone: '0999123456' },
  });

  if (!existingHeadlineLead) {
    const headlineLead = await createLead(
      {
        fullName: 'لمى دندش',
        phone: '0999123456',
        sourceId: (await prisma.leadSource.findUniqueOrThrow({ where: { code: 'bot' } })).id,
        requestedTrackId: AI_TRACK_ID,
        assignedEmployeeId: sales.id,
        sourceSystem: 'qualification_bot',
        externalLeadId: 'demo-lama-dandash',
        extraData: {
          interest_area: 'الذكاء الاصطناعي',
          main_goal: 'تطوير مسار مهني في الذكاء الاصطناعي',
          lead_classification: 'جاد',
          seriousness_level: 'مرتفع',
          ready_to_register: 'نعم',
          needs_a_call: 'نعم',
          city: 'حلب',
          occupation_type: 'موظفة',
          ai_experience_score: '3',
          preferred_contact_times: 'مساءً',
          preferred_contact_method: 'واتساب',
          recommendation_reason: 'مهتمة فعلياً وأبدت استعداداً للدفع',
        },
      },
      'bot_webhook'
    );

    await transitionLead(headlineLead.id, 'contacted', sales.id);
    await transitionLead(headlineLead.id, 'interested', sales.id);
    await setLeadFollowUp(
      headlineLead.id,
      new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      sales.id
    );

    // "تسجيل وتحصيل" — الزر الواحد الذي يحوّل العميل لطالب + تسجيل + دفعة
    await convertLeadWithPayment(
      headlineLead.id,
      {
        courseId: course.id,
        amountMinor: 1_000_000n,
        method: 'cash',
        note: 'دفعة أولى نقدية عند التسجيل',
        totalPriceMinor: 2_500_000n,
      },
      sales.id,
      ['sales']
    );
  }

  // ── Extra CRM board texture — leads at other stages / sources ───────────
  const leadSeeds: Array<{
    fullName: string;
    phone: string;
    sourceCode: string;
    status: 'new' | 'contacted' | 'interested' | 'lost';
    trackId?: string;
    assignedEmployeeId?: string;
    reason?: string;
    nextFollowUpAt?: Date;
  }> = [
    {
      fullName: 'أحمد الزعبي',
      phone: '0988112233',
      sourceCode: 'social_media',
      status: 'new',
      trackId: TRADING_TRACK_ID,
    },
    {
      fullName: 'هبة النجار',
      phone: '0955223344',
      sourceCode: 'bot',
      status: 'interested',
      trackId: AI_TRACK_ID,
      assignedEmployeeId: sales.id,
    },
    {
      fullName: 'ياسمين قدور',
      phone: '0966334455',
      sourceCode: 'reference',
      status: 'interested',
      trackId: AI_TRACK_ID,
      assignedEmployeeId: sales.id,
      nextFollowUpAt: new Date(),
    },
    {
      fullName: 'بسام ديوب',
      phone: '0977445566',
      sourceCode: 'sales',
      status: 'lost',
      trackId: TRADING_TRACK_ID,
      assignedEmployeeId: sales.id,
      reason: 'السعر غير مناسب حالياً',
    },
  ];

  for (const ls of leadSeeds) {
    const already = await prisma.lead.findFirst({ where: { phone: ls.phone } });
    if (already) continue;

    const source = await prisma.leadSource.findUniqueOrThrow({ where: { code: ls.sourceCode } });
    const lead = await createLead(
      {
        fullName: ls.fullName,
        phone: ls.phone,
        sourceId: source.id,
        requestedTrackId: ls.trackId,
        assignedEmployeeId: ls.assignedEmployeeId,
      },
      ls.sourceCode === 'bot' ? 'bot_webhook' : 'employee',
      ls.assignedEmployeeId
    );

    const path: Array<'contacted' | 'interested' | 'lost'> =
      ls.status === 'new'
        ? []
        : ls.status === 'contacted'
          ? ['contacted']
          : ls.status === 'interested'
            ? ['contacted', 'interested']
            : ['contacted', 'lost'];

    for (const step of path) {
      await transitionLead(lead.id, step, sales.id, step === 'lost' ? ls.reason : undefined);
    }
    if (ls.nextFollowUpAt) {
      await setLeadFollowUp(lead.id, ls.nextFollowUpAt, sales.id);
    }
  }

  // ── Extra paying students — so Finance / course roster look real ───────
  async function ensureStudentEnrollment(
    fullName: string,
    phone: string,
    paidMinor: bigint
  ) {
    let student = await prisma.student.findFirst({ where: { phone } });
    if (!student) {
      student = await prisma.student.create({
        data: { fullName, phone, searchText: fullName },
      });
    }
    let enrollment = await prisma.enrollment.findUnique({
      where: { studentId_courseId: { studentId: student.id, courseId: course!.id } },
    });
    if (!enrollment) {
      enrollment = await enrollStudent(course!.id, student.id, admin.id, undefined, 2_500_000n);
      if (paidMinor > 0n) {
        enrollment = await recordPayment(enrollment.id, paidMinor, accountant.id, 'transfer');
      }
    }
    return student;
  }

  const tareq = await ensureStudentEnrollment('طارق ملص', '0911556677', 2_500_000n);
  const rima = await ensureStudentEnrollment('ريما فارس', '0911667788', 1_500_000n);

  // ── 9:00 Tasks — تعيين، تشويه واحد "غير معيّن"، وواحد متأخر ─────────────
  const tasks = await prisma.task.findMany({ where: { courseId: course.id } });
  const byTitle = (t: string) => tasks.find((x) => x.title === t);

  const assignments: Array<{ title: string; employeeId: string; done?: boolean }> = [
    { title: 'تأكيد قائمة المسجلين ودفعاتهم', employeeId: sales.id, done: true },
    { title: 'حجز القاعة وتجهيز الأجهزة', employeeId: ops.id, done: true },
    { title: 'تصوير الجلسة الأولى للإعلانات', employeeId: media.id, done: true },
    { title: 'متابعة الحضور أسبوعياً', employeeId: ops.id },
    { title: 'جمع تقييمات الطلاب ونتائج الدورة', employeeId: ops.id },
    { title: 'إصدار تقرير الإيرادات النهائي للدورة', employeeId: accountant.id },
    { title: 'إصدار الشهادات وتسليمها للطلاب', employeeId: ops.id },
    // "تأكيد حضور المدرب وتجهيزاته" is intentionally left with no assignee,
    // then flipped to late below — this is the "unassigned + late" beat.
  ];

  for (const a of assignments) {
    const task = byTitle(a.title);
    if (!task || task.assignedEmployeeId) continue;
    await prisma.task.update({
      where: { id: task.id },
      data: { assignedEmployeeId: a.employeeId },
    });
    if (a.done) {
      await transitionTask(task.id, 'done', a.employeeId);
    } else {
      await transitionTask(task.id, 'in_progress', a.employeeId).catch(() => {});
    }
  }

  // "نشر تحديث أسبوعي على انستغرام" stays pending + unassigned on purpose
  // → the red "غير معيّن" pill in the Tasks board.

  const overdueTask = byTitle('تأكيد حضور المدرب وتجهيزاته');
  if (overdueTask && overdueTask.status === 'pending') {
    await prisma.task.update({
      where: { id: overdueTask.id },
      data: { assignedEmployeeId: ops.id },
    });
    await transitionTask(overdueTask.id, 'late', null, 'system');
  }

  // ── 12:00 Delivery — الجلسات ← حضور سريع ────────────────────────────────
  const pastSession = [...sessions].reverse().find((s) => s.scheduledAt < new Date());
  if (pastSession) {
    const enrolledStudents = await prisma.enrollment.findMany({
      where: { courseId: course.id },
      select: { studentId: true },
    });
    const records = enrolledStudents.map((e, i) => ({
      studentId: e.studentId,
      status: i === 2 ? ('absent' as const) : i === 3 ? ('late' as const) : ('present' as const),
    }));
    await recordAttendance(pastSession.id, records, ops.id, ['operation']);
  }

  console.log('Demo seed completed.');
  console.log('');
  console.log('Login credentials for the demo:');
  console.log(`  Admin:      ${config.bootstrap.adminEmail} / ${config.bootstrap.adminPassword}`);
  console.log(`  Sales:      reem.sales@algoquant.local / ${DEMO_PASSWORD}`);
  console.log(`  Media:      karim.media@algoquant.local / ${DEMO_PASSWORD}`);
  console.log(`  Operation:  sara.ops@algoquant.local / ${DEMO_PASSWORD}`);
  console.log(`  Accountant: fadi.finance@algoquant.local / ${DEMO_PASSWORD}`);
  console.log(`  Instructor: omar.instructor@algoquant.local / ${DEMO_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

/**
 * RESET: to wipe just the demo data and re-run clean, in psql:
 *   delete from tasks where course_id in (select id from courses where name like 'دفعة الذكاء الاصطناعي التطبيقي%');
 *   delete from courses where name like 'دفعة الذكاء الاصطناعي التطبيقي%';
 *   delete from leads where phone in ('0999123456','0988112233','0955223344','0966334455','0977445566');
 *   delete from students where phone in ('0911556677','0911667788');
 *   delete from employees where email like '%@algoquant.local' and email <> '<your BOOTSTRAP_ADMIN_EMAIL>';
 * (cascades handle enrollments/payments/attendance/etc.)
 */
