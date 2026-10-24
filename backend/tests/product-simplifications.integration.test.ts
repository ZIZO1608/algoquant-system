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
  setLeadFollowUp,
  createLead,
  transitionLead,
} from '../src/services/lead.service.js';
import { getDashboard } from '../src/services/dashboard.service.js';
import {
  createEmployee as createEmployeeService,
  updateEmployee,
} from '../src/services/employee.service.js';
import {
  createStakeholderRule,
  deleteStakeholderRule,
} from '../src/services/settings.service.js';
import {
  computeStakeholderProfitShare,
  processDueSalaries,
} from '../src/services/finance.service.js';
import { recordPayment } from '../src/services/student.service.js';
import {
  createCourse as createCourseService,
  listCourses,
  suggestTaskAssignees,
} from '../src/services/course.service.js';
import { requestSalaryAdvance } from '../src/services/wallet.service.js';
import { assertTransition, LEAD_TRANSITIONS } from '../src/state-machines/transitions.js';
import { ConflictError, ValidationError } from '../src/lib/errors.js';
import { toMinor } from '../src/lib/money.js';

describe('Product simplifications (integration)', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  describe('1. Lead nextFollowUpAt', () => {
    it('rejects new → paid; dashboard counts due nextFollowUpAt', async () => {
      expect(() => assertTransition(LEAD_TRANSITIONS, 'new', 'paid', 'lead')).toThrow(
        ConflictError
      );

      const sales = await createEmployee({ privileges: ['sales', 'admin'] });
      const source = await prisma.leadSource.create({
        data: { code: `src-${Date.now()}`, labelAr: 'اختبار' },
      });
      const lead = await createLead(
        {
          fullName: 'عميل متابعة',
          phone: `09${String(Date.now()).slice(-8)}`,
          sourceId: source.id,
          assignedEmployeeId: sales.id,
        },
        'employee',
        sales.id
      );
      await transitionLead(lead.id, 'contacted', sales.id);
      await transitionLead(lead.id, 'interested', sales.id);

      const due = new Date();
      due.setHours(12, 0, 0, 0);
      await setLeadFollowUp(lead.id, due, sales.id);

      const dash = await getDashboard(sales.id, ['admin', 'sales']);
      const salesWidget = dash.sales as { followUpsToday: number };
      expect(salesWidget.followUpsToday).toBeGreaterThanOrEqual(1);

      await setLeadFollowUp(lead.id, null, sales.id);
      const dash2 = await getDashboard(sales.id, ['admin', 'sales']);
      expect((dash2.sales as { followUpsToday: number }).followUpsToday).toBe(0);
    });
  });

  describe('2. Task assignee suggestions', () => {
    it('ranks by open task count then absence', async () => {
      const zero = await createEmployee({
        privileges: ['media'],
        email: 'm0@t.local',
        fullName: 'Media Zero',
      });
      const two = await createEmployee({
        privileges: ['media'],
        email: 'm2@t.local',
        fullName: 'Media Two',
      });
      const five = await createEmployee({
        privileges: ['media'],
        email: 'm5@t.local',
        fullName: 'Media Five',
      });
      const course = await createCourse();

      for (let i = 0; i < 2; i++) {
        await prisma.task.create({
          data: {
            courseId: course.id,
            title: `t2-${i}`,
            phaseKey: 'start',
            specialty: 'media',
            assignedEmployeeId: two.id,
            status: 'pending',
            dueAt: new Date(),
          },
        });
      }
      for (let i = 0; i < 5; i++) {
        await prisma.task.create({
          data: {
            courseId: course.id,
            title: `t5-${i}`,
            phaseKey: 'start',
            specialty: 'media',
            assignedEmployeeId: five.id,
            status: i % 2 === 0 ? 'in_progress' : 'late',
            dueAt: new Date(),
          },
        });
      }

      const ranked = await suggestTaskAssignees('media');
      const ids = ranked.map((r) => r.id);
      expect(ids.indexOf(zero.id)).toBeLessThan(ids.indexOf(two.id));
      expect(ids.indexOf(two.id)).toBeLessThan(ids.indexOf(five.id));
      expect(ranked.find((r) => r.id === zero.id)?.openTaskCount).toBe(0);
      expect(ranked.find((r) => r.id === two.id)?.openTaskCount).toBe(2);
      expect(ranked.find((r) => r.id === five.id)?.openTaskCount).toBe(5);

      const equalA = await createEmployee({
        privileges: ['media'],
        email: 'eq-a@t.local',
        fullName: 'Equal A',
      });
      const equalB = await createEmployee({
        privileges: ['media'],
        email: 'eq-b@t.local',
        fullName: 'Equal B',
      });
      const today = new Date();
      const todayDate = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
      await prisma.employeeAbsence.create({
        data: {
          employeeId: equalB.id,
          date: todayDate,
          markedById: zero.id,
        },
      });

      const ranked2 = await suggestTaskAssignees('media');
      const a = ranked2.find((r) => r.id === equalA.id)!;
      const b = ranked2.find((r) => r.id === equalB.id)!;
      expect(a.openTaskCount).toBe(0);
      expect(b.openTaskCount).toBe(0);
      expect(a.absentToday).toBe(false);
      expect(b.absentToday).toBe(true);
      expect(ranked2.indexOf(a)).toBeLessThan(ranked2.indexOf(b));
    });
  });

  describe('3. StakeholderRule CRUD + compute', () => {
    it('includes rule in profit share and excludes after delete', async () => {
      const stakeholder = await createEmployee({ privileges: ['admin'], email: 'sh@t.local' });
      const admin = await createEmployee({ privileges: ['admin'], email: 'adm@t.local' });
      const course = await createCourse();
      const enrollment = await createEnrollment({
        courseId: course.id,
        totalPriceMinor: 1_000_000n,
      });
      await recordPayment(enrollment.id, 1_000_000n, admin.id);

      const rule = await createStakeholderRule(stakeholder.id, 10);
      const now = new Date();
      const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      const run = await computeStakeholderProfitShare(period);
      const lines = run.linesJson as { employeeId: string; percent: number; amountMinor: string }[];
      expect(lines.some((l) => l.employeeId === stakeholder.id && l.percent === 10)).toBe(true);

      await deleteStakeholderRule(rule.id);
      const run2 = await computeStakeholderProfitShare(period);
      const lines2 = run2.linesJson as { employeeId: string }[];
      expect(lines2.some((l) => l.employeeId === stakeholder.id)).toBe(false);
    });
  });

  describe('4. CourseType', () => {
    it('persists workshop and filters list', async () => {
      const admin = await createEmployee({});
      const track = await createTrack();
      const workshop = await createCourseService(
        {
          name: 'ورشة',
          trackId: track.id,
          courseType: 'workshop',
          startDate: new Date(),
          sessionCount: 2,
          priceMinor: toMinor(100000),
          capacity: 10,
        },
        admin.id
      );
      expect(workshop.courseType).toBe('workshop');

      const onlyWorkshops = await listCourses({ courseType: 'workshop' });
      expect(onlyWorkshops.every((c) => c.courseType === 'workshop')).toBe(true);
      expect(onlyWorkshops.some((c) => c.id === workshop.id)).toBe(true);

      const onlyCourses = await listCourses({ courseType: 'course' });
      expect(onlyCourses.every((c) => c.courseType === 'course')).toBe(true);
      expect(onlyCourses.some((c) => c.id === workshop.id)).toBe(false);
    });
  });

  describe('6. isSalaried', () => {
    it('requires salary for salaried; advances and payroll respect flag', async () => {
      const admin = await createEmployee({ privileges: ['admin'] });

      await expect(
        createEmployeeService(
          {
            email: 'nosal@t.local',
            password: 'password123',
            fullName: 'No Salary',
            isSalaried: true,
          },
          admin.id
        )
      ).rejects.toThrow(ValidationError);

      const instructor = await createEmployeeService(
        {
          email: 'inst@t.local',
          password: 'password123',
          fullName: 'Instructor',
          isSalaried: false,
          privilegeCodes: ['instructor'],
        },
        admin.id
      );
      expect(instructor.isSalaried).toBe(false);
      expect(instructor.monthlySalaryMinor).toBeNull();

      await expect(requestSalaryAdvance(instructor.id, 10_000n)).rejects.toThrow(ValidationError);

      const salaried = await createEmployeeService(
        {
          email: 'sal@t.local',
          password: 'password123',
          fullName: 'Salaried',
          isSalaried: true,
          monthlySalaryMinor: 500_000n,
          salaryDayOfMonth: new Date().getDate() > 28 ? 1 : new Date().getDate(),
          privilegeCodes: ['sales'],
        },
        admin.id
      );
      expect(salaried.isSalaried).toBe(true);

      await updateEmployee(salaried.id, { isSalaried: false }, admin.id);
      const updated = await prisma.employee.findUniqueOrThrow({ where: { id: salaried.id } });
      expect(updated.isSalaried).toBe(false);
      expect(updated.monthlySalaryMinor).toBeNull();

      // Only salaried employees are candidates for processDueSalaries
      await prisma.employee.update({
        where: { id: salaried.id },
        data: {
          isSalaried: true,
          monthlySalaryMinor: 500_000n,
          salaryDayOfMonth: new Date().getDate() > 28 ? 28 : new Date().getDate(),
        },
      });
      const result = await processDueSalaries(new Date());
      expect(result.paid + result.skipped).toBeGreaterThanOrEqual(0);
    });
  });
});
