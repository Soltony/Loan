import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  syncCustomerInfo: vi.fn(),
  loadCustomerInfoCopies: vi.fn(),
  refreshStatementFigures: vi.fn(),
  running: new Map<string, Promise<any>>(),
}));

vi.mock('./customer-info', () => ({
  syncCustomerInfo: mocks.syncCustomerInfo,
  loadCustomerInfoCopies: mocks.loadCustomerInfoCopies,
}));
vi.mock('./statement-figures', () => ({
  refreshStatementFigures: mocks.refreshStatementFigures,
  statementRefreshInProgress: (b: string, a: string) => mocks.running.get(`${b}|${a}`) ?? null,
  figuresForAccount: (payloads: any[], account: string) =>
    payloads.map((p) => p?.statementFigures).filter((f) => f?.accountNumber === account).pop() ?? null,
}));

import { borrowerDataInProgress, storedDataStamps, syncBorrowerData, within } from './borrower-data-sync';

/** A promise settled from outside. */
function later<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const saved = { ok: true, outcome: 'saved', provisionedDataId: 'p1' } as const;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.running.clear();
  (globalThis as any).__borrowerDataSync.running.clear();
});

describe('within', () => {
  it('gives the result when it comes in time, undefined when it does not', async () => {
    expect(await within(Promise.resolve('x'), 50)).toBe('x');
    const slow = later<string>();
    expect(await within(slow.promise, 10)).toBeUndefined();
    await expect(within(Promise.reject(new Error('down')), 50)).rejects.toThrow('down');
  });
});

describe('syncBorrowerData', () => {
  it('fetches customer info, then the statement figures; busy until both are done', async () => {
    const info = later<any>();
    const statement = later<any>();
    mocks.syncCustomerInfo.mockReturnValue(info.promise);
    mocks.refreshStatementFigures.mockReturnValue(statement.promise);

    const sync = syncBorrowerData('251900000001', '7000101737506', 'cfg');
    expect(borrowerDataInProgress('251900000001', '7000101737506')).not.toBeNull();
    expect(mocks.refreshStatementFigures).not.toHaveBeenCalled();

    info.resolve(saved);
    expect(await sync.customerInfo).toEqual(saved);
    expect(mocks.refreshStatementFigures).toHaveBeenCalledWith('251900000001', '7000101737506');
    expect(borrowerDataInProgress('251900000001', '7000101737506')).not.toBeNull();

    statement.resolve({ ok: true, outcome: 'saved', figures: {} });
    await sync.done;
    expect(await sync.statement).toEqual({ ok: true, outcome: 'saved', figures: {} });
    expect(borrowerDataInProgress('251900000001', '7000101737506')).toBeNull();
  });

  it('a second call while it runs joins the same fetch', async () => {
    const info = later<any>();
    mocks.syncCustomerInfo.mockReturnValue(info.promise);
    mocks.refreshStatementFigures.mockResolvedValue({ ok: true, outcome: 'fresh', figures: {} });

    const first = syncBorrowerData('251900000001', '7000101737506', 'cfg');
    const second = syncBorrowerData('251900000001', '7000101737506', 'cfg');
    expect(second).toBe(first);
    expect(mocks.syncCustomerInfo).toHaveBeenCalledTimes(1);
    info.resolve(saved);
    await first.done;

    // Once done, the next call fetches again.
    mocks.syncCustomerInfo.mockResolvedValue({ ok: true, outcome: 'reused', provisionedDataId: 'p1' });
    expect(syncBorrowerData('251900000001', '7000101737506', 'cfg')).not.toBe(first);
  });

  it('no statement after failed customer info, or when only the stored copy could be used', async () => {
    for (const result of [{ ok: false, status: 504, body: 'timeout' }, { ok: true, outcome: 'stale', provisionedDataId: 'p1' }]) {
      mocks.syncCustomerInfo.mockResolvedValue(result);
      const sync = syncBorrowerData('251900000001', '7000101737506', 'cfg');
      await sync.done;
      expect(await sync.statement).toBeNull();
    }
    expect(mocks.refreshStatementFigures).not.toHaveBeenCalled();
  });

  it('an error is logged, never left unhandled, and the fetch is no longer busy', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.syncCustomerInfo.mockRejectedValue(new Error('database down'));
    const sync = syncBorrowerData('251900000001', '7000101737506', 'cfg');
    await expect(sync.customerInfo).rejects.toThrow('database down'); // the route answers 500
    await sync.done;
    expect(await sync.statement).toBeNull();
    expect(error).toHaveBeenCalled();
    expect(borrowerDataInProgress('251900000001', '7000101737506')).toBeNull();
    error.mockRestore();
  });

  it('also counts a statement refresh started elsewhere as busy', () => {
    mocks.running.set('251900000001|7000101737506', new Promise(() => {}));
    expect(borrowerDataInProgress('251900000001', '7000101737506')).not.toBeNull();
    expect(borrowerDataInProgress('251900000001', '7000100112233')).toBeNull();
  });
});

describe('storedDataStamps', () => {
  it('gives when the customer info of this account was fetched and its figures computed', async () => {
    mocks.loadCustomerInfoCopies.mockResolvedValue([
      { id: 'a', data: JSON.stringify({ accountNumber: '7000100112233', fetchedAt: '2026-09-01T08:00:00.000Z' }) },
      {
        id: 'b',
        data: JSON.stringify({
          accountNumber: '7000101737506',
          fetchedAt: '2026-09-27T08:00:00.000Z',
          statementFigures: { accountNumber: '7000101737506', computedAt: '2026-09-27T08:01:00.000Z' },
        }),
      },
    ]);
    expect(await storedDataStamps('251900000001', '7000101737506')).toEqual({
      customerInfoFetchedAt: '2026-09-27T08:00:00.000Z',
      figuresComputedAt: '2026-09-27T08:01:00.000Z',
    });
    expect(await storedDataStamps('251900000001', '7000199999999')).toEqual({
      customerInfoFetchedAt: null,
      figuresComputedAt: null,
    });
  });
});
