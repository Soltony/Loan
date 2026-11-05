import { describe, expect, it } from 'vitest';
import { agingClass, agingClassFilter, agingSummary, borrowerAging, outstandingParts, type OverdueLoan } from './aging';

const loan = (overrides: Partial<OverdueLoan>): OverdueLoan => {
  const base = {
    loanId: 'l1',
    borrowerId: '251911000001',
    providerId: 'p1',
    provider: 'NIB BANK',
    daysOverdue: 10,
    principalOutstanding: 1000,
    interestOutstanding: 50,
    serviceFeeOutstanding: 20,
    penaltyOutstanding: 5,
    ...overrides,
  };
  return {
    ...base,
    classification: agingClass(base.daysOverdue),
    overdueAmount:
      base.principalOutstanding + base.interestOutstanding + base.serviceFeeOutstanding + base.penaltyOutstanding,
  };
};

describe('aging classes', () => {
  it('class by full days past due, at the NBE boundaries', () => {
    expect([0, 29, 30, 89, 90, 179, 180, 359, 360, 2000].map(agingClass)).toEqual([
      'Pass',
      'Pass',
      'Special Mention',
      'Special Mention',
      'Substandard',
      'Substandard',
      'Doubtful',
      'Doubtful',
      'Loss',
      'Loss',
    ]);
    expect(agingClass(-1)).toBe('Unknown');
    expect(agingClassFilter('Substandard')).toBe('Substandard');
    expect(agingClassFilter('substandard')).toBeNull();
  });
});

describe('outstandingParts', () => {
  const owed = { principal: 1000, interest: 100, serviceFee: 50, penalty: 30 };

  it('settles penalty, then service fee, then interest, then principal', () => {
    expect(outstandingParts(owed, 0)).toEqual({
      principalOutstanding: 1000,
      interestOutstanding: 100,
      serviceFeeOutstanding: 50,
      penaltyOutstanding: 30,
    });
    expect(outstandingParts(owed, 60)).toEqual({
      principalOutstanding: 1000,
      interestOutstanding: 100,
      serviceFeeOutstanding: 20,
      penaltyOutstanding: 0,
    });
    expect(outstandingParts(owed, 480)).toEqual({
      principalOutstanding: 700,
      interestOutstanding: 0,
      serviceFeeOutstanding: 0,
      penaltyOutstanding: 0,
    });
  });

  it('never goes negative on an overpayment', () => {
    expect(outstandingParts(owed, 5000)).toEqual({
      principalOutstanding: 0,
      interestOutstanding: 0,
      serviceFeeOutstanding: 0,
      penaltyOutstanding: 0,
    });
  });
});

describe('aging summaries', () => {
  const loans = [
    loan({ loanId: 'a', borrowerId: 'b1', daysOverdue: 10 }),
    loan({ loanId: 'b', borrowerId: 'b1', daysOverdue: 100, principalOutstanding: 500 }),
    loan({ loanId: 'c', borrowerId: 'b2', daysOverdue: 40 }),
    loan({ loanId: 'd', borrowerId: 'b2', providerId: 'p2', provider: 'Other', daysOverdue: 400 }),
  ];

  it('counts each loan in its own class, with its amount', () => {
    const summary = agingSummary(loans);
    expect(summary.buckets).toEqual({ Pass: 1, 'Special Mention': 1, Substandard: 1, Doubtful: 0, Loss: 1 });
    expect(summary.bucketAmounts.Substandard).toBe(575);
    expect(summary.totalOverdue).toBe(4);
    expect(summary.totalOverdueAmount).toBe(1075 * 3 + 575);
    // The same borrower at two providers counts at each.
    expect(summary.borrowerCount).toBe(3);
  });

  it('classes a borrower by their oldest overdue loan, per provider', () => {
    const rows = borrowerAging(loans);
    expect(rows).toHaveLength(3);
    const b1 = rows.find((r) => r.borrowerId === 'b1')!;
    expect(b1).toMatchObject({
      loanCount: 2,
      daysOverdue: 100,
      classification: 'Substandard',
      classificationAmount: 575,
      principalOutstanding: 1500,
      totalOutstanding: 1075 + 575,
    });
    const b2AtOther = rows.find((r) => r.borrowerId === 'b2' && r.providerId === 'p2')!;
    expect(b2AtOther).toMatchObject({ loanCount: 1, classification: 'Loss' });
  });
});
