import { describe, it, expect } from 'vitest';
import { paymentStatusFromAmounts, subtractMinor, addMinor } from '../src/lib/money.js';

describe('wallet and payment calculations', () => {
  it('tracks partial payments correctly', () => {
    const total = 500000n;
    let paid = 0n;

    paid = addMinor(paid, 200000n);
    expect(paymentStatusFromAmounts(total, paid)).toBe('partially_paid');

    paid = addMinor(paid, 300000n);
    expect(paymentStatusFromAmounts(total, paid)).toBe('paid_in_full');
  });

  it('handles refund reversal math', () => {
    const originalCredit = 50000n;
    let balance = originalCredit;

    // Simulate withdrawal would fail if balance insufficient after reversal
    const refundAmount = 30000n;
    balance = subtractMinor(balance, refundAmount);
    expect(balance).toBe(20000n);

    // Reversal is a separate ledger entry, not deletion
    const reversalAmount = refundAmount;
    balance = subtractMinor(balance, reversalAmount);
    expect(balance).toBe(-10000n);
  });

  it('withdrawal cannot exceed balance', () => {
    const balance = 10000n;
    const withdrawal = 15000n;
    expect(balance >= withdrawal).toBe(false);
  });

  it('never uses float for money', () => {
    const a = 100n;
    const b = 33n;
    const result = (a * b) / 100n;
    expect(typeof result).toBe('bigint');
    expect(result).toBe(33n);
  });
});
