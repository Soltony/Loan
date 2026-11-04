import { describe, it, expect } from 'vitest';
import {
  computeMetrics,
  fieldFromName,
  linesMatchingDefinition,
  normalizeStatementLines,
  parseWords,
  statementDay,
  type StatementLine,
  type StatementParameterDefinition,
} from './statement-utils';

// Fetched on 10 Jan 2026: the figures cover the complete months Jul-Dec 2025 (184 days).
const END = '20260110';
const L = (bookDate: string, fields: Partial<StatementLine>): StatementLine => ({
  bookDate,
  reference: 'FT25336TVXSP',
  description: null,
  narrative: null,
  debit: null,
  credit: null,
  closingBalance: null,
  ...fields,
});

describe('normalizeStatementLines', () => {
  it('reads Description/ValueDate (bank middleware) and Description2/ValueDate2 (data API)', () => {
    const [middleware, dataApi] = normalizeStatementLines([
      { BookDate: '06 JAN 26', Description: 'Airtime topup', ValueDate: '06 JAN 26', Credit: '1,200.50' },
      { BookDate: '07 JAN 26', Description2: 'Airtime topup', ValueDate2: '07 JAN 26', Debit: 300 },
    ]);

    expect(middleware).toMatchObject({ description: 'Airtime topup', valueDate: '06 JAN 26', credit: 1200.5, debit: null });
    expect(dataApi).toMatchObject({ description: 'Airtime topup', valueDate: '07 JAN 26', debit: 300, credit: null });
  });

  it('returns an empty list for a missing statementDetails', () => {
    expect(normalizeStatementLines(undefined)).toEqual([]);
    expect(normalizeStatementLines(null)).toEqual([]);
  });

  it('accepts a single row sent as an object', () => {
    expect(normalizeStatementLines({ BookDate: '06 JAN 26', Credit: 50 })).toHaveLength(1);
  });

  it('keeps a zero balance as 0', () => {
    expect(normalizeStatementLines([{ BookDate: '06 JAN 26', ClosingBalance: 0 }])[0].closingBalance).toBe(0);
  });

  it('gives the same figures for both spellings', () => {
    const rows = [
      { BookDate: '06 JAN 26', Reference: 'FT1', Narrative: 'x', Credit: 500, ClosingBalance: 500 },
      { BookDate: '10 JAN 26', Reference: 'FT2', Narrative: 'y', Debit: 20, ClosingBalance: 480 },
    ];
    const withOld = rows.map((r, i) => ({ ...r, Description: i ? 'Airtime' : 'Deposit', ValueDate: r.BookDate }));
    const withNew = rows.map((r, i) => ({ ...r, Description2: i ? 'Airtime' : 'Deposit', ValueDate2: r.BookDate }));

    const a = computeMetrics(normalizeStatementLines(withOld), '20260210');
    const b = computeMetrics(normalizeStatementLines(withNew), '20260210');

    expect(b).toEqual(a);
    expect(a.avgMonthlyAirtimeCount).toBeCloseTo(1 / 6); // matched through the description
  });
});

describe('statementDay', () => {
  it('reads the statement formats', () => {
    expect(statementDay('30 APR 25')).toBe(statementDay('20250430'));
    expect(statementDay('1 jan 2026')).toBe(Date.UTC(2026, 0, 1) / 864e5);
    expect(statementDay('nonsense')).toBeNull();
  });
});

describe('computeMetrics', () => {
  it('uses the 6 complete months before the fetch month, and counts empty months as zero', () => {
    const m = computeMetrics(
      [
        L('30 JUN 25', { credit: 888888, description: 'Transfer' }), // before the window
        L('15 JUL 25', { credit: 600, description: 'Transfer' }),
        L('10 JAN 26', { credit: 999999, description: 'Transfer' }), // unfinished fetch month
      ],
      END
    );
    expect(m.derived.monthsConsidered).toEqual(['202507', '202508', '202509', '202510', '202511', '202512']);
    expect(m.derived.monthlyDepositTotals).toEqual([600, 0, 0, 0, 0, 0]);
  });

  it('averages monthly income without the best and worst month', () => {
    const months = ['15 JUL 25', '15 AUG 25', '15 SEP 25', '15 OCT 25', '15 NOV 25'];
    const lines = months.map((d, i) => L(d, { credit: i === 4 ? 50000 : 10000, description: 'Transfer' })); // Dec empty
    expect(computeMetrics(lines, END).avgMonthlyDeposit).toBe(10000);
  });

  it('does not count loans, interest or reversals as income; reversals reduce money out', () => {
    const m = computeMetrics(
      [
        L('01 JUL 25', { credit: 1000, description: 'Transfer', narrative: 'salary' }),
        L('02 JUL 25', { credit: 5000, description: 'AA Loan Disbursement', narrative: 'From Loan: 7000105491428' }),
        L('03 JUL 25', { credit: 1000, description: 'Nibtera super app Loan txn' }),
        L('04 JUL 25', { credit: 20, description: 'Credit Profit' }),
        L('05 JUL 25', { credit: 300, description: 'ATM Cash Withdrawal' }),
        L('06 JUL 25', { credit: 200, description: 'Miscellaneous Credit', narrative: 'IPS PAYABLE REFUND SR1567/25' }),
        L('07 JUL 25', { debit: 800, description: 'Cash Withdrawal(Local Ccy)' }),
      ],
      END
    );
    expect(m.derived.monthlyDepositTotals[0]).toBe(1000);
    expect(m.txCountRelevant).toBe(1);
    expect(m.derived.excludedFromDeposits).toEqual({ loanDisbursements: 6000, interest: 20, reversals: 500 });
    expect(m.withdrawalToDepositRatio).toBeCloseTo((800 - 500) / 1000);
  });

  it('counts wallet months from the description and narrative, never the reference', () => {
    const m = computeMetrics(
      [
        L('10 JUL 25', { debit: 100, description: 'Telebirr Debit' }),
        L('10 AUG 25', { debit: 100, description: 'Transfer', narrative: 'to tele birr' }),
        L('10 SEP 25', { debit: 100, description: 'Kaafi Transfer to Wallet Dr' }),
        L('10 OCT 25', { debit: 100, description: 'Transfer', reference: 'FTEBIRR123' }),
      ],
      END
    );
    expect(m.monthsAtEbirr).toBe(3);
  });

  it('counts airtime from money out only, and Telebirr is not airtime', () => {
    const m = computeMetrics(
      [
        L('10 JUL 25', { debit: 100, description: 'Ethio telecom Airtime Dr' }),
        L('11 JUL 25', { debit: 50, description: 'Transfer', narrative: 'topup' }),
        L('12 JUL 25', { debit: 5000, description: 'Telebirr Debit' }),
        L('13 JUL 25', { credit: 7000, description: 'Telebirr Credit' }),
      ],
      END
    );
    expect(m.derived.monthlyAirtimeCounts[0]).toBe(2);
    expect(m.avgMonthlyAirtimeValue).toBeCloseTo(150 / 6);
  });

  it('counts bill payments from money out, never from the reference', () => {
    const m = computeMetrics(
      [
        L('10 JUL 25', { debit: 300, description: 'ET telecom bill debit' }),
        L('11 JUL 25', { debit: 200, description: 'Internet Debit -', narrative: 'bills' }),
        L('12 JUL 25', { debit: 50, description: 'Transfer', narrative: 'coffee', reference: 'FT25336TVXSP' }),
        L('13 JUL 25', { credit: 900, description: 'Transfer', narrative: 'bill' }),
      ],
      END
    );
    expect(m.billPaymentsCount).toBe(2);
  });

  it('counts different payers by narrative, not by transaction reference', () => {
    const m = computeMetrics(
      [
        L('10 JUL 25', { credit: 100, description: 'Transfer', narrative: 'Abebe', reference: 'FT1' }),
        L('11 JUL 25', { credit: 100, description: 'Transfer', narrative: 'abebe ', reference: 'FT2' }),
        L('12 JUL 25', { credit: 100, description: 'Transfer', narrative: 'Kebede', reference: 'FT3' }),
      ],
      END
    );
    expect(m.avgUniqueDepositSources).toBeCloseTo(2 / 6);
  });

  it('averages the balance per day, including days at zero', () => {
    const m = computeMetrics(
      [
        L('30 JUN 25', { credit: 1000, closingBalance: 1000 }), // balance entering the window
        L('16 SEP 25', { debit: 1000, closingBalance: 0 }),
      ],
      END
    );
    // 1000 from 1 Jul to 15 Sep (77 days), then 0 until 31 Dec: 184 days in all
    expect(m.avgBalance).toBeCloseTo((77 * 1000) / 184);
  });

  it('uses the opening balance for an account without transactions', () => {
    expect(computeMetrics([], END, 2500).avgBalance).toBe(2500);
    expect(computeMetrics([], END).avgBalance).toBeNull();
  });
});

describe('defined statement parameters', () => {
  const def = (d: Partial<StatementParameterDefinition>): StatementParameterDefinition => ({
    field: 'telebirrTransactions',
    name: 'Telebirr transactions',
    direction: 'BOTH',
    matchWords: 'telebirr, tele birr',
    excludeWords: null,
    measure: 'COUNT_PER_MONTH',
    minAmount: null,
    ...d,
  });
  const lines = [
    L('10 JUL 25', { credit: 3000, description: 'Transfer', narrative: 'salary' }), // income, no match
    L('11 JUL 25', { debit: 500, description: 'Telebirr Debit' }),
    L('12 AUG 25', { credit: 1000, description: 'Telebirr Credit' }),
    L('13 AUG 25', { debit: 40, description: 'Transfer', narrative: 'to  TELE  BIRR wallet' }),
    L('14 SEP 25', { credit: 200, description: 'Miscellaneous Credit', narrative: 'TELEBIRR PAYABLE REFUND' }),
    L('10 JAN 26', { debit: 9999, description: 'Telebirr Debit' }), // unfinished fetch month: ignored
  ];
  const run = (d: Partial<StatementParameterDefinition>) => computeMetrics(lines, END, null, [def(d)]).custom.telebirrTransactions;

  it('counts matching lines per month over the 6 months, in any case and spacing', () => {
    expect(run({})).toBeCloseTo(4 / 6);
  });

  it('follows the direction, exclude words and minimum amount', () => {
    expect(run({ direction: 'OUT' })).toBeCloseTo(2 / 6);
    expect(run({ direction: 'IN', excludeWords: 'refund' })).toBeCloseTo(1 / 6);
    expect(run({ minAmount: 100 })).toBeCloseTo(3 / 6);
  });

  it('measures amounts, months with any, and share of income', () => {
    expect(run({ measure: 'AMOUNT_PER_MONTH', direction: 'OUT' })).toBeCloseTo(540 / 6);
    expect(run({ measure: 'MONTHS_WITH_ANY' })).toBe(3);
    // income is 3000 + 1000 (the refund is a reversal, not income); money out to telebirr is 540
    expect(run({ measure: 'SHARE_OF_INCOME', direction: 'OUT' })).toBeCloseTo((540 / 4000) * 100);
  });

  it('gives no share of income when there is no income', () => {
    const out = computeMetrics([L('11 JUL 25', { debit: 500, description: 'Telebirr Debit' })], END, null, [
      def({ measure: 'SHARE_OF_INCOME', direction: 'OUT' }),
    ]);
    expect(out.custom.telebirrTransactions).toBeNull();
  });

  it('leaves the built-in figures unchanged', () => {
    const { custom, ...withDefs } = computeMetrics(lines, END, null, [def({})]);
    const { custom: none, ...without } = computeMetrics(lines, END);
    expect(withDefs).toEqual(without);
    expect(none).toEqual({});
  });

  it('lists the matched lines of the months, newest first', () => {
    const matched = linesMatchingDefinition(lines, END, def({ direction: 'IN' }));
    expect(matched.map((l) => l.bookDate)).toEqual(['14 SEP 25', '12 AUG 25']);
  });

  it('tidies word lists and names', () => {
    expect(parseWords(' Telebirr,, tele   birr ,TELEBIRR')).toEqual(['telebirr', 'tele birr']);
    expect(fieldFromName('Salary (monthly) count')).toBe('salaryMonthlyCount');
  });
});

describe('configurable number of months', () => {
  const lines = ['15 JUL 25', '15 AUG 25', '15 SEP 25', '15 OCT 25', '15 NOV 25', '15 DEC 25'].map((d) =>
    L(d, { credit: 1000, description: 'Transfer' })
  );

  it('covers exactly the months asked for, ending with the month before the fetch', () => {
    expect(computeMetrics(lines, END, null, [], 3).derived.monthsConsidered).toEqual(['202510', '202511', '202512']);
    expect(computeMetrics(lines, END, null, [], 12).derived.monthsConsidered).toHaveLength(12);
    expect(computeMetrics(lines, END, null, [], 12).derived.monthsConsidered[0]).toBe('202501');
  });

  it('spreads the figures over the months asked for', () => {
    // 6 x 1000 income over 3 months counts only the 3 newest months
    expect(computeMetrics(lines, END, null, [], 3).derived.monthlyDepositTotals).toEqual([1000, 1000, 1000]);
    const airtime = [...lines, L('20 DEC 25', { debit: 60, description: 'Ethio telecom Airtime Dr' })];
    expect(computeMetrics(airtime, END, null, [], 3).avgMonthlyAirtimeValue).toBeCloseTo(60 / 3);
    expect(computeMetrics(airtime, END, null, [], 6).avgMonthlyAirtimeValue).toBeCloseTo(60 / 6);
  });

  it('measures defined parameters over the same months', () => {
    const def = { field: 'transfersIn', name: 'Transfers in', direction: 'IN' as const, matchWords: 'transfer', measure: 'MONTHS_WITH_ANY' as const };
    expect(computeMetrics(lines, END, null, [def], 3).custom.transfersIn).toBe(3);
    expect(computeMetrics(lines, END, null, [def], 6).custom.transfersIn).toBe(6);
  });
});
