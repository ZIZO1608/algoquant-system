/** Mirrors backend SPECIALTY_TO_PRIVILEGE in course.service.ts */
export const SPECIALTY_TO_PRIVILEGE = {
  sales: ['sales'],
  media: ['media'],
  operation: ['operation'],
  logistics: ['operation'],
  accountant: ['accountant'],
};

export function employeeMatchesSpecialty(employee, specialty) {
  if (!employee?.privileges?.length) return false;
  const codes = SPECIALTY_TO_PRIVILEGE[specialty] || [];
  return employee.privileges.some(
    (ep) => ep.privilege?.code === 'admin' || codes.includes(ep.privilege?.code)
  );
}

export function filterEmployeesForSpecialty(employees, specialty) {
  return employees.filter(
    (emp) => emp.isActive !== false && employeeMatchesSpecialty(emp, specialty)
  );
}

export function countOpenTasksForEmployee(tasks, employeeId) {
  return tasks.filter(
    (t) =>
      t.assignedEmployee?.id === employeeId &&
      ['pending', 'in_progress', 'late'].includes(t.status)
  ).length;
}

export function sortEmployeesByLoad(employees, tasks) {
  return [...employees].sort(
    (a, b) => countOpenTasksForEmployee(tasks, a.id) - countOpenTasksForEmployee(tasks, b.id)
  );
}

export function getRecommendedEmployee(employees, specialty, tasks) {
  const eligible = filterEmployeesForSpecialty(employees, specialty);
  if (!eligible.length) return null;
  return sortEmployeesByLoad(eligible, tasks)[0];
}

const OPEN_STATUSES = new Set(['pending', 'in_progress', 'late']);

export function getDueUrgencyClass(dueAt, status) {
  if (status === 'late') return 'urgency-late';
  if (!dueAt || status === 'done') return '';
  const due = new Date(dueAt);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const dueDay = new Date(due);
  dueDay.setHours(0, 0, 0, 0);
  const diffDays = Math.round((dueDay - now) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'urgency-overdue';
  if (diffDays === 0) return 'urgency-today';
  if (diffDays === 1) return 'urgency-tomorrow';
  return '';
}

export function isOpenTask(task) {
  return OPEN_STATUSES.has(task.status);
}

export function employeeInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2);
  return `${parts[0][0]}${parts[parts.length - 1][0]}`;
}
