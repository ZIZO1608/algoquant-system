import { prisma } from '../lib/prisma.js';

const ON_TIME_DELTA = 5;
const LATE_DELTA = -10;

export async function applyRatingForTask(
  employeeId: string,
  taskId: string,
  isLate: boolean
) {
  const delta = isLate ? LATE_DELTA : ON_TIME_DELTA;
  const reason = isLate ? 'late' : 'on_time';

  await prisma.$transaction(async (tx) => {
    await tx.employeeRatingEvent.create({
      data: { employeeId, taskId, delta, reason },
    });

    await tx.employeeRating.upsert({
      where: { employeeId },
      create: { employeeId, score: delta },
      update: {
        score: { increment: delta },
        lastComputedAt: new Date(),
      },
    });
  });
}

export async function getEmployeeRating(employeeId: string) {
  return prisma.employeeRating.findUnique({
    where: { employeeId },
    include: {
      employee: { select: { id: true, fullName: true } },
    },
  });
}
