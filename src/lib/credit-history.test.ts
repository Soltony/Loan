import { describe, it, expect } from 'vitest';
import { isLoanOverdue, repaymentBehaviorFor, repaymentHistory } from './credit-history';

const day = (s: string) => new Date(`${s}T10:00:00`);

describe('repaymentBehaviorFor', () => {
  it('compares calendar days, not times', () => {
    expect(repaymentBehaviorFor(day('2026-05-09'), day('2026-05-10'))).toBe('EARLY');
    expect(repaymentBehaviorFor(new Date('2026-05-10T23:00:00'), new Date('2026-05-10T00:00:00'))).toBe('ON_TIME');
    expect(repaymentBehaviorFor(day('2026-05-11'), day('2026-05-10'))).toBe('LATE');
  });
});

describe('isLoanOverdue', () => {
  const today = day('2026-06-15');

  it('is overdue once the final due date has passed, not on the due day', () => {
    expect(isLoanOverdue({ dueDate: day('2026-06-14') }, today)).toBe(true);
    expect(isLoanOverdue({ dueDate: day('2026-06-15') }, today)).toBe(false);
  });

  it('is overdue when an installment still owed fell due before today', () => {
    const loan = { dueDate: day('2026-08-01'), installments: [{ dueDate: day('2026-06-01'), amount: 1000, paidAmount: 200, status: 'Pending' }] };
    expect(isLoanOverdue(loan, today)).toBe(true);
  });

  it('ignores paid and merged installments in any case, and fully paid amounts', () => {
    const past = day('2026-06-01');
    const loan = {
      dueDate: day('2026-08-01'),
      installments: [
        { dueDate: past, amount: 1000, paidAmount: 0, status: 'Paid' },
        { dueDate: past, amount: 1000, paidAmount: 0, status: 'MERGED' },
        { dueDate: past, amount: 1000, paidAmount: 1000, status: 'Overdue' },
      ],
    };
    expect(isLoanOverdue(loan, today)).toBe(false);
  });
});

describe('repaymentHistory', () => {
  const loan = (behavior: string | null, disbursed: string, status = 'Paid') => ({
    repaymentStatus: status,
    repaymentBehavior: behavior,
    disbursedDate: day(disbursed),
  });

  it('counts early repayments as on time and leaves reversed loans out', () => {
    const h = repaymentHistory([
      loan('EARLY', '2026-01-01'),
      loan('ON_TIME', '2026-02-01'),
      loan('LATE', '2026-03-01'),
      loan('REVERSED', '2026-03-15', 'REVERSED'),
      loan(null, '2026-04-01', 'Unpaid'),
    ]);
    expect(h).toEqual({
      totalLoansCount: 4,
      loansOnTime: 2,
      loansLate: 1,
      loansEarly: 1,
      loansOnTimeTop5: 2,
      loansLateTop5: 1,
      loansEarlyTop5: 1,
    });
  });

  it('uses the five latest repaid loans for the Top5 fields', () => {
    const loans = [
      loan('LATE', '2025-01-01'),
      loan('LATE', '2025-02-01'),
      ...['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01'].map((d) => loan('EARLY', d)),
    ];
    const h = repaymentHistory(loans);
    expect(h.loansLate).toBe(2);
    expect(h.loansLateTop5).toBe(0);
    expect(h.loansOnTimeTop5).toBe(5);
  });
});
