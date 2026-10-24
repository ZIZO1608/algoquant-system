/** Helpers shared by the CRM list and lead detail pages. */
import { daysUntil } from './formatters';

const LEAD_OWNER_PRIVILEGES = ['admin', 'sales'];
const CLOSED_LEAD_STATUSES = ['lost', 'archived'];

/**
 * Employees who can own a lead (sales or admin). `keepId` (the current assignee) stays listed.
 * When the directory has no privilege data, everyone is returned.
 */
export function leadOwners(employees, keepId) {
  const list = Array.isArray(employees) ? employees : [];
  if (!list.some((emp) => Array.isArray(emp.privileges))) return list;
  const codes = (emp) => (emp.privileges || []).map((p) => p?.privilege?.code || p?.code || p);
  return list.filter(
    (emp) => emp.id === keepId || codes(emp).some((code) => LEAD_OWNER_PRIVILEGES.includes(code))
  );
}

export function isClosedLead(lead) {
  return CLOSED_LEAD_STATUSES.includes(lead?.status);
}

/** A scheduled follow-up that still matters (the lead isn't lost or archived). */
export function hasOpenFollowUp(lead) {
  return Boolean(lead?.nextFollowUpAt) && !isClosedLead(lead);
}

/** CSS modifier for a follow-up date: overdue, due today, or nothing for later dates. */
export function followUpTone(value) {
  const days = daysUntil(value);
  if (days === null) return '';
  if (days < 0) return 'is-overdue';
  if (days === 0) return 'is-today';
  return '';
}
