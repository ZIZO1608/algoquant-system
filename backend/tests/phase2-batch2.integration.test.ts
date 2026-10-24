import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { resetDb, disconnectTestDb } from './helpers/db.js';
import {
  createEmployee,
  createCourse,
  createEnrollment,
  createTrack,
} from './helpers/factories.js';
import {
  enrollStudent,
  issueCertificate,
  reissueCertificate,
  createStudent,
  recordPayment,
  submitEvaluationViaToken,
  submitEvaluationViaStaff,
  voidPayment,
} from '../src/services/student.service.js';
import {
  updateCourse,
  transitionTask,
  attachTemplate,
  createCourse as createCourseService,
} from '../src/services/course.service.js';
import {
  getPnLReport,
  getCourseCostReport,
} from '../src/services/finance.service.js';
import { getDashboard } from '../src/services/dashboard.service.js';
import { getEmployeePerformanceReport } from '../src/services/reports.service.js';
import {
  creditTeacherForSession,
  initiateRefund,
  transitionRefund,
} from '../src/services/wallet.service.js';
import {
  updateEmployee,
  submitAvailability,
} from '../src/services/employee.service.js';
import { createLead } from '../src/services/lead.service.js';
import { parseBotExtraData } from '../src/services/webhook.service.js';
import { deleteTemplateItem } from '../src/services/settings.service.js';
import { assertConversationMember } from '../src/services/chat.service.js';
import { getFileDownloadUrl } from '../src/services/file.service.js';
import { ConflictError, ValidationError, ForbiddenError } from '../src/lib/errors.js';

describe('Phase 2 Batch 2 (integration)', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  it('P2-H2/H3: capacity and course status gate enrollment', async () => {
    const admin = await createEmployee({});
    const draft = await createCourse({ status: 'draft', capacity: 2 });
    const student = await prisma.student.create({ data: { fullName: 'S1', phone: '0900000001' } });
    await expect(enrollStudent(draft.id, student.id, admin.id)).rejects.toThrow(ConflictError);

    const open = await createCourse({ status: 'enrollment_open', capacity: 1 });
    const s2 = await prisma.student.create({ data: { fullName: 'S2', phone: '0900000002' } });
    await enrollStudent(open.id, s2.id, admin.id);
    const s3 = await prisma.student.create({ data: { fullName: 'S3', phone: '0900000003' } });
    await expect(enrollStudent(open.id, s3.id, admin.id)).rejects.toThrow(ConflictError);
  });

  it('P2-H4: certificate requires completion/payment; reissue path', async () => {
    const admin = await createEmployee({});
    const course = await createCourse();
    const enrollment = await createEnrollment({
      courseId: course.id,
      totalPriceMinor: 100n,
      amountPaidMinor: 0n,
    });
    await expect(issueCertificate(enrollment.id, admin.id)).rejects.toThrow(ConflictError);

    await recordPayment(enrollment.id, 100n, admin.id);
    await prisma.enrollment.update({
      where: { id: enrollment.id },
      data: { enrollmentStatus: 'completed' },
    });
    const first = await issueCertificate(enrollment.id, admin.id);
    expect(first.status).toBe('issued');
    await expect(issueCertificate(enrollment.id, admin.id)).rejects.toThrow(ConflictError);

    const second = await reissueCertificate(enrollment.id, admin.id);
    expect(second.status).toBe('issued');
    expect(second.id).not.toBe(first.id);
    const revoked = await prisma.certificate.findUniqueOrThrow({ where: { id: first.id } });
    expect(revoked.status).toBe('revoked');
  });

  it('P2-H4: reissueCertificate from completed (no prior cert) sets certified', async () => {
    const admin = await createEmployee({});
    const course = await createCourse();
    const enrollment = await createEnrollment({
      courseId: course.id,
      totalPriceMinor: 100n,
    });
    await recordPayment(enrollment.id, 100n, admin.id);
    await prisma.enrollment.update({
      where: { id: enrollment.id },
      data: { enrollmentStatus: 'completed' },
    });

    const cert = await reissueCertificate(enrollment.id, admin.id);
    expect(cert.status).toBe('issued');
    const after = await prisma.enrollment.findUniqueOrThrow({ where: { id: enrollment.id } });
    expect(after.enrollmentStatus).toBe('certified');
  });

  it('P2-H5: startDate shift preserves session time-of-day (non-midnight)', async () => {
    const admin = await createEmployee({});
    const start = new Date('2026-09-01T00:00:00.000Z');
    const course = await createCourse({ startDate: start, sessionCount: 2 });
    await prisma.courseSession.create({
      data: {
        courseId: course.id,
        sessionNumber: 1,
        scheduledAt: new Date('2026-09-01T10:00:00.000Z'),
        durationMinutes: 90,
      },
    });
    await prisma.courseSession.create({
      data: {
        courseId: course.id,
        sessionNumber: 2,
        scheduledAt: new Date('2026-09-08T10:00:00.000Z'),
        durationMinutes: 90,
      },
    });

    // Non-midnight TOD on newStart — old bug added +10h drift
    await updateCourse(
      course.id,
      { startDate: new Date('2026-09-10T10:00:00.000Z') },
      admin.id,
      ['admin']
    );
    const sessions = await prisma.courseSession.findMany({
      where: { courseId: course.id },
      orderBy: { sessionNumber: 'asc' },
    });
    expect(sessions[0].scheduledAt.toISOString()).toBe('2026-09-10T10:00:00.000Z');
    expect(sessions[1].scheduledAt.toISOString()).toBe('2026-09-17T10:00:00.000Z');
  });

  it('P2-H5/M8: overlapping startDate shift rolls back sessions and startDate', async () => {
    const admin = await createEmployee({});
    const instructor = await createEmployee({
      privileges: ['instructor'],
      email: 'shift-ov@t.local',
    });
    const track = await createTrack();

    const courseA = await createCourseService(
      {
        name: 'A',
        trackId: track.id,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        sessionCount: 1,
        priceMinor: 100n,
        capacity: 10,
        primaryInstructorId: instructor.id,
      },
      admin.id
    );
    // Force session to known non-midnight time
    const sessionA = await prisma.courseSession.findFirstOrThrow({
      where: { courseId: courseA.id },
    });
    await prisma.courseSession.update({
      where: { id: sessionA.id },
      data: { scheduledAt: new Date('2026-09-01T10:00:00.000Z') },
    });

    const courseB = await createCourseService(
      {
        name: 'B',
        trackId: track.id,
        startDate: new Date('2026-09-10T00:00:00.000Z'),
        sessionCount: 1,
        priceMinor: 100n,
        capacity: 10,
        primaryInstructorId: instructor.id,
      },
      admin.id
    );
    const sessionB = await prisma.courseSession.findFirstOrThrow({
      where: { courseId: courseB.id },
    });
    await prisma.courseSession.update({
      where: { id: sessionB.id },
      data: { scheduledAt: new Date('2026-09-10T10:00:00.000Z') },
    });

    const beforeStart = (
      await prisma.course.findUniqueOrThrow({ where: { id: courseA.id } })
    ).startDate;
    const beforeSession = (
      await prisma.courseSession.findUniqueOrThrow({ where: { id: sessionA.id } })
    ).scheduledAt;

    await expect(
      updateCourse(
        courseA.id,
        { startDate: new Date('2026-09-10T10:00:00.000Z') },
        admin.id,
        ['admin']
      )
    ).rejects.toThrow(ConflictError);

    const afterCourse = await prisma.course.findUniqueOrThrow({ where: { id: courseA.id } });
    const afterSession = await prisma.courseSession.findUniqueOrThrow({
      where: { id: sessionA.id },
    });
    expect(afterCourse.startDate.toISOString().slice(0, 10)).toBe(
      beforeStart.toISOString().slice(0, 10)
    );
    expect(afterSession.scheduledAt.toISOString()).toBe(beforeSession.toISOString());
  });

  it('P2-H5: resync inside transaction uses shifted session dates for task dueAt', async () => {
    const admin = await createEmployee({});
    const start = new Date('2026-09-01T00:00:00.000Z');
    const course = await createCourse({ startDate: start, sessionCount: 1 });
    const session = await prisma.courseSession.create({
      data: {
        courseId: course.id,
        sessionNumber: 1,
        scheduledAt: new Date('2026-09-01T10:00:00.000Z'),
        durationMinutes: 90,
      },
    });
    const template = await prisma.taskPathTemplate.create({ data: { name: 'sess-num' } });
    const item = await prisma.taskPathTemplateItem.create({
      data: {
        templateId: template.id,
        title: 'Session-tied',
        phaseKey: 'during',
        specialty: 'media',
        offsetType: 'session_number',
        offsetValue: 1,
        sortOrder: 0,
      },
    });
    await prisma.courseTaskPathLink.create({
      data: { courseId: course.id, templateId: template.id, attachedById: admin.id },
    });
    const task = await prisma.task.create({
      data: {
        courseId: course.id,
        templateItemId: item.id,
        title: 'Session-tied',
        phaseKey: 'during',
        specialty: 'media',
        status: 'pending',
        dueAt: session.scheduledAt,
      },
    });

    await updateCourse(
      course.id,
      { startDate: new Date('2026-09-10T10:00:00.000Z') },
      admin.id,
      ['admin']
    );

    const shiftedSession = await prisma.courseSession.findUniqueOrThrow({
      where: { id: session.id },
    });
    const afterTask = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(shiftedSession.scheduledAt.toISOString()).toBe('2026-09-10T10:00:00.000Z');
    expect(afterTask.dueAt?.toISOString()).toBe(shiftedSession.scheduledAt.toISOString());
  });

  it('P2-H6/M13: refunds net out of P&L and dashboard income', async () => {
    const admin = await createEmployee({ privileges: ['admin', 'accountant'] });
    const course = await createCourse();
    const enrollment = await createEnrollment({
      courseId: course.id,
      totalPriceMinor: 1000n,
    });
    await recordPayment(enrollment.id, 1000n, admin.id);
    const refund = await initiateRefund(enrollment.id, 400n, 'partial', admin.id);
    await transitionRefund(refund.id, 'under_review', admin.id);
    await transitionRefund(refund.id, 'approved', admin.id);
    await transitionRefund(refund.id, 'processed', admin.id);

    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const pnl = await getPnLReport(from, to);
    expect(pnl.income).toBe('600');

    const dash = await getDashboard(admin.id, ['admin', 'accountant']);
    expect((dash.finance as { monthlyRevenue: string }).monthlyRevenue).toBe('600');
  });

  it('P2-H7: course cost instructor pay is course-scoped and nets reversals', async () => {
    const instructor = await createEmployee({ privileges: ['instructor'], email: 'i1@t.local' });
    const otherInst = await createEmployee({ privileges: ['instructor'], email: 'i2@t.local' });
    const c1 = await createCourse({
      primaryInstructorId: instructor.id,
      priceMinor: 1_000_000n,
      sessionCount: 1,
    });
    const c2 = await createCourse({
      primaryInstructorId: otherInst.id,
      priceMinor: 1_000_000n,
      sessionCount: 1,
    });
    await prisma.courseInstructor.create({
      data: { courseId: c1.id, employeeId: instructor.id, payPercent: 50 },
    });
    await prisma.courseInstructor.create({
      data: { courseId: c2.id, employeeId: otherInst.id, payPercent: 20 },
    });
    const s1 = await prisma.courseSession.create({
      data: {
        courseId: c1.id,
        sessionNumber: 1,
        scheduledAt: new Date(),
        durationMinutes: 90,
      },
    });
    const s2 = await prisma.courseSession.create({
      data: {
        courseId: c2.id,
        sessionNumber: 1,
        scheduledAt: new Date(),
        durationMinutes: 90,
      },
    });
    await creditTeacherForSession(s1.id, instructor.id);
    await creditTeacherForSession(s2.id, otherInst.id);

    const r1 = await getCourseCostReport(c1.id);
    const r2 = await getCourseCostReport(c2.id);
    expect(r1.instructorPayMinor).not.toBe('0');
    expect(r1.instructorPayMinor).not.toBe(r2.instructorPayMinor);
  });

  it('P2-M9: soft-deleted tasks excluded from performance', async () => {
    const emp = await createEmployee({ privileges: ['media'] });
    const course = await createCourse();
    const task = await prisma.task.create({
      data: {
        courseId: course.id,
        title: 'gone',
        phaseKey: 'pre',
        specialty: 'media',
        assignedEmployeeId: emp.id,
        status: 'pending',
        deletedAt: new Date(),
      },
    });
    const report = await getEmployeePerformanceReport();
    const hit = report.taskStats.find(
      (t) => t.assignedEmployeeId === emp.id && t.status === 'pending'
    );
    expect(hit).toBeUndefined();
    expect(task.id).toBeTruthy();
  });

  it('P2-M13: voided payment excluded from dashboard revenue', async () => {
    const admin = await createEmployee({ privileges: ['admin', 'accountant'] });
    const course = await createCourse();
    const enrollment = await createEnrollment({
      courseId: course.id,
      totalPriceMinor: 500n,
    });
    await recordPayment(enrollment.id, 500n, admin.id);
    const payment = await prisma.studentPayment.findFirstOrThrow({
      where: { enrollmentId: enrollment.id },
    });
    await voidPayment(payment.id, admin.id, 'void');
    const dash = await getDashboard(admin.id, ['admin', 'accountant']);
    expect((dash.finance as { monthlyRevenue: string }).monthlyRevenue).toBe('0');
  });

  it('P2-H8: assertConversationMember rejects non-members', async () => {
    const a = await createEmployee({ email: 'a@t.local' });
    const b = await createEmployee({ email: 'b@t.local' });
    const conv = await prisma.conversation.create({ data: { type: 'dm', title: 'dm' } });
    await prisma.conversationMember.create({
      data: { conversationId: conv.id, employeeId: a.id },
    });
    await expect(assertConversationMember(b.id, conv.id)).rejects.toThrow(ForbiddenError);
    await assertConversationMember(a.id, conv.id);
  });

  it('P2-M10: empty / overlong chat messages rejected', async () => {
    const { sendMessage } = await import('../src/services/chat.service.js');
    const a = await createEmployee({ email: 'chat1@t.local' });
    const conv = await prisma.conversation.create({ data: { type: 'team', title: 't' } });
    await prisma.conversationMember.create({
      data: { conversationId: conv.id, employeeId: a.id },
    });
    await expect(sendMessage(conv.id, a.id, '   ')).rejects.toThrow(ValidationError);
    await expect(sendMessage(conv.id, a.id, 'x'.repeat(4001))).rejects.toThrow(ValidationError);
  });

  it('P2-M11: conversation member can download message attachment file', async () => {
    const uploader = await createEmployee({ privileges: ['sales'], email: 'up@t.local' });
    const member = await createEmployee({ privileges: ['sales'], email: 'mem@t.local' });
    const outsider = await createEmployee({ privileges: ['sales'], email: 'out@t.local' });
    const conv = await prisma.conversation.create({ data: { type: 'dm', title: 'dm2' } });
    await prisma.conversationMember.createMany({
      data: [
        { conversationId: conv.id, employeeId: uploader.id },
        { conversationId: conv.id, employeeId: member.id },
      ],
    });
    const msg = await prisma.message.create({
      data: { conversationId: conv.id, senderId: uploader.id, body: 'hi' },
    });
    const file = await prisma.fileObject.create({
      data: {
        storageKey: 'chat/x.png',
        bucket: 'algo-quant',
        mime: 'image/png',
        size: 10,
        uploadedById: uploader.id,
        purpose: 'chat',
        entityType: 'message',
        entityId: msg.id,
      },
    });
    await prisma.messageAttachment.create({
      data: {
        messageId: msg.id,
        storageKey: file.storageKey,
        mime: file.mime,
        fileObjectId: file.id,
      },
    });

    try {
      await getFileDownloadUrl(file.id, ['sales'], member.id);
    } catch (err) {
      expect(err).not.toBeInstanceOf(ForbiddenError);
    }
    await expect(getFileDownloadUrl(file.id, ['sales'], outsider.id)).rejects.toThrow(
      ForbiddenError
    );
  });

  it('P2-H9: deactivating employee with open leads requires confirm/reassign', async () => {
    const admin = await createEmployee({ email: 'adm@t.local' });
    const sales = await createEmployee({ privileges: ['sales'], email: 'sales@t.local' });
    const replacement = await createEmployee({ privileges: ['sales'], email: 'rep@t.local' });
    const source = await prisma.leadSource.create({
      data: { code: 'x', labelAr: 'x', isSystem: false },
    });
    await prisma.lead.create({
      data: {
        fullName: 'L',
        phone: '0912345678',
        sourceId: source.id,
        status: 'interested',
        assignedEmployeeId: sales.id,
      },
    });

    await expect(
      updateEmployee(sales.id, { isActive: false }, admin.id)
    ).rejects.toThrow(ConflictError);

    await updateEmployee(
      sales.id,
      { isActive: false, reassignToId: replacement.id },
      admin.id
    );
    const lead = await prisma.lead.findFirstOrThrow({ where: { phone: '0912345678' } });
    expect(lead.assignedEmployeeId).toBe(replacement.id);
  });

  it('P2-M8: overlapping instructor sessions blocked', async () => {
    const admin = await createEmployee({});
    const instructor = await createEmployee({
      privileges: ['instructor'],
      email: 'ov@t.local',
    });
    const track = await createTrack();
    const start = new Date('2026-09-01T10:00:00.000Z');
    await createCourseService(
      {
        name: 'C1',
        trackId: track.id,
        startDate: start,
        sessionCount: 1,
        priceMinor: 100n,
        capacity: 10,
        primaryInstructorId: instructor.id,
      },
      admin.id
    );
    await expect(
      createCourseService(
        {
          name: 'C2',
          trackId: track.id,
          startDate: start,
          sessionCount: 1,
          priceMinor: 100n,
          capacity: 10,
          primaryInstructorId: instructor.id,
        },
        admin.id
      )
    ).rejects.toThrow(ConflictError);
  });

  it('P2-L4: inverted availability rejected', async () => {
    const emp = await createEmployee({ privileges: ['instructor'] });
    const start = new Date('2026-09-01T12:00:00.000Z');
    const end = new Date('2026-09-01T10:00:00.000Z');
    await expect(submitAvailability(emp.id, start, end)).rejects.toThrow(ValidationError);
  });

  it('P2-M1: duplicate student phone rejected on direct create', async () => {
    await createStudent({ fullName: 'A', phone: '0999888777' });
    await expect(createStudent({ fullName: 'B', phone: '0999888777' })).rejects.toThrow(
      ConflictError
    );
  });

  it('P2-M2: duplicate lead phone requires force', async () => {
    const admin = await createEmployee({});
    const source = await prisma.leadSource.create({
      data: { code: 'm', labelAr: 'm', isSystem: false },
    });
    await createLead(
      { fullName: 'A', phone: '0988776655', sourceId: source.id },
      'employee',
      admin.id
    );
    await expect(
      createLead(
        { fullName: 'B', phone: '0988776655', sourceId: source.id },
        'employee',
        admin.id
      )
    ).rejects.toThrow(ConflictError);
    const forced = await createLead(
      { fullName: 'B', phone: '0988776655', sourceId: source.id, force: true },
      'employee',
      admin.id
    );
    expect(forced.phone).toBe('0988776655');
  });

  it('P2-L2: excessive freeform webhook keys rejected', () => {
    const query: Record<string, string> = { full_name: 'x', phone: '1' };
    for (let i = 0; i < 25; i++) query[`custom_${i}`] = 'v';
    expect(() => parseBotExtraData(query)).toThrow(/Too many freeform/);
  });

  it('P2-M3: concurrent token evaluation submits once', async () => {
    const course = await createCourse();
    const student = await prisma.student.create({ data: { fullName: 'E', phone: '0911110000' } });
    await createEnrollment({ courseId: course.id, studentId: student.id });
    const campaign = await prisma.evaluationCampaign.create({
      data: { courseId: course.id, type: 'post_course', opensAt: new Date() },
    });
    const raw = 'tok-concurrent-1';
    await prisma.evaluationToken.create({
      data: {
        campaignId: campaign.id,
        studentId: student.id,
        token: raw,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    const scores = {
      courseScore: 8,
      teacherScore: 8,
      hallScore: 8,
      benefitLevel: 8,
    };
    const results = await Promise.allSettled([
      submitEvaluationViaToken(raw, scores),
      submitEvaluationViaToken(raw, scores),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.evaluation.count({ where: { campaignId: campaign.id } })).toBe(1);
  });

  it('P2-M4: staff eval requires campaignId and rejects duplicate', async () => {
    const admin = await createEmployee({});
    const course = await createCourse();
    const enrollment = await createEnrollment({ courseId: course.id });
    const campaign = await prisma.evaluationCampaign.create({
      data: { courseId: course.id, type: 'post_course', opensAt: new Date() },
    });
    const scores = {
      courseScore: 7,
      teacherScore: 7,
      hallScore: 7,
      benefitLevel: 7,
      campaignId: campaign.id,
    };
    await submitEvaluationViaStaff(enrollment.id, scores, admin.id);
    await expect(submitEvaluationViaStaff(enrollment.id, scores, admin.id)).rejects.toThrow(
      ConflictError
    );
  });

  it('P2-M5: completing past-due task rates as late without cron', async () => {
    const emp = await createEmployee({ privileges: ['media'] });
    const course = await createCourse();
    const task = await prisma.task.create({
      data: {
        courseId: course.id,
        title: 'late-ish',
        phaseKey: 'during',
        specialty: 'media',
        assignedEmployeeId: emp.id,
        status: 'pending',
        dueAt: new Date(Date.now() - 60_000),
        isLate: false,
      },
    });
    await transitionTask(task.id, 'in_progress', emp.id, 'employee', ['media']);
    await transitionTask(task.id, 'done', emp.id, 'employee', ['media']);
    const event = await prisma.employeeRatingEvent.findFirst({
      where: { taskId: task.id },
    });
    expect(event?.reason).toBe('late');
    expect(event?.delta).toBe(-10);
  });

  it('P2-M6: attachTemplate writes audit log', async () => {
    const admin = await createEmployee({});
    const course = await createCourse();
    const template = await prisma.taskPathTemplate.create({ data: { name: 'T1' } });
    await attachTemplate(course.id, template.id, admin.id);
    const log = await prisma.auditLog.findFirst({
      where: { action: 'course.template_attached', entityId: course.id },
    });
    expect(log).toBeTruthy();
  });

  it('P2-M7: resync skips done tasks', async () => {
    const admin = await createEmployee({});
    const course = await createCourse({ startDate: new Date('2026-10-01') });
    const template = await prisma.taskPathTemplate.create({ data: { name: 'T2' } });
    const item = await prisma.taskPathTemplateItem.create({
      data: {
        templateId: template.id,
        title: 'Original',
        phaseKey: 'before_start',
        specialty: 'media',
        offsetType: 'days_from_start',
        offsetValue: 1,
        sortOrder: 0,
      },
    });
    await prisma.courseTaskPathLink.create({
      data: { courseId: course.id, templateId: template.id, attachedById: admin.id },
    });
    const task = await prisma.task.create({
      data: {
        courseId: course.id,
        templateItemId: item.id,
        title: 'Original',
        phaseKey: 'before_start',
        specialty: 'media',
        status: 'done',
        dueAt: new Date('2026-09-30'),
      },
    });
    await prisma.taskPathTemplateItem.update({
      where: { id: item.id },
      data: { title: 'Changed' },
    });
    const { resyncTasksFromTemplate } = await import('../src/services/course.service.js');
    await resyncTasksFromTemplate(course.id, admin.id);
    const after = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(after.title).toBe('Original');
  });

  it('P2-M12: delete template item with tasks blocked', async () => {
    const admin = await createEmployee({});
    const course = await createCourse();
    const template = await prisma.taskPathTemplate.create({ data: { name: 'T3' } });
    const item = await prisma.taskPathTemplateItem.create({
      data: {
        templateId: template.id,
        title: 'I',
        phaseKey: 'start',
        specialty: 'operation',
        offsetType: 'days_from_start',
        offsetValue: 0,
        sortOrder: 0,
      },
    });
    await prisma.task.create({
      data: {
        courseId: course.id,
        templateItemId: item.id,
        title: 'I',
        phaseKey: 'start',
        specialty: 'operation',
      },
    });
    await expect(deleteTemplateItem(item.id, admin.id)).rejects.toThrow(ConflictError);
    const empty = await prisma.taskPathTemplateItem.create({
      data: {
        templateId: template.id,
        title: 'Empty',
        phaseKey: 'end',
        specialty: 'operation',
        offsetType: 'days_from_start',
        offsetValue: 0,
        sortOrder: 1,
      },
    });
    await deleteTemplateItem(empty.id, admin.id);
    expect(await prisma.taskPathTemplateItem.findUnique({ where: { id: empty.id } })).toBeNull();
  });

  it('FE-C2: operation hallNotes-only update leaves instructor pay unchanged', async () => {
    const ops = await createEmployee({
      privileges: ['operation'],
      email: 'ops-hall@t.local',
    });
    const instructor = await createEmployee({
      privileges: ['instructor'],
      email: 'inst-hall@t.local',
    });
    const course = await createCourse({ primaryInstructorId: instructor.id });
    await prisma.courseInstructor.create({
      data: {
        courseId: course.id,
        employeeId: instructor.id,
        payPercent: 42,
        hourlyRateMinor: 2500n,
      },
    });

    await updateCourse(course.id, { hallNotes: 'قاعة A' }, ops.id, ['operation']);

    const link = await prisma.courseInstructor.findFirstOrThrow({
      where: { courseId: course.id, employeeId: instructor.id },
    });
    expect(link.payPercent).toBe(42);
    expect(link.hourlyRateMinor).toBe(2500n);

    const updated = await prisma.course.findUniqueOrThrow({ where: { id: course.id } });
    expect(updated.hallNotes).toBe('قاعة A');
  });

  it('FE-C1: employee.updated audit log omits password plaintext', async () => {
    const admin = await createEmployee({ email: 'audit-admin@t.local' });
    const target = await createEmployee({ email: 'audit-target@t.local' });

    await updateEmployee(target.id, { password: 'Secret123!' }, admin.id);

    const log = await prisma.auditLog.findFirst({
      where: { action: 'employee.updated', entityId: target.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(log).toBeTruthy();
    const newValue = log!.newValue as Record<string, unknown> | null;
    expect(newValue).not.toHaveProperty('password');
    expect(newValue).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(newValue ?? {})).not.toContain('Secret123!');
  });
});
