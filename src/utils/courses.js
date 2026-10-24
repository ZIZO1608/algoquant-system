/** Helpers shared by the dashboard, the courses list and the course page. */
import { calcTaskProgress } from './formatters';

/**
 * Progress over every task of the course when the API sent counts (taskStats), otherwise over
 * the tasks this viewer can see. The task list is filtered by specialty, so it differs per role.
 */
export function courseProgress(course, tasks = []) {
  const stats = course?.taskStats;
  if (stats) return stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;
  return calcTaskProgress(tasks.filter((task) => task.courseId === course?.id));
}

/** Course-wide totals plus how many tasks this viewer cannot see. */
export function courseTaskTotals(course, visibleTasks = []) {
  const stats = course?.taskStats;
  const visibleDone = visibleTasks.filter((task) => task.status === 'done').length;
  if (!stats) return { done: visibleDone, total: visibleTasks.length, hidden: 0 };
  return {
    done: stats.done,
    total: stats.total,
    hidden: Math.max(0, stats.total - visibleTasks.length),
  };
}
