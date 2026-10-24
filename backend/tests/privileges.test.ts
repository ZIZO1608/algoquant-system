import { describe, it, expect } from 'vitest';
import { hasAnyPrivilege } from '../src/services/auth.service.js';
import {
  assertTransition,
  LEAD_TRANSITIONS,
  TASK_TRANSITIONS,
  ADVANCE_TRANSITIONS,
  PAYROLL_TRANSITIONS,
} from '../src/state-machines/transitions.js';
import { ConflictError } from '../src/lib/errors.js';

describe('privilege checks', () => {
  it('admin bypasses all privilege checks', () => {
    expect(hasAnyPrivilege(['admin'], ['sales'])).toBe(true);
    expect(hasAnyPrivilege(['admin'], ['accountant', 'instructor'])).toBe(true);
  });

  it('checks single privilege', () => {
    expect(hasAnyPrivilege(['sales'], ['sales'])).toBe(true);
    expect(hasAnyPrivilege(['sales'], ['media'])).toBe(false);
  });

  it('checks multi-privilege union', () => {
    expect(hasAnyPrivilege(['sales', 'media'], ['media'])).toBe(true);
    expect(hasAnyPrivilege(['sales', 'media'], ['operation'])).toBe(false);
    expect(hasAnyPrivilege(['sales', 'operation'], ['operation', 'logistics'])).toBe(true);
  });
});

describe('state machine transitions', () => {
  it('allows valid lead transitions', () => {
    expect(() => assertTransition(LEAD_TRANSITIONS, 'new', 'contacted', 'lead')).not.toThrow();
    expect(() => assertTransition(LEAD_TRANSITIONS, 'interested', 'paid', 'lead')).not.toThrow();
  });

  it('rejects invalid lead transitions', () => {
    expect(() => assertTransition(LEAD_TRANSITIONS, 'new', 'paid', 'lead')).toThrow(ConflictError);
    expect(() => assertTransition(LEAD_TRANSITIONS, 'new', 'enrolled', 'lead')).toThrow(ConflictError);
    expect(() => assertTransition(LEAD_TRANSITIONS, 'lost', 'contacted', 'lead')).toThrow(ConflictError);
  });

  it('allows task late transition from pending', () => {
    expect(() => assertTransition(TASK_TRANSITIONS, 'pending', 'late', 'task')).not.toThrow();
    expect(() => assertTransition(TASK_TRANSITIONS, 'late', 'done', 'task')).not.toThrow();
  });

  it('rejects done to pending', () => {
    expect(() => assertTransition(TASK_TRANSITIONS, 'done', 'pending', 'task')).toThrow(ConflictError);
  });

  it('allows salary advance requested to approved/rejected', () => {
    expect(() => assertTransition(ADVANCE_TRANSITIONS, 'requested', 'approved', 'salary_advance')).not.toThrow();
    expect(() => assertTransition(ADVANCE_TRANSITIONS, 'requested', 'rejected', 'salary_advance')).not.toThrow();
    expect(() => assertTransition(ADVANCE_TRANSITIONS, 'approved', 'deducted', 'salary_advance')).not.toThrow();
  });

  it('rejects invalid payroll transitions', () => {
    expect(() => assertTransition(PAYROLL_TRANSITIONS, 'failed', 'completed', 'payroll_run')).toThrow(
      ConflictError
    );
  });
});
