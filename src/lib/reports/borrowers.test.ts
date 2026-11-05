import { addHours, subDays } from 'date-fns';
import type { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  flattenProvisioned,
  LOAN_STATUS_FILTERS,
  loanReportStatus,
  loanStatusFilter,
  loanStatusWhere,
  provisionedAccount,
  provisionedName,
  type LoanStatusFilter,
} from './borrowers';

type Loan = { repaymentStatus: string; dueDate: Date };

/** Evaluates the subset of a Prisma LoanWhereInput loanStatusWhere produces, in memory. */
function matches(where: Prisma.LoanWhereInput, loan: Loan): boolean {
  if (where.NOT) {
    const not = Array.isArray(where.NOT) ? where.NOT : [where.NOT];
    if (not.some((w) => matches(w, loan))) return false;
  }
  if (typeof where.repaymentStatus === 'string' && loan.repaymentStatus !== where.repaymentStatus) return false;
  const due = where.dueDate as { lte?: Date; gt?: Date } | undefined;
  if (due?.lte && !(loan.dueDate <= due.lte)) return false;
  if (due?.gt && !(loan.dueDate > due.gt)) return false;
  return true;
}

const display: Record<LoanStatusFilter, string> = {
  current: 'Current',
  overdue: 'Overdue',
  defaulted: 'Defaulted',
  paid: 'Paid',
};

describe('loan status', () => {
  const now = new Date(2026, 9, 29, 15, 30);

  it('lists every loan under exactly the status its row shows', () => {
    const dueDates = [
      ...Array.from({ length: 140 }, (_, d) => subDays(now, d - 5)),
      // Around the day boundaries the filter and the row must agree too.
      ...[1, 60, 61].flatMap((d) => [-1, 0, 1].map((h) => addHours(subDays(now, d), h))),
    ];
    for (const repaymentStatus of ['Unpaid', 'Paid']) {
      for (const dueDate of dueDates) {
        const loan = { repaymentStatus, dueDate };
        const shown = loanReportStatus(loan, now).status;
        const listedUnder = LOAN_STATUS_FILTERS.filter((s) => matches(loanStatusWhere(s, now), loan));
        expect(listedUnder.map((s) => display[s]), `${repaymentStatus} due ${dueDate.toISOString()}`).toEqual([shown]);
      }
    }
  });

  it('counts days in arrears only for loans in arrears', () => {
    expect(loanReportStatus({ repaymentStatus: 'Unpaid', dueDate: subDays(now, 10) }, now)).toEqual({
      status: 'Overdue',
      daysInArrears: 10,
    });
    expect(loanReportStatus({ repaymentStatus: 'Unpaid', dueDate: subDays(now, 61) }, now).status).toBe('Defaulted');
    expect(loanReportStatus({ repaymentStatus: 'Paid', dueDate: subDays(now, 90) }, now)).toEqual({
      status: 'Paid',
      daysInArrears: 0,
    });
  });

  it('shows a loan with nothing left to pay as Paid', () => {
    expect(loanReportStatus({ repaymentStatus: 'Unpaid', dueDate: subDays(now, 30) }, now, 0).status).toBe('Paid');
    expect(loanReportStatus({ repaymentStatus: 'Unpaid', dueDate: subDays(now, 30) }, now, 5).status).toBe('Overdue');
  });

  it('accepts only known status filters', () => {
    expect(loanStatusFilter('overdue')).toBe('overdue');
    expect(loanStatusFilter('Overdue')).toBeNull();
    expect(loanStatusFilter(null)).toBeNull();
  });
});

describe('provisioned data', () => {
  it('reads the name and account under any of their usual keys, detail first', () => {
    const record = flattenProvisioned(
      JSON.stringify({ name: 'Top Level', detail: { CustomerName: 'ABEBE KEBEDE', AccountNumber: 1000123456 } }),
    );
    expect(provisionedName(record)).toBe('ABEBE KEBEDE');
    expect(provisionedAccount(record)).toBe('1000123456');
  });

  it('builds a name from its parts when there is no full name', () => {
    expect(provisionedName({ firstName: 'Abebe', fatherName: 'Kebede', grandfather_name: 'Tola' })).toBe(
      'Abebe Kebede Tola',
    );
  });

  it('survives payloads that are not JSON objects', () => {
    expect(flattenProvisioned('not json')).toEqual({});
    expect(flattenProvisioned('42')).toEqual({});
    expect(provisionedName({})).toBe('');
  });
});
