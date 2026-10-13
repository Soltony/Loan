import { describe, expect, test } from 'vitest';
import {
  DEFAULT_ALLOCATION_ORDER,
  DEFAULT_POLICY,
  activeReferenceKey,
  normalizeReference,
  parseAllocationOrder,
  repaymentStatusLabel,
  retiredReferenceKey,
  toPolicy,
  validateRepaymentEntry,
  type ManualRepaymentPolicy,
} from './manual-repayment';

const TODAY = new Date(2026, 9, 13, 23, 59, 59, 999); // 13 Oct 2026, end of day
const DISBURSED = new Date(2026, 5, 1);

const context = (overrides?: Partial<Parameters<typeof validateRepaymentEntry>[1]>) => ({
  policy: DEFAULT_POLICY,
  outstanding: 5_000,
  loanRepaymentStatus: 'Unpaid',
  loanDisbursedDate: DISBURSED,
  today: TODAY,
  ...overrides,
});

const entry = (overrides?: Partial<Parameters<typeof validateRepaymentEntry>[0]>) => ({
  amount: 1_000,
  paymentSource: 'CASH',
  referenceNumber: 'RCPT-001',
  paymentDate: new Date(2026, 9, 12),
  hasAttachment: false,
  ...overrides,
});

describe('validateRepaymentEntry', () => {
  test('accepts a repayment within the outstanding balance', () => {
    const { errors, warnings } = validateRepaymentEntry(entry(), context());
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });

  test('refuses a payment date in the future (BRD 3.5)', () => {
    const { errors } = validateRepaymentEntry(
      entry({ paymentDate: new Date(2026, 9, 14) }),
      context(),
    );
    expect(errors).toContain('The payment date cannot be in the future.');
  });

  test('allows a payment dated today', () => {
    const { errors } = validateRepaymentEntry(entry({ paymentDate: new Date(2026, 9, 13) }), context());
    expect(errors).toEqual([]);
  });

  test('refuses a payment dated before the loan was disbursed', () => {
    const { errors } = validateRepaymentEntry(
      entry({ paymentDate: new Date(2026, 4, 31) }),
      context(),
    );
    expect(errors).toContain('The payment date cannot be before the loan was disbursed.');
  });

  test('refuses a repayment against a closed loan (BRD 3.5)', () => {
    const { errors } = validateRepaymentEntry(entry(), context({ loanRepaymentStatus: 'Paid' }));
    expect(errors[0]).toMatch(/already closed/);
  });

  test('refuses a repayment when nothing is outstanding', () => {
    const { errors } = validateRepaymentEntry(entry(), context({ outstanding: 0 }));
    expect(errors).toContain('This loan has no outstanding balance.');
  });

  test('rejects an overpayment under the REJECT policy', () => {
    const { errors, warnings } = validateRepaymentEntry(entry({ amount: 5_001 }), context());
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/more than the outstanding balance/);
    expect(warnings).toEqual([]);
  });

  test('warns instead of rejecting under the WARN policy', () => {
    const policy: ManualRepaymentPolicy = { ...DEFAULT_POLICY, overpaymentPolicy: 'WARN' };
    const { errors, warnings } = validateRepaymentEntry(entry({ amount: 5_001 }), context({ policy }));
    expect(errors).toEqual([]);
    expect(warnings[0]).toMatch(/left unapplied/);
  });

  test('tolerates a rounding-sized excess over the balance', () => {
    const { errors } = validateRepaymentEntry(entry({ amount: 5_000.005 }), context());
    expect(errors).toEqual([]);
  });

  test("enforces the maker's approval limit (BRD 3.6)", () => {
    const policy: ManualRepaymentPolicy = { ...DEFAULT_POLICY, makerApprovalLimit: 500 };
    const { errors } = validateRepaymentEntry(entry({ amount: 501 }), context({ policy }));
    expect(errors.some((e) => e.includes('approval limit'))).toBe(true);
  });

  test('requires a receipt when policy says so', () => {
    const policy: ManualRepaymentPolicy = { ...DEFAULT_POLICY, requireAttachment: true };
    expect(validateRepaymentEntry(entry(), context({ policy })).errors).toContain(
      'A receipt or bank slip must be attached.',
    );
    expect(
      validateRepaymentEntry(entry({ hasAttachment: true }), context({ policy })).errors,
    ).toEqual([]);
  });

  test('requires an amount, a source and a reference', () => {
    const { errors } = validateRepaymentEntry(
      entry({ amount: 0, paymentSource: 'MOBILE_MONEY', referenceNumber: '   ' }),
      context(),
    );
    expect(errors).toContain('Repayment amount must be greater than zero.');
    expect(errors).toContain('Select a valid payment source.');
    expect(errors).toContain('A transaction / reference number is required.');
  });
});

describe('reference numbers', () => {
  test('normalises case and spacing so "ft 123" collides with "FT123"', () => {
    expect(normalizeReference(' ft 123 ')).toBe('FT123');
    expect(activeReferenceKey('CASH', ' rcpt-1 ')).toBe(activeReferenceKey('CASH', 'RCPT-1'));
  });

  test('the same reference under two sources does not collide (BRD 3.5)', () => {
    expect(activeReferenceKey('CASH', 'R-1')).not.toBe(activeReferenceKey('CHEQUE', 'R-1'));
  });

  test('a retired key frees the reference for re-entry after a rejection', () => {
    const active = activeReferenceKey('CASH', 'R-1');
    const retired = retiredReferenceKey('CASH', 'R-1', 'cmr123');
    expect(retired).not.toBe(active);
    expect(retired.startsWith(active)).toBe(true);
    // Two rejected rows carrying the same reference still do not collide.
    expect(retired).not.toBe(retiredReferenceKey('CASH', 'R-1', 'cmr456'));
  });
});

describe('parseAllocationOrder', () => {
  test('accepts a full permutation', () => {
    const order = ['PRINCIPAL', 'INTEREST', 'PENALTY', 'SERVICE_FEE', 'TAX'];
    expect(parseAllocationOrder(JSON.stringify(order))).toEqual(order);
  });

  test('falls back to the default when a bucket is missing — a partial order would drop money', () => {
    expect(parseAllocationOrder('["PENALTY","INTEREST","PRINCIPAL"]')).toEqual(DEFAULT_ALLOCATION_ORDER);
  });

  test('falls back on duplicates, unknown buckets and malformed JSON', () => {
    expect(parseAllocationOrder('["PENALTY","PENALTY","INTEREST","TAX","PRINCIPAL"]')).toEqual(
      DEFAULT_ALLOCATION_ORDER,
    );
    expect(parseAllocationOrder('["PENALTY","INTEREST","TAX","PRINCIPAL","LATE_FEE"]')).toEqual(
      DEFAULT_ALLOCATION_ORDER,
    );
    expect(parseAllocationOrder('not json')).toEqual(DEFAULT_ALLOCATION_ORDER);
    expect(parseAllocationOrder(null)).toEqual(DEFAULT_ALLOCATION_ORDER);
  });
});

describe('toPolicy', () => {
  test('an absent config row yields the defaults', () => {
    expect(toPolicy(null)).toEqual(DEFAULT_POLICY);
  });

  test('a zero or negative approval limit means "no limit", not "nothing may be paid"', () => {
    const row = {
      allocationOrder: JSON.stringify(DEFAULT_ALLOCATION_ORDER),
      makerApprovalLimit: 0,
      overpaymentPolicy: 'WARN',
      requireAttachment: true,
      notifyCustomer: false,
    };
    expect(toPolicy(row).makerApprovalLimit).toBeNull();
    expect(toPolicy(row).overpaymentPolicy).toBe('WARN');
    expect(toPolicy(row).requireAttachment).toBe(true);
    expect(toPolicy(row).notifyCustomer).toBe(false);
  });

  test('an unrecognised overpayment policy falls back to the safe one', () => {
    const row = {
      allocationOrder: JSON.stringify(DEFAULT_ALLOCATION_ORDER),
      makerApprovalLimit: null,
      overpaymentPolicy: 'ALLOW_EVERYTHING',
      requireAttachment: false,
      notifyCustomer: true,
    };
    expect(toPolicy(row).overpaymentPolicy).toBe('REJECT');
  });
});

describe('repaymentStatusLabel', () => {
  test('reports the status the BRD asks for (BRD 3.7)', () => {
    expect(repaymentStatusLabel(0, true)).toBe('Fully Paid');
    expect(repaymentStatusLabel(0.005, true)).toBe('Fully Paid');
    expect(repaymentStatusLabel(250, true)).toBe('Partially Paid');
    expect(repaymentStatusLabel(250, false)).toBe('Unpaid');
  });
});
