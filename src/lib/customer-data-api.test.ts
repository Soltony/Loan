import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  buildCustomerInfoPayload,
  fetchAccountStatement,
  isFetchedWithin,
  parseStoredPayload,
  storedAccountNumber,
} from './customer-data-api';

describe('fetchAccountStatement', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
    vi.unstubAllGlobals();
  });

  /** The JSON body the next call sends. */
  async function sentBody() {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await fetchAccountStatement('7000101737506', '20260301', '20260831');
    return JSON.parse((fetchMock.mock.calls[0] as any)[1].body);
  }

  it('asks the data API for no balances by default', async () => {
    process.env.CUSTOMER_DATA_API_URL = 'http://127.0.0.1:8000/nibtera-loan';
    delete process.env.STATEMENT_OPENING_BALANCE;
    expect(await sentBody()).toEqual({
      accountNumber: '7000101737506', startDate: '20260301', endDate: '20260831', withOpeningBalance: false,
    });
  });

  it('asks for balances when STATEMENT_OPENING_BALANCE=true', async () => {
    process.env.CUSTOMER_DATA_API_URL = 'http://127.0.0.1:8000/nibtera-loan';
    process.env.STATEMENT_OPENING_BALANCE = 'true';
    expect(await sentBody()).not.toHaveProperty('withOpeningBalance');
  });

  it('never sends the option to the bank middleware', async () => {
    delete process.env.CUSTOMER_DATA_API_URL;
    process.env.EXTERNAL_STATEMENT_URL = 'http://middleware.test/statement';
    expect(await sentBody()).not.toHaveProperty('withOpeningBalance');
  });
});

const fresh = (detail: Record<string, any> | null, accountNumber = '7000101737506') => ({
  source: 'external-customer-info',
  accountNumber,
  fetchedAt: '2026-09-21T08:00:00.000Z',
  odsFetchedAt: '2026-09-21T06:30:00',
  detail,
});

describe('buildCustomerInfoPayload', () => {
  it('keeps the TIN and bank fields the fresh response lacks for the same account', () => {
    const stored = {
      source: 'external-customer-info',
      accountNumber: '7000101737506',
      fetchedAt: '2026-01-06T10:00:00.000Z',
      detail: { AccountNumber: '7000101737506', Branchcode: 409, NetMonthlyIncome: 5000, Occupation: 'Teacher' },
      TINNo: '0012345678',
    };

    const out = buildCustomerInfoPayload([stored], fresh({ AccountNumber: '7000101737506', NetMonthlyIncome: 8000, Occupation: null }));

    expect(out.TINNo).toBe('0012345678');
    expect(out.detail.Branchcode).toBe(409); // not returned by the data API: kept
    expect(out.detail.NetMonthlyIncome).toBe(8000); // fresh wins
    expect(out.detail.Occupation).toBeNull(); // a fresh null also wins
    expect(out.fetchedAt).toBe('2026-09-21T08:00:00.000Z');
    expect(out.odsFetchedAt).toBe('2026-09-21T06:30:00');
  });

  it('drops the old account bank fields but keeps the TIN when the borrower switches account', () => {
    const stored = {
      accountNumber: '7000000000001',
      fetchedAt: '2026-01-06T10:00:00.000Z',
      detail: { AccountNumber: '7000000000001', Branchcode: 101, EmployersName: 'Old employer' },
      TINNo: '0012345678',
    };

    const out = buildCustomerInfoPayload([stored], fresh({ AccountNumber: '7000101737506', CustomerName: 'ALEMU' }));

    expect(out.accountNumber).toBe('7000101737506');
    expect(out.TINNo).toBe('0012345678');
    expect(out.detail).toEqual({ AccountNumber: '7000101737506', CustomerName: 'ALEMU' });
  });

  it('keeps the TIN from a TIN-only row and lets later copies win', () => {
    const tinOnly = { source: 'tin-collection', TINNo: '111', savedAt: '2026-02-01T00:00:00.000Z' };
    const newer = { accountNumber: '7000101737506', detail: { AccountNumber: '7000101737506' }, TINNo: '222' };

    const out = buildCustomerInfoPayload([tinOnly, null, newer], fresh({ AccountNumber: '7000101737506' }));

    expect(out.TINNo).toBe('222');
    expect(out.savedAt).toBe('2026-02-01T00:00:00.000Z');
    expect(out.source).toBe('external-customer-info');
  });
});

describe('buildCustomerInfoPayload and statement figures', () => {
  const figures = (accountNumber: string) => ({ accountNumber, computedAt: '2026-09-21T07:00:00.000Z', avgMonthlyDeposit: 1000 });

  it('keeps the figures of the same account', () => {
    const stored = { accountNumber: '7000101737506', detail: {}, statementFigures: figures('7000101737506') };
    const out = buildCustomerInfoPayload([stored], fresh({ AccountNumber: '7000101737506' }));
    expect(out.statementFigures).toEqual(figures('7000101737506'));
  });

  it('drops the figures of another account', () => {
    const stored = { accountNumber: '7000000000001', detail: {}, statementFigures: figures('7000000000001'), TINNo: '1' };
    const out = buildCustomerInfoPayload([stored], fresh({ AccountNumber: '7000101737506' }));
    expect(out.statementFigures).toBeUndefined();
    expect(out.TINNo).toBe('1');
  });
});

describe('stored payload helpers', () => {
  it('finds the account number in either place', () => {
    expect(storedAccountNumber({ accountNumber: 7000101737506 })).toBe('7000101737506');
    expect(storedAccountNumber({ detail: { AccountNumber: ' 7000101737506 ' } })).toBe('7000101737506');
    expect(storedAccountNumber({ source: 'tin-collection', TINNo: '1' })).toBeNull();
    expect(storedAccountNumber(null)).toBeNull();
  });

  it('parses only JSON objects', () => {
    expect(parseStoredPayload('{"a":1}')).toEqual({ a: 1 });
    expect(parseStoredPayload('[1]')).toBeNull();
    expect(parseStoredPayload('not json')).toBeNull();
    expect(parseStoredPayload(null)).toBeNull();
  });

  it('treats missing or old fetch times as stale', () => {
    const now = Date.parse('2026-09-21T12:00:00.000Z');
    const day = 24 * 60 * 60 * 1000;
    expect(isFetchedWithin({ fetchedAt: '2026-09-21T01:00:00.000Z' }, day, now)).toBe(true);
    expect(isFetchedWithin({ fetchedAt: '2026-09-20T11:00:00.000Z' }, day, now)).toBe(false);
    expect(isFetchedWithin({}, day, now)).toBe(false);
    expect(isFetchedWithin({ fetchedAt: 'garbage' }, day, now)).toBe(false);
  });
});
