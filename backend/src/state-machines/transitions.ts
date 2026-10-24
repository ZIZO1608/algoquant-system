import {
  LeadStatus,
  CourseStatus,
  EnrollmentStatus,
  PaymentStatus,
  TaskStatus,
  WithdrawalStatus,
  RefundStatus,
  AdvanceStatus,
  PayrollRunStatus,
  ProfitShareRunStatus,
} from '@prisma/client';
import { ConflictError } from '../lib/errors.js';

type TransitionMap<T extends string> = Record<T, T[]>;

export const LEAD_TRANSITIONS: TransitionMap<LeadStatus> = {
  new: ['contacted', 'lost', 'archived'],
  contacted: ['interested', 'paid', 'lost', 'archived'],
  interested: ['paid', 'lost', 'archived'],
  paid: ['enrolled', 'lost', 'archived'],
  enrolled: ['archived'],
  archived: [],
  lost: [],
};

export const COURSE_TRANSITIONS: TransitionMap<CourseStatus> = {
  draft: ['planned', 'archived'],
  planned: ['enrollment_open', 'archived'],
  enrollment_open: ['active', 'archived'],
  active: ['completed', 'archived'],
  completed: ['archived'],
  archived: [],
};

/**
 * enrolled → attending happens on the first present/late attendance, attending → completed when
 * the course completes, completed → certified when a certificate is issued. Staff can also move
 * a student by hand: complete a workshop with no attendance, drop (reason required), undo a
 * completion (completed → attending) or reinstate a dropped student (dropped → enrolled).
 */
export const ENROLLMENT_TRANSITIONS: TransitionMap<EnrollmentStatus> = {
  enrolled: ['attending', 'completed', 'dropped'],
  attending: ['completed', 'dropped'],
  completed: ['certified', 'attending'],
  certified: [],
  dropped: ['enrolled'],
};

export const PAYMENT_TRANSITIONS: TransitionMap<PaymentStatus> = {
  unpaid: ['partially_paid', 'paid_in_full'],
  partially_paid: ['paid_in_full', 'partially_paid', 'unpaid'],
  paid_in_full: ['partially_paid', 'unpaid'],
};

export const TASK_TRANSITIONS: TransitionMap<TaskStatus> = {
  pending: ['in_progress', 'done', 'late'],
  in_progress: ['done', 'late'],
  late: ['done'],
  done: [],
};

export const WITHDRAWAL_TRANSITIONS: TransitionMap<WithdrawalStatus> = {
  requested: ['under_review', 'rejected'],
  under_review: ['approved', 'rejected'],
  approved: ['paid', 'cancelled'],
  paid: [],
  rejected: [],
  cancelled: [],
};

export const REFUND_TRANSITIONS: TransitionMap<RefundStatus> = {
  initiated: ['under_review', 'rejected'],
  under_review: ['approved', 'rejected'],
  approved: ['processed'],
  processed: [],
  rejected: [],
};

export const ADVANCE_TRANSITIONS: TransitionMap<AdvanceStatus> = {
  requested: ['approved', 'rejected'],
  approved: ['deducted'],
  rejected: [],
  deducted: [],
};

export const PAYROLL_TRANSITIONS: TransitionMap<PayrollRunStatus> = {
  pending: ['completed', 'failed'],
  completed: [],
  failed: [],
};

export const PROFIT_SHARE_TRANSITIONS: TransitionMap<ProfitShareRunStatus> = {
  pending: ['approved', 'rejected'],
  approved: [],
  rejected: [],
};

export function assertTransition<T extends string>(
  map: TransitionMap<T>,
  from: T,
  to: T,
  entityLabel: string
): void {
  const allowed = map[from] ?? [];
  if (!allowed.includes(to)) {
    throw new ConflictError(
      `Invalid ${entityLabel} transition: ${from} → ${to}`,
      { from, to, allowed }
    );
  }
}

export function getAllowedTransitions<T extends string>(
  map: TransitionMap<T>,
  current: T
): T[] {
  return map[current] ?? [];
}
