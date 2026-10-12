import { describe, expect, test } from 'vitest';
import {
  calculateInstallmentDueBreakdown,
  calculateOutstandingBreakdown,
  calculateTotalRepayable,
  calculateTotalRepayableDetailed,
} from './loan-calculator';

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

/**
 * Regression guard for the excess Salary Advance repayments.
 *
 * CBS auto-collections moved loan.repaidAmount but not installment.paidAmount.
 * The installment due read principal from that counter, so the borrower app (and
 * the payment callback) asked customers to pay the auto-debited amount again —
 * and, when interest had been paid in pieces, under-stated the balance so the
 * callback refused payments the gateway had already taken.
 */
describe('calculateInstallmentDueBreakdown: due matches what the loan owes', () => {
  // The Salary Advance product: 0.001%/day interest, 1.00/day penalty for 30 days.
  const salaryAdvance = {
    duration: 90,
    serviceFeeEnabled: null,
    serviceFee: { type: 'percentage', value: 0 },
    dailyFeeEnabled: true,
    dailyFee: { type: 'percentage', value: 0.001, calculationBase: 'principal' },
    penaltyRulesEnabled: true,
    penaltyRules: [{ fromDay: 1, toDay: 30, type: 'fixed', value: 1, frequency: 'daily' }],
    penaltyPerInstallment: true,
  } as any;

  const singleInstallmentLoan = (opts: {
    disbursed: string;
    due: string;
    payments: Array<{ amount: number; date: string }>;
    installmentPaid: number;
  }) => {
    const repaidAmount = opts.payments.reduce((s, p) => s + p.amount, 0);
    return {
      id: 'loan_sa',
      loanAmount: 10000,
      disbursedDate: new Date(opts.disbursed),
      dueDate: new Date(opts.due),
      repaymentStatus: 'Unpaid',
      repaidAmount,
      serviceFee: 0,
      penaltyAmount: 0,
      payments: opts.payments.map((p, i) => ({ id: `p${i}`, amount: p.amount, date: new Date(p.date) })),
      installments: [
        {
          id: 'inst1',
          installmentNumber: 1,
          dueDate: new Date(opts.due),
          amount: 10000,
          paidAmount: opts.installmentPaid,
          status: 'Pending',
          isActive: true,
        },
      ],
    } as any;
  };

  const owes = (loan: any, asOf: Date) =>
    Math.max(0, calculateTotalRepayableDetailed(loan, salaryAdvance, [], asOf).total - loan.repaidAmount);
  const dueOf = (loan: any, asOf: Date) =>
    calculateInstallmentDueBreakdown({
      loanDetails: loan,
      loanProduct: salaryAdvance,
      taxConfigs: [],
      activeInstallment: loan.installments[0],
      asOfDate: asOf,
    });

  test('does not re-bill a CBS auto-debit the installment counter never recorded', () => {
    // 800.76 auto-debited the day after the due date; installment.paidAmount stayed 0.
    const loan = singleInstallmentLoan({
      disbursed: '2026-04-17T08:47:09Z',
      due: '2026-07-16T08:47:09Z',
      payments: [{ amount: 800.76, date: '2026-07-16T21:00:00Z' }],
      installmentPaid: 0,
    });
    const asOf = new Date('2026-07-21T00:00:00Z');
    const due = dueOf(loan, asOf);

    expect(due.totalDue).toBeCloseTo(owes(loan, asOf), 2);
    // The counter-based figure was the full principal plus penalty (10,005.00).
    expect(due.totalDue).toBeLessThan(10000 - 700);
  });

  test('bills nothing once the loan is repaid, whatever the installment counter says', () => {
    const loan = singleInstallmentLoan({
      disbursed: '2026-02-26T11:08:30Z',
      due: '2026-05-27T11:08:30Z',
      payments: [
        { amount: 1, date: '2026-05-22T21:00:00Z' },
        { amount: 50, date: '2026-06-19T21:00:00Z' },
        { amount: 90, date: '2026-06-19T21:00:00Z' },
        { amount: 1000, date: '2026-06-19T21:00:00Z' },
        { amount: 5000, date: '2026-06-19T21:00:00Z' },
        { amount: 3892, date: '2026-06-19T21:00:00Z' },
      ],
      // The two CBS collections (50 + 90) never reached the counter.
      installmentPaid: 1 + 1000 + 5000 + 3892,
    });
    const asOf = new Date('2026-06-20T00:00:00Z');

    expect(owes(loan, asOf)).toBeCloseTo(0, 2);
    expect(dueOf(loan, asOf).totalDue).toBeCloseTo(0, 2);
  });

  test('does not under-state the balance after interest was paid in pieces', () => {
    const loan = singleInstallmentLoan({
      disbursed: '2026-05-16T08:55:24Z',
      due: '2026-08-14T08:55:24Z',
      payments: [
        { amount: 4000, date: '2026-06-21T21:00:00Z' },
        { amount: 3000, date: '2026-08-07T13:37:50Z' },
      ],
      installmentPaid: 6996.3,
    });
    const asOf = new Date('2026-08-14T00:00:00Z');

    // Principal from the counter (3,003.70) plus "interest fully paid" from the
    // loan-level waterfall came up short, and the callback refused the payment.
    expect(dueOf(loan, asOf).totalDue).toBeCloseTo(owes(loan, asOf), 2);
    expect(dueOf(loan, asOf).totalDue).toBeGreaterThan(3003.7);
  });

  test('an earlier installment of a multi-installment loan is still billed on its own', () => {
    const loan = {
      ...singleInstallmentLoan({
        disbursed: '2026-01-01T09:00:00Z',
        due: '2026-03-02T09:00:00Z',
        payments: [],
        installmentPaid: 0,
      }),
      installments: [
        { id: 'i1', installmentNumber: 1, dueDate: new Date('2026-01-31T09:00:00Z'), amount: 5000, paidAmount: 0, status: 'Pending', isActive: true },
        { id: 'i2', installmentNumber: 2, dueDate: new Date('2026-03-02T09:00:00Z'), amount: 5000, paidAmount: 0, status: 'Pending', isActive: false },
      ],
    } as any;
    const asOf = new Date('2026-01-20T00:00:00Z');
    const due = dueOf(loan, asOf);

    expect(due.principalRemaining).toBe(5000);
    expect(due.totalDue).toBeLessThan(owes(loan, asOf));
  });
});

describe('calculateOutstandingBreakdown', () => {
  const salaryAdvance = {
    duration: 90,
    serviceFeeEnabled: null,
    serviceFee: { type: 'percentage', value: 0 },
    dailyFeeEnabled: true,
    dailyFee: { type: 'percentage', value: 0.001, calculationBase: 'principal' },
    penaltyRulesEnabled: true,
    penaltyRules: [{ fromDay: 1, toDay: 30, type: 'fixed', value: 1, frequency: 'daily' }],
    penaltyPerInstallment: false,
  } as any;
  const loan = (repaidAmount: number) =>
    ({
      id: 'loan_o',
      loanAmount: 10000,
      disbursedDate: new Date('2026-01-28T09:00:00Z'),
      dueDate: new Date('2026-04-28T09:00:00Z'),
      repaymentStatus: 'Unpaid',
      repaidAmount,
      serviceFee: 0,
      penaltyAmount: 0,
      payments: repaidAmount > 0 ? [{ id: 'p0', amount: repaidAmount, date: new Date('2026-06-22T09:00:00Z') }] : [],
    }) as any;
  const asOf = new Date('2026-10-01T00:00:00Z');

  test('settles repayments penalty first and totals what is still owed', () => {
    // 10,000 principal + 9.00 interest + 30.00 penalty (capped), less 145.45 repaid.
    const owed = calculateOutstandingBreakdown(loan(145.45), salaryAdvance, [], asOf);
    expect(owed.total).toBeCloseTo(9893.55, 2);
    expect(owed.penalty).toBe(0);
    expect(owed.interest).toBe(0);
    expect(owed.principal).toBeCloseTo(9893.55, 2);
  });

  test('owes nothing once repaid in full, never a negative balance', () => {
    expect(calculateOutstandingBreakdown(loan(10039), salaryAdvance, [], asOf).total).toBe(0);
    expect(calculateOutstandingBreakdown(loan(10805.76), salaryAdvance, [], asOf).total).toBe(0);
  });
});
