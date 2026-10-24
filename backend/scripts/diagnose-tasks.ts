import { PrismaClient } from '@prisma/client';
import { COURSE_LIFECYCLE_STAGES } from '../src/config/lifecycle.js';

const prisma = new PrismaClient();

async function main() {
  const tasks = await prisma.task.findMany({
    where: { deletedAt: null },
    select: { id: true, title: true, phaseKey: true, courseId: true, course: { select: { name: true } } },
    take: 30,
  });
  console.log('tasks sample:', tasks);

  const lifecycleKeys = COURSE_LIFECYCLE_STAGES.map((s) => s.key);
  console.log('lifecycle phase keys:', lifecycleKeys);

  const taskPhaseKeys = [...new Set(tasks.map((t) => t.phaseKey))];
  console.log('task phase keys in DB:', taskPhaseKeys);

  const unmatched = taskPhaseKeys.filter((k) => !lifecycleKeys.includes(k as (typeof lifecycleKeys)[number]));
  console.log('unmatched phase keys:', unmatched);

  const byCourse = await prisma.task.groupBy({
    by: ['courseId'],
    where: { deletedAt: null },
    _count: true,
  });
  for (const row of byCourse) {
    const course = await prisma.course.findUnique({ where: { id: row.courseId }, select: { name: true } });
    console.log(`course ${course?.name}: ${row._count} tasks`);
  }
}

main().finally(() => prisma.$disconnect());
