import { describe, it, expect } from 'vitest';
import { DEFAULT_DATA_FETCH_SETTINGS, validateDataFetchSettings } from './data-fetch-settings';

const valid = { statementMonths: 6, statementRefreshDays: 7, statementMaxAgeDays: 31, customerInfoRefreshDays: 0 };

describe('validateDataFetchSettings', () => {
  it('accepts valid settings and numbers sent as text', () => {
    const r = validateDataFetchSettings({ ...valid, statementMonths: '3' });
    expect(r).toEqual({ ok: true, settings: { ...valid, statementMonths: 3 } });
  });

  it.each([
    [{ statementMonths: 0 }, 'statementMonths'],
    [{ statementMonths: 13 }, 'statementMonths'], // 12 months is the data API limit
    [{ statementMonths: 2.5 }, 'statementMonths'],
    [{ statementRefreshDays: 0 }, 'statementRefreshDays'],
    [{ customerInfoRefreshDays: -1 }, 'customerInfoRefreshDays'],
    [{ statementRefreshDays: 30, statementMaxAgeDays: 20 }, 'sooner than they are refreshed'],
  ])('rejects %j', (change, message) => {
    const r = validateDataFetchSettings({ ...valid, ...change });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain(message);
  });

  it('defaults keep 6 months, a weekly statement refresh and customer info fetched once', () => {
    expect(DEFAULT_DATA_FETCH_SETTINGS).toMatchObject({ statementMonths: 6, statementRefreshDays: 7, customerInfoRefreshDays: 0 });
  });
});
