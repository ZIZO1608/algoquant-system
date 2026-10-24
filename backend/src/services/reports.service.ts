import { prisma } from '../lib/prisma.js';

export async function getEmployeePerformanceReport() {
  const ratings = await prisma.employeeRating.findMany({
    where: { employee: { deletedAt: null } },
    include: { employee: { select: { id: true, fullName: true } } },
    orderBy: { score: 'desc' },
  });

  const taskStats = await prisma.task.groupBy({
    by: ['assignedEmployeeId', 'status'],
    where: { assignedEmployeeId: { not: null }, deletedAt: null },
    _count: true,
  });

  return { ratings, taskStats };
}

export async function getMarketingReport(from?: Date, to?: Date) {
  const where = {
    deletedAt: null,
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        }
      : {}),
  };

  const bySource = await prisma.lead.groupBy({
    by: ['sourceId'],
    where,
    _count: true,
  });

  const sources = await prisma.leadSource.findMany();
  const sourceMap = Object.fromEntries(sources.map((s) => [s.id, s]));

  const converted = await prisma.lead.count({
    where: { ...where, status: { in: ['enrolled', 'paid'] } },
  });
  const total = await prisma.lead.count({ where });

  return {
    bySource: bySource.map((b) => ({
      source: sourceMap[b.sourceId],
      count: b._count,
    })),
    conversionRate: total > 0 ? (converted / total) * 100 : 0,
    total,
    converted,
  };
}

export async function getLeadDemandReport() {
  const botSource = await prisma.leadSource.findUnique({ where: { code: 'bot' } });
  if (!botSource) return { breakdown: [] };

  const leads = await prisma.lead.findMany({
    where: { sourceId: botSource.id, deletedAt: null },
    select: { extraData: true },
  });

  const breakdown: Record<string, Record<string, number>> = {};

  for (const lead of leads) {
    const data = lead.extraData as Record<string, unknown>;
    const interest = (data.interest_area as string) ?? (data.main_goal as string) ?? 'unknown';
    const classification = (data.lead_classification as string) ?? 'unknown';
    const ready = String(data.ready_to_register ?? 'unknown');

    if (!breakdown[interest]) breakdown[interest] = {};
    const key = `${classification}|${ready}`;
    breakdown[interest][key] = (breakdown[interest][key] ?? 0) + 1;
  }

  return {
    breakdown: Object.entries(breakdown).map(([interestArea, counts]) => ({
      interestArea,
      counts: Object.entries(counts).map(([key, count]) => {
        const [leadClassification, readyToRegister] = key.split('|');
        return { leadClassification, readyToRegister, count };
      }),
    })),
    totalBotLeads: leads.length,
  };
}

export async function getCertificateReport() {
  const enrollments = await prisma.enrollment.groupBy({
    by: ['enrollmentStatus'],
    _count: true,
  });

  const certificates = await prisma.certificate.groupBy({
    by: ['status'],
    _count: true,
  });

  return { enrollments, certificates };
}

export async function getEvaluationReport() {
  const avg = await prisma.evaluation.aggregate({
    _avg: {
      courseScore: true,
      teacherScore: true,
      hallScore: true,
      benefitLevel: true,
    },
    _count: true,
  });

  const byCourse = await prisma.evaluation.findMany({
    include: {
      campaign: { include: { course: { select: { id: true, name: true } } } },
    },
  });

  type CourseAgg = {
    scores: number[];
    teacherScores: number[];
    hallScores: number[];
    benefitLevels: number[];
    name: string;
  };
  const courseMap: Record<string, CourseAgg> = {};
  for (const ev of byCourse) {
    const cid = ev.campaign.course.id;
    if (!courseMap[cid]) {
      courseMap[cid] = {
        scores: [],
        teacherScores: [],
        hallScores: [],
        benefitLevels: [],
        name: ev.campaign.course.name,
      };
    }
    courseMap[cid].scores.push(ev.courseScore);
    courseMap[cid].teacherScores.push(ev.teacherScore);
    courseMap[cid].hallScores.push(ev.hallScore);
    courseMap[cid].benefitLevels.push(ev.benefitLevel);
  }

  const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;

  return {
    overall: avg,
    byCourse: Object.entries(courseMap).map(([id, data]) => ({
      courseId: id,
      courseName: data.name,
      avgCourseScore: mean(data.scores),
      avgTeacherScore: mean(data.teacherScores),
      avgHallScore: mean(data.hallScores),
      avgBenefitLevel: mean(data.benefitLevels),
      count: data.scores.length,
    })),
  };
}

export async function getCoursePerformanceReport(filters?: { courseType?: 'course' | 'workshop' }) {
  const courses = await prisma.course.findMany({
    where: {
      deletedAt: null,
      ...(filters?.courseType ? { courseType: filters.courseType } : {}),
    },
    include: {
      _count: { select: { enrollments: true } },
    },
  });

  return courses.map((c) => ({
    id: c.id,
    name: c.name,
    status: c.status,
    courseType: c.courseType,
    capacity: c.capacity,
    enrolled: c._count.enrollments,
    fillRate: c.capacity > 0 ? (c._count.enrollments / c.capacity) * 100 : 0,
  }));
}

export async function getStuckLifecycleReport(stuckDays = 7) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - stuckDays);

  const stuckLeads = await prisma.lead.findMany({
    where: {
      deletedAt: null,
      updatedAt: { lt: cutoff },
      status: { in: ['new', 'contacted', 'interested'] },
    },
    select: { id: true, fullName: true, status: true, updatedAt: true },
  });

  const overdueCourses = await prisma.course.findMany({
    where: {
      status: 'enrollment_open',
      startDate: { lt: new Date() },
      deletedAt: null,
    },
    select: { id: true, name: true, startDate: true },
  });

  return { stuckLeads, overdueCourses };
}

export async function getAuditReport(filters: {
  employeeId?: string;
  entityType?: string;
  from?: Date;
  to?: Date;
  limit?: number;
}) {
  return prisma.auditLog.findMany({
    where: {
      ...(filters.employeeId ? { actorId: filters.employeeId } : {}),
      ...(filters.entityType ? { entityType: filters.entityType } : {}),
      ...(filters.from || filters.to
        ? {
            createdAt: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {}),
            },
          }
        : {}),
    },
    include: { actor: { select: { fullName: true } } },
    orderBy: { createdAt: 'desc' },
    take: filters.limit ?? 100,
  });
}
