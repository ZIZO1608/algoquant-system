/**
 * One definition of "still to do". A late task is open work, so it belongs here;
 * jobs that look for tasks *not yet* marked late filter on their own narrower list.
 */
export const OPEN_TASK_STATUSES = ['pending', 'in_progress', 'late'] as const;
