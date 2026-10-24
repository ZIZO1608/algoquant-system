/** Money helpers — all amounts in smallest currency unit (minor), never float. */

export function toMinor(amount: number | string | bigint): bigint {
  if (typeof amount === 'bigint') return amount;
  const n = typeof amount === 'string' ? parseInt(amount, 10) : amount;
  if (!Number.isInteger(n)) {
    throw new Error('Amount must be an integer in minor units');
  }
  return BigInt(n);
}

export function formatMinor(amount: bigint | number, currencyLabel = 'ل.س'): string {
  const n = typeof amount === 'bigint' ? amount : BigInt(amount);
  return `${n.toLocaleString('ar-SY')} ${currencyLabel}`;
}

export function serializeBigInt(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') return obj.toString();
  if (obj instanceof Date) return obj.toISOString();
  if (Array.isArray(obj)) return obj.map(serializeBigInt);
  if (typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      out[k] = serializeBigInt(v);
    }
    return out;
  }
  return obj;
}

export function addMinor(a: bigint, b: bigint): bigint {
  return a + b;
}

export function subtractMinor(a: bigint, b: bigint): bigint {
  return a - b;
}

export function paymentStatusFromAmounts(
  totalMinor: bigint,
  paidMinor: bigint
): 'unpaid' | 'partially_paid' | 'paid_in_full' {
  if (paidMinor <= 0n) return 'unpaid';
  if (paidMinor >= totalMinor) return 'paid_in_full';
  return 'partially_paid';
}
