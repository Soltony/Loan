import { describe, it, expect, afterEach } from 'vitest';
import {
  figuresAreCurrent,
  figuresForAccount,
  statementFiguresEnabled,
  statementFiguresForScoring,
  type StatementFigures,
} from './statement-figures';

const figures = (accountNumber: string, computedAt: string, extra: Partial<StatementFigures> = {}) =>
  ({ accountNumber, computedAt, avgMonthlyDeposit: 100, derived: { monthsConsidered: [] }, ...extra }) as StatementFigures;

describe('figuresForAccount', () => {
  it('returns the newest figures of the requested account only', () => {
    const payloads = [
      { statementFigures: figures('7000101737506', '2026-09-20T08:00:00.000Z', { avgMonthlyDeposit: 1 }) },
      null,
      { statementFigures: figures('7000000000001', '2026-09-21T09:00:00.000Z', { avgMonthlyDeposit: 2 }) },
      { statementFigures: figures('7000101737506', '2026-09-21T08:00:00.000Z', { avgMonthlyDeposit: 3 }) },
      { detail: { AccountNumber: '7000101737506' } },
    ];
    expect(figuresForAccount(payloads, '7000101737506')?.avgMonthlyDeposit).toBe(3);
    expect(figuresForAccount(payloads, '7000100112233')).toBeNull();
  });
});

describe('statementFiguresForScoring', () => {
  it('uses the field names the scoring rules already use', () => {
    const out = statementFiguresForScoring(
      figures('7000101737506', '2026-09-21T08:00:00.000Z', { monthsAtEbirr: 4, withdrawalToDepositRatio: null })
    );
    expect(out).toMatchObject({ monthsAtEbirr: 4, avgMonthlyDeposit: 100, withdrawalToDepositRatio: null, accountMetricsRaw: { monthsConsidered: [] } });
  });
});

describe('statementFiguresForScoring and custom values', () => {
  const withCustom = { ...figures('7000101737506', '2026-09-21T08:00:00.000Z'), custom: { telebirrTransactions: 2.5 } } as StatementFigures;

  it('includes defined parameters only while their definitions are current', () => {
    expect(statementFiguresForScoring(withCustom).telebirrTransactions).toBe(2.5);
    expect(statementFiguresForScoring(withCustom, false)).not.toHaveProperty('telebirrTransactions');
    expect(statementFiguresForScoring(withCustom, false).avgMonthlyDeposit).toBe(100);
  });
});

describe('figuresAreCurrent', () => {
  const NOW = Date.parse('2026-11-06T12:00:00.000Z');
  const settings = { statementRefreshDays: 7, statementMonths: 6 };
  const six = ['202605', '202606', '202607', '202608', '202609', '202610'];
  const saved = (computedAt: string) =>
    ({ ...figures('7000101737506', computedAt), definitionsVersion: 'v1', derived: { monthsConsidered: six } }) as StatementFigures;

  it('keeps figures saved within the refresh interval with the same statement settings', () => {
    expect(figuresAreCurrent(saved('2026-11-01T12:00:00.000Z'), settings, 'v1', NOW)).toBe(true);
  });

  it('asks for a new fetch when nothing is saved, or the figures are past the refresh interval', () => {
    expect(figuresAreCurrent(null, settings, 'v1', NOW)).toBe(false);
    expect(figuresAreCurrent(saved('2026-10-30T12:00:00.000Z'), settings, 'v1', NOW)).toBe(false);
    expect(figuresAreCurrent(saved('not a date'), settings, 'v1', NOW)).toBe(false);
  });

  it('asks for a new fetch when the statement parameters or the number of months changed', () => {
    expect(figuresAreCurrent(saved('2026-11-05T12:00:00.000Z'), settings, 'v2', NOW)).toBe(false);
    expect(figuresAreCurrent(saved('2026-11-05T12:00:00.000Z'), { ...settings, statementMonths: 3 }, 'v1', NOW)).toBe(false);
  });
});

describe('statementFiguresEnabled', () => {
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; });

  it('follows STATEMENT_FIGURES_ENABLED, else is on only with the shared data API', () => {
    delete process.env.STATEMENT_FIGURES_ENABLED;
    delete process.env.CUSTOMER_DATA_API_URL;
    expect(statementFiguresEnabled()).toBe(false);
    process.env.CUSTOMER_DATA_API_URL = 'http://10.0.0.5:8000/nibtera-loan';
    expect(statementFiguresEnabled()).toBe(true);
    process.env.STATEMENT_FIGURES_ENABLED = 'false';
    expect(statementFiguresEnabled()).toBe(false);
    delete process.env.CUSTOMER_DATA_API_URL;
    process.env.STATEMENT_FIGURES_ENABLED = 'TRUE';
    expect(statementFiguresEnabled()).toBe(true);
  });
});
