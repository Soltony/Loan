import { describe, expect, test } from 'vitest';
import { calculateTotalRepayable, calculateTotalRepayableDetailed } from './loan-calculator';

/**
 * Regression guard for the dashboard vs. loan-history "Outstanding" mismatch.
 *
 * The Loan History / Loan Detail pages compute outstanding as
 *   calculateTotalRepayable(loan).total - loan.repaidAmount
 * while the dashboard product card now computes it as
 *   calculateTotalRepayableDetailed(loan).total - loan.repaidAmount
 * (previously it read the per-installment paidAmount counter, which lags
 * loan.repaidAmount and made the card show a stale, too-high outstanding).
 *
 * These two screens can only ever agree if the `.total` produced by both
 * functions is identical for an unpaid loan. This test pins that invariant.
 */

// Overdue single-installment loan matching the reported scenario:
//  principal 10,000, fixed daily fee 0.30 (=> 9.00 over 30 days), fixed daily
//  penalty 1.00 (=> 7.00 over 7 overdue days), no service fee, no tax.
const asOfDate = new Date('2026-07-05T00:00:00Z');

const product = {
  duration: 30,
  serviceFeeEnabled: false,
  serviceFee: { type: 'fixed', value: 0 },
  dailyFeeEnabled: true,
  dailyFee: { type: 'fixed', value: 0.3, calculationBase: 'principal' },
  penaltyRulesEnabled: true,
  penaltyRules: [{ type: 'fixed', value: 1, frequency: 'daily', fromDay: 1, toDay: '' }],
  penaltyPerInstallment: false,
} as any;

const makeLoan = (repaidAmount: number, payments: Array<{ amount: number; date: string }>) =>
  ({
    id: 'loan_test',
    loanAmount: 10000,
    disbursedDate: new Date('2026-05-29T00:00:00Z'),
    dueDate: new Date('2026-06-28T00:00:00Z'),
    repaymentStatus: 'Unpaid',
    repaidAmount,
    serviceFee: 0,
    penaltyAmount: 0,
    payments: payments.map((p, i) => ({ id: `p${i}`, amount: p.amount, date: new Date(p.date) })),
    installments: [
      {
        id: 'inst1',
        installmentNumber: 1,
        dueDate: new Date('2026-06-28T00:00:00Z'),
        amount: 10000,
        // Deliberately stale: only 1.50 recorded here even though 31.58 was repaid
        // at the loan level. This is exactly the drift the old dashboard read from.
        paidAmount: 1.5,
        status: 'Overdue',
        isActive: true,
      },
    ],
  }) as any;

describe('loan-calculator: dashboard vs history outstanding', () => {
  test('detailed and plain totals are identical for an unpaid loan', () => {
    const repaid = 31.58;
    const payments = [
      { amount: 1.0, date: '2026-06-15T00:00:00Z' },
      { amount: 30.17, date: '2026-06-30T00:00:00Z' },
      { amount: 0.41, date: '2026-07-02T00:00:00Z' },
    ];
    const loan = makeLoan(repaid, payments);

    const plain = calculateTotalRepayable(loan, product, [], asOfDate);
    const detailed = calculateTotalRepayableDetailed(loan, product, [], asOfDate);

    // principal 10000 + interest 9 + penalty 7 = 10016
    expect(plain.total).toBe(10016);
    // The invariant the fix relies on: both screens see the same total.
    expect(detailed.total).toBe(plain.total);
  });

  test('dashboard outstanding equals history outstanding (not the stale installment figure)', () => {
    const repaid = 31.58;
    const payments = [
      { amount: 1.0, date: '2026-06-15T00:00:00Z' },
      { amount: 30.17, date: '2026-06-30T00:00:00Z' },
      { amount: 0.41, date: '2026-07-02T00:00:00Z' },
    ];
    const loan = makeLoan(repaid, payments);

    const detailed = calculateTotalRepayableDetailed(loan, product, [], asOfDate);

    // History / Detail formula
    const historyOutstanding = Math.max(0, calculateTotalRepayable(loan, product, [], asOfDate).total - repaid);
    // New dashboard formula (product-card.tsx)
    const dashboardOutstanding = Math.max(0, detailed.total - repaid);

    expect(dashboardOutstanding).toBe(historyOutstanding);
    expect(dashboardOutstanding).toBeCloseTo(9984.42, 2);

    // The OLD dashboard read installment.amount - installment.paidAmount = 10000 - 1.50
    // = 9998.50, which is what produced the reported mismatch. Confirm the new
    // figure is NOT that stale number.
    const staleInstallmentPrincipal = 10000 - 1.5;
    expect(dashboardOutstanding).not.toBeCloseTo(staleInstallmentPrincipal, 2);

    // New "Principal" line: principal minus principal actually paid via the loan-level
    // waterfall. Penalty (7) + interest (9) are settled first, leaving 15.58 to principal.
    const principalRemaining = Math.max(0, detailed.principal - detailed.principalPaidFromInterestCalc);
    expect(principalRemaining).toBeCloseTo(9984.42, 2);
  });
});
