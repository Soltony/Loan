import { describe, expect, test } from 'vitest';
import {
  buildOutstandingSeries,
  outstandingAt,
  type OutstandingLoanInput,
  type OutstandingRepaymentInput,
} from './collections-outstanding';

const loan = (
  id: string,
  provider: string,
  loanAmount: number,
  disbursedDate: string,
): OutstandingLoanInput => ({ id, provider, loanAmount, disbursedDate: new Date(disbursedDate) });

/** The reconciled repayments of a set of loans: `[loanId, entryId, date, principal]`. */
const repayments = (rows: [string, string, string, number][]): OutstandingRepaymentInput => {
  const byEntry = new Map<string, { principal: number }>();
  const entriesByLoan = new Map<string, { id: string; date: Date }[]>();
  for (const [loanId, entryId, date, principal] of rows) {
    byEntry.set(entryId, { principal });
    const entries = entriesByLoan.get(loanId) ?? [];
    entries.push({ id: entryId, date: new Date(date) });
    entriesByLoan.set(loanId, entries);
  }
  return { byEntry, entriesByLoan };
};

const at = (
  loans: OutstandingLoanInput[],
  reconciled: OutstandingRepaymentInput,
  provider: string,
  day: string,
) => outstandingAt(buildOutstandingSeries(loans, reconciled), provider, day);

describe('buildOutstandingSeries', () => {
  test('principal comes off the books as repayments land', () => {
    const loans = [loan('l1', 'Acme', 1000, '2026-03-01T09:00:00')];
    const paid = repayments([['l1', 'e1', '2026-03-03T10:00:00', 400]]);

    expect(at(loans, paid, 'Acme', '2026-03-01')).toEqual({ outstanding: 1000, loans: 1 });
    expect(at(loans, paid, 'Acme', '2026-03-03')).toEqual({ outstanding: 600, loans: 1 });
  });

  test('a day with no activity carries the last balance forward', () => {
    const loans = [loan('l1', 'Acme', 1000, '2026-03-01T09:00:00')];
    const paid = repayments([['l1', 'e1', '2026-03-03T10:00:00', 400]]);

    expect(at(loans, paid, 'Acme', '2026-03-02')).toEqual({ outstanding: 1000, loans: 1 });
    expect(at(loans, paid, 'Acme', '2026-12-31')).toEqual({ outstanding: 600, loans: 1 });
  });

  test('days before the first disbursement are zero, as is a provider with no loans', () => {
    const loans = [loan('l1', 'Acme', 1000, '2026-03-01T09:00:00')];
    const paid = repayments([]);

    expect(at(loans, paid, 'Acme', '2026-02-28')).toEqual({ outstanding: 0, loans: 0 });
    expect(at(loans, paid, 'Globex', '2026-03-01')).toEqual({ outstanding: 0, loans: 0 });
  });

  test('a loan drops out of the count once its principal is settled', () => {
    const loans = [
      loan('l1', 'Acme', 1000, '2026-03-01T09:00:00'),
      loan('l2', 'Acme', 500, '2026-03-02T09:00:00'),
    ];
    const paid = repayments([
      ['l1', 'e1', '2026-03-04T10:00:00', 1000],
      ['l2', 'e2', '2026-03-05T10:00:00', 200],
    ]);

    expect(at(loans, paid, 'Acme', '2026-03-02')).toEqual({ outstanding: 1500, loans: 2 });
    expect(at(loans, paid, 'Acme', '2026-03-04')).toEqual({ outstanding: 500, loans: 1 });
    expect(at(loans, paid, 'Acme', '2026-03-05')).toEqual({ outstanding: 300, loans: 1 });
  });

  test('a loan disbursed and settled the same day never reads as a negative balance', () => {
    const loans = [loan('l1', 'Acme', 1000, '2026-03-01T09:00:00')];
    const paid = repayments([['l1', 'e1', '2026-03-01T15:00:00', 1000]]);

    expect(at(loans, paid, 'Acme', '2026-03-01')).toEqual({ outstanding: 0, loans: 0 });
  });

  test('providers are kept apart', () => {
    const loans = [
      loan('l1', 'Acme', 1000, '2026-03-01T09:00:00'),
      loan('l2', 'Globex', 700, '2026-03-01T09:00:00'),
    ];
    const paid = repayments([['l1', 'e1', '2026-03-02T10:00:00', 400]]);

    expect(at(loans, paid, 'Acme', '2026-03-02')).toEqual({ outstanding: 600, loans: 1 });
    expect(at(loans, paid, 'Globex', '2026-03-02')).toEqual({ outstanding: 700, loans: 1 });
  });

  test('a repayment that paid only charges leaves the balance where it was', () => {
    const loans = [loan('l1', 'Acme', 1000, '2026-03-01T09:00:00')];
    const paid = repayments([['l1', 'e1', '2026-03-02T10:00:00', 0]]);

    expect(at(loans, paid, 'Acme', '2026-03-02')).toEqual({ outstanding: 1000, loans: 1 });
  });

  test('float drift does not leak into the reported balance', () => {
    const loans = [loan('l1', 'Acme', 1000.1, '2026-03-01T09:00:00')];
    const paid = repayments([
      ['l1', 'e1', '2026-03-02T10:00:00', 333.37],
      ['l1', 'e2', '2026-03-03T10:00:00', 333.37],
      ['l1', 'e3', '2026-03-04T10:00:00', 333.36],
    ]);

    expect(at(loans, paid, 'Acme', '2026-03-04')).toEqual({ outstanding: 0, loans: 0 });
  });

  test('the whole history counts, not just the window the report asked for', () => {
    // Repayments before the window have already taken their principal off, so a
    // mid-history day must not read as the full disbursed amount.
    const loans = [loan('l1', 'Acme', 1000, '2026-01-10T09:00:00')];
    const paid = repayments([
      ['l1', 'e1', '2026-02-10T10:00:00', 250],
      ['l1', 'e2', '2026-03-10T10:00:00', 250],
    ]);

    expect(at(loans, paid, 'Acme', '2026-03-10')).toEqual({ outstanding: 500, loans: 1 });
  });

  test('disbursed less principal received is what the balance reports', () => {
    const loans = [
      loan('l1', 'Acme', 1000, '2026-03-01T09:00:00'),
      loan('l2', 'Acme', 2500, '2026-03-02T09:00:00'),
      loan('l3', 'Acme', 400, '2026-03-05T09:00:00'),
    ];
    const rows: [string, string, string, number][] = [
      ['l1', 'e1', '2026-03-04T10:00:00', 600],
      ['l2', 'e2', '2026-03-06T10:00:00', 1200],
      ['l2', 'e3', '2026-03-09T10:00:00', 300],
    ];
    const disbursed = loans.reduce((sum, l) => sum + l.loanAmount, 0);
    const received = rows.reduce((sum, r) => sum + r[3], 0);

    expect(at(loans, repayments(rows), 'Acme', '2026-03-09').outstanding).toBe(disbursed - received);
  });
});
