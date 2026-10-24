import { describe, it, expect } from 'vitest';
import {
  toMinor,
  paymentStatusFromAmounts,
  addMinor,
  subtractMinor,
  formatMinor,
} from '../src/lib/money.js';

describe('money helpers', () => {
  it('converts to minor units as bigint', () => {
    expect(toMinor(1000)).toBe(1000n);
    expect(toMinor('500')).toBe(500n);
    expect(toMinor(500n)).toBe(500n);
  });

  it('rejects non-integer amounts', () => {
    expect(() => toMinor(10.5)).toThrow();
  });

  it('calculates payment status correctly', () => {
    expect(paymentStatusFromAmounts(1000n, 0n)).toBe('unpaid');
    expect(paymentStatusFromAmounts(1000n, 500n)).toBe('partially_paid');
    expect(paymentStatusFromAmounts(1000n, 1000n)).toBe('paid_in_full');
    expect(paymentStatusFromAmounts(1000n, 1500n)).toBe('paid_in_full');
  });

  it('adds and subtracts without float', () => {
    expect(addMinor(1000n, 500n)).toBe(1500n);
    expect(subtractMinor(1000n, 300n)).toBe(700n);
  });

  it('formats minor amounts', () => {
    const formatted = formatMinor(100000n);
    expect(formatted).toContain('ل.س');
    expect(formatted.length).toBeGreaterThan(3);
  });
});
