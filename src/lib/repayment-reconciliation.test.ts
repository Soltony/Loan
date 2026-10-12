import { describe, expect, test } from 'vitest';
import { reconcileLoanRepayments, settledLoanTarget, type RepaymentRow } from './repayment-reconciliation';

/**
 * Regression guard: the Repayments tab's Principal Paid (77,746,197.97 booked)
 * and the dashboard's Principal Received (77,712,543.27) disagreed, because the
 * ledger posted principal beyond loan amounts and posted some principal as
 * duplicate charges. Both now report the same restated split. Cases below are
 * real Salary Advance loans.
 */
const row = (id: string, date: string, cash: number, booked: Partial<RepaymentRow['booked']>): RepaymentRow => ({
  id,
  date: new Date(date),
  cash,
  booked: { principal: 0, interest: 0, serviceFee: 0, penalty: 0, tax: 0, ...booked },
});

const terms = (received: Partial<RepaymentRow['booked']>) => ({
  received: { principal: 0, interest: 0, serviceFee: 0, penalty: 0, tax: 0, ...received },
});

const sum = (split: Map<string, any>, key: string) =>
  Math.round([...split.values()].reduce((s, a) => s + a[key], 0) * 100) / 100;

const cashKept = (rows: RepaymentRow[], split: Map<string, any>) =>
  rows.every((r) => {
    const a = split.get(r.id);
    const total = a.principal + a.interest + a.serviceFee + a.penalty + a.tax + a.unapplied;
    return Math.abs(total - r.cash) < 0.005;
  });

describe('reconcileLoanRepayments', () => {
  test('settled loan: cash beyond what its terms owed is overpaid, on the latest repayment', () => {
    // Tigist: the CBS auto-debit was not booked on the installment, so the app
    // billed the full principal again. The loan owed 10,014.00 (9.00 interest,
    // 5.00 penalty); 10,805.76 came in.
    const rows = [
      row('cbs', '2026-07-16T21:00:00Z', 800.76, { principal: 790.76, interest: 9, penalty: 1 }),
      row('app', '2026-07-20T21:00:00Z', 10005, { principal: 10000, penalty: 5 }),
    ];
    const split = reconcileLoanRepayments(terms({ principal: 10000, interest: 9, penalty: 5 }), rows);

    expect(sum(split, 'principal')).toBe(10000);
    expect(sum(split, 'penalty')).toBe(5);
    expect(sum(split, 'unapplied')).toBe(791.76);
    // The correction lands on the latest repayment.
    expect(split.get('app')!.unapplied).toBe(791.76);
    expect(cashKept(rows, split)).toBe(true);
  });

  test('settled loan: interest and penalty a posting put on principal are charges again, not overpaid', () => {
    // Repaid 28 days late, exactly the 10,037.00 owed; every posting went to principal.
    const rows = [
      row('a', '2026-04-15T21:00:00Z', 110, { principal: 110 }),
      row('b', '2026-05-05T21:00:00Z', 121, { principal: 121 }),
      row('c', '2026-05-11T21:00:00Z', 9806, { principal: 9806 }),
    ];
    const split = reconcileLoanRepayments(terms({ principal: 10000, interest: 9, penalty: 28 }), rows);

    expect(sum(split, 'principal')).toBe(10000);
    expect(sum(split, 'interest')).toBe(9);
    expect(sum(split, 'penalty')).toBe(28);
    expect(sum(split, 'unapplied')).toBe(0);
    expect(cashKept(rows, split)).toBe(true);
  });

  test('settled loan: a charge posted twice counts once, and the excess is overpaid', () => {
    // Mikiyas: the penalty was posted by the CBS collection and again by the app
    // payment; the last 132.00 came in after the loan was already settled.
    const rows = [
      row('a', '2026-05-21T21:00:00Z', 1, { interest: 1 }),
      row('b', '2026-06-18T21:00:00Z', 50, { principal: 18, interest: 9, penalty: 23 }),
      row('c', '2026-06-18T21:01:00Z', 90, { principal: 90 }),
      row('d', '2026-06-18T21:02:00Z', 1000, { principal: 976, penalty: 24 }),
      row('e', '2026-06-18T21:03:00Z', 5000, { principal: 5000 }),
      row('f', '2026-06-18T21:04:00Z', 3892, { principal: 3892 }),
      row('g', '2026-06-18T21:05:00Z', 132, { principal: 132 }),
    ];
    const split = reconcileLoanRepayments(terms({ principal: 10000, interest: 9, penalty: 24 }), rows);

    expect(sum(split, 'principal')).toBe(10000);
    expect(sum(split, 'interest')).toBe(9);
    expect(sum(split, 'penalty')).toBe(24);
    expect(sum(split, 'unapplied')).toBe(132);
    expect(cashKept(rows, split)).toBe(true);
  });

  test('settled loan: principal posted as a duplicate charge moves back to principal', () => {
    // Interest charged twice (18.00 for 9.00): the customer paid the right total.
    const rows = [
      row('a', '2026-04-20T21:00:00Z', 5000, { principal: 4991, interest: 9 }),
      row('b', '2026-04-30T21:00:00Z', 5039, { principal: 5000, interest: 9, penalty: 30 }),
    ];
    const split = reconcileLoanRepayments(terms({ principal: 10000, interest: 9, penalty: 30 }), rows);

    expect(sum(split, 'principal')).toBe(10000);
    expect(sum(split, 'interest')).toBe(9);
    expect(sum(split, 'penalty')).toBe(30);
    expect(sum(split, 'unapplied')).toBe(0);
    expect(cashKept(rows, split)).toBe(true);
  });

  test('open loan: each bucket is restated to what the loans report says it received', () => {
    // Paid early, before most of its penalty existed; the loans report applies
    // repayments penalty-first, so 28.00 of the principal posting is penalty.
    const rows = [
      row('a', '2026-06-24T21:00:00Z', 65.1, { principal: 54.1, interest: 9, penalty: 2 }),
      row('b', '2026-07-29T21:00:00Z', 0.3, { principal: 0.3 }),
    ];
    const split = reconcileLoanRepayments(terms({ principal: 26.4, interest: 9, penalty: 30 }), rows);

    expect(sum(split, 'principal')).toBe(26.4);
    expect(sum(split, 'interest')).toBe(9);
    expect(sum(split, 'penalty')).toBe(30);
    expect(sum(split, 'unapplied')).toBe(0);
    expect(cashKept(rows, split)).toBe(true);
  });

  test('cash the ledger never posted is unapplied once the loan is covered', () => {
    // A manual resolution on a settled loan: nothing was owed, so nothing was posted.
    const rows = [
      row('paid', '2026-05-21T09:00:00Z', 10031, { principal: 10000, interest: 9, penalty: 22 }),
      row('again', '2026-05-21T12:00:00Z', 10031, {}),
    ];
    const split = reconcileLoanRepayments(terms({ principal: 10000, interest: 9, penalty: 22 }), rows);

    expect(sum(split, 'principal')).toBe(10000);
    expect(split.get('again')!.unapplied).toBe(10031);
    expect(cashKept(rows, split)).toBe(true);
  });

  test('a refund of the overpayment is unapplied cash going back out, leaving the loan as its terms say', () => {
    // Tigist: the bank refunded the 791.76 overpaid; the repayment keeps its CBS amount.
    const rows = [
      row('cbs', '2026-07-16T21:00:00Z', 800.76, { principal: 790.76, interest: 9, penalty: 1 }),
      row('app', '2026-07-20T21:00:00Z', 10005, { principal: 10000, penalty: 5 }),
      row('refund', '2026-10-13T09:00:00Z', -791.76, {}),
    ];
    const split = reconcileLoanRepayments(terms({ principal: 10000, interest: 9, penalty: 5 }), rows);

    expect(sum(split, 'principal')).toBe(10000);
    expect(sum(split, 'unapplied')).toBe(0);
    expect(split.get('app')!.unapplied).toBe(791.76);
    expect(split.get('refund')).toEqual({ principal: 0, interest: 0, serviceFee: 0, penalty: 0, tax: 0, unapplied: -791.76 });
    expect(cashKept(rows, split)).toBe(true);
  });

  test('a refund beyond the overpayment waives charges, penalty first', () => {
    // Hamid: overpaid 860.66 on the loan terms; the bank refunded the 869.66 auto-debits.
    const rows = [
      row('a', '2026-06-20T21:00:00Z', 21.6, { penalty: 21.6 }),
      row('b', '2026-06-21T21:00:00Z', 400, { principal: 382.6, interest: 9, penalty: 8.4 }),
      row('c', '2026-06-21T21:01:00Z', 448.06, { principal: 448.06 }),
      row('d', '2026-06-28T21:00:00Z', 10030, { principal: 10000, penalty: 30 }),
      row('refund', '2026-10-13T09:00:00Z', -869.66, {}),
    ];
    const split = reconcileLoanRepayments(terms({ principal: 10000, interest: 9, penalty: 30 }), rows);

    expect(sum(split, 'principal')).toBe(10000);
    expect(sum(split, 'interest')).toBe(9);
    expect(sum(split, 'penalty')).toBe(21);
    expect(sum(split, 'unapplied')).toBe(0);
    expect(cashKept(rows, split)).toBe(true);
  });

  test('a whole payment refunded nets to nothing', () => {
    // Debora: 6,000.00 resolved onto a loan already repaid, then refunded.
    const rows = [
      row('paid', '2026-04-20T21:00:00Z', 10008.5, { principal: 10000, interest: 8.5 }),
      row('again', '2026-04-21T12:57:36Z', 6000, { principal: 6000 }),
      row('refund', '2026-10-13T09:00:00Z', -6000, {}),
    ];
    const split = reconcileLoanRepayments(terms({ principal: 10000, interest: 8.5 }), rows);

    expect(sum(split, 'principal')).toBe(10000);
    expect(split.get('again')!.unapplied).toBe(6000);
    expect(sum(split, 'unapplied')).toBe(0);
    expect(cashKept(rows, split)).toBe(true);
  });

  test('refunded auto-debits removed: the SuperApp repayment keeps its CBS amount and the shortfall is waived penalty', () => {
    // Hamid after the bank refunded his three auto-debits: 10,030.00 left against
    // 10,039.00 owed (interest 9.00, penalty 30.00), so 9.00 of the penalty is waived.
    const rows = [row('app', '2026-06-28T21:00:00Z', 10030, { principal: 10000, penalty: 30 })];
    const target = settledLoanTarget(10000, { principal: 9991, interest: 9, serviceFee: 0, penalty: 30, tax: 0 });
    const split = reconcileLoanRepayments({ received: target }, rows);

    expect(split.get('app')).toEqual({ principal: 10000, interest: 9, serviceFee: 0, penalty: 21, tax: 0, unapplied: 0 });
  });

  test('when the penalty is smaller than the shortfall, interest covers the rest', () => {
    // Tigist: 10,005.00 left against 10,014.00 owed, but her penalty is only 5.00.
    const rows = [row('app', '2026-07-20T21:00:00Z', 10005, { principal: 10000, penalty: 5 })];
    const target = settledLoanTarget(10000, { principal: 9991, interest: 9, serviceFee: 0, penalty: 5, tax: 0 });
    const split = reconcileLoanRepayments({ received: target }, rows);

    expect(split.get('app')).toEqual({ principal: 10000, interest: 5, serviceFee: 0, penalty: 0, tax: 0, unapplied: 0 });
  });

  test('leaves a correctly posted loan untouched', () => {
    const rows = [row('only', '2026-03-27T21:00:00Z', 10006.8, { principal: 10000, interest: 6.8 })];
    const split = reconcileLoanRepayments(terms({ principal: 10000, interest: 6.8 }), rows);
    expect(split.get('only')).toEqual({ principal: 10000, interest: 6.8, serviceFee: 0, penalty: 0, tax: 0, unapplied: 0 });
  });
});

describe('settledLoanTarget', () => {
  test('a loan closed short of its terms had charges waived, penalty first — not principal', () => {
    // Paid the 10,005.00 the app showed while its terms said 10,014.00.
    const target = settledLoanTarget(10000, { principal: 9991, interest: 9, serviceFee: 0, penalty: 5, tax: 0 });
    expect(target).toEqual({ principal: 10000, interest: 5, serviceFee: 0, penalty: 0, tax: 0 });
  });

  test('a loan paid in full on its terms is unchanged', () => {
    const paid = { principal: 10000, interest: 9, serviceFee: 0, penalty: 28, tax: 0 };
    expect(settledLoanTarget(10000, paid)).toEqual(paid);
  });
});
