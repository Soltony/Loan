import { describe, it, expect } from 'vitest';
import { BUILT_IN_FIGURES, describeFigures } from './statement-figures-lookup';
import { definitionsVersion } from './statement-parameters';
import type { StatementFigures } from './statement-figures';
import type { StatementParameterDefinition } from './statement-utils';

const NOW = Date.parse('2026-09-24T12:00:00Z');
const telebirr: StatementParameterDefinition = {
  field: 'telebirr', name: 'Telebirr', direction: 'OUT', matchWords: 'telebirr', measure: 'COUNT_PER_MONTH',
};

function figures(overrides: Partial<StatementFigures> = {}): StatementFigures {
  return {
    accountNumber: '7000101737506',
    periodStart: '20260301',
    periodEnd: '20260831',
    transactionCount: 43,
    computedAt: '2026-09-22T12:00:00Z',
    odsFetchedAt: null,
    definitionsVersion: definitionsVersion([telebirr]),
    monthsAtEbirr: 4,
    txCountRelevant: 7,
    billPaymentsCount: 2,
    avgMonthlyDeposit: 10759.31,
    avgUniqueDepositSources: 1.75,
    avgMonthlyAirtimeCount: 0.5,
    avgMonthlyAirtimeValue: 120,
    withdrawalToDepositRatio: 1.06,
    avgBalance: null,
    custom: { telebirr: 3.5 },
    derived: {
      monthsConsidered: ['202603', '202604'],
      monthlyDepositTotals: [9000, 12000],
      monthlyAirtimeCounts: [1, 0],
      monthlyAirtimeValues: [240, 0],
      excludedFromDeposits: { loanDisbursements: 5000, interest: 12.5, reversals: 0 },
    },
    ...overrides,
  } as StatementFigures;
}

const active = [{ phone: '251911223344', isActiveAccount: true }];

describe('describeFigures', () => {
  it('shows all nine figures in order, with a missing balance as null', () => {
    const view = describeFigures(figures(), active, { maxAgeDays: 31, definitions: [telebirr], now: NOW });
    expect(view.figures.map((f) => f.field)).toEqual(BUILT_IN_FIGURES.map((f) => f.field));
    expect(view.figures).toHaveLength(9);
    expect(view.figures.find((f) => f.field === 'avgMonthlyDeposit')!.value).toBe(10759.31);
    expect(view.figures.find((f) => f.field === 'avgBalance')!.value).toBeNull();
  });

  it('is used for scoring when recent and the active account', () => {
    const view = describeFigures(figures(), active, { maxAgeDays: 31, definitions: [telebirr], now: NOW });
    expect(view.usedForScoring).toBe(true);
    expect(view.notUsedBecause).toBeNull();
    expect(view.ageDays).toBeCloseTo(2);
  });

  it('says why figures are not used: too old, or not the active account', () => {
    const old = describeFigures(figures({ computedAt: '2026-08-01T12:00:00Z' }), active, { maxAgeDays: 31, definitions: [], now: NOW });
    expect(old.usedForScoring).toBe(false);
    expect(old.notUsedBecause).toBe('older than 31 days');

    const inactive = describeFigures(figures(), [{ phone: '251911223344', isActiveAccount: false }], { maxAgeDays: 31, definitions: [], now: NOW });
    expect(inactive.usedForScoring).toBe(false);
    expect(inactive.notUsedBecause).toBe('not the active account of any phone');
  });

  it('marks statement parameters whose definition changed since the figures were saved', () => {
    const same = describeFigures(figures(), active, { maxAgeDays: 31, definitions: [telebirr], now: NOW });
    expect(same.custom).toEqual([{ field: 'telebirr', name: 'Telebirr', value: 3.5, current: true }]);

    const changed = { ...telebirr, matchWords: 'telebirr, tele birr' };
    const later = describeFigures(figures(), active, { maxAgeDays: 31, definitions: [changed], now: NOW });
    expect(later.custom[0].current).toBe(false);
  });

  it('lists the months behind the averages and what was not counted as income', () => {
    const view = describeFigures(figures(), active, { maxAgeDays: 31, definitions: [telebirr], now: NOW });
    expect(view.months).toEqual([
      { month: '202603', income: 9000, airtimeCount: 1, airtimeValue: 240 },
      { month: '202604', income: 12000, airtimeCount: 0, airtimeValue: 0 },
    ]);
    expect(view.excludedFromIncome).toEqual({ loanDisbursements: 5000, interest: 12.5, reversals: 0 });
  });
});
