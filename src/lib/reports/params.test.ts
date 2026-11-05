import { endOfDay, endOfMonth } from 'date-fns';
import { describe, expect, it } from 'vitest';
import {
  allRows,
  chunked,
  compareBy,
  inPeriod,
  localDay,
  pageOf,
  reportPaging,
  reportPeriod,
  reportProvider,
  reportSort,
  reportTzOffset,
  timeframePeriod,
} from './params';

const params = (query: string) => new URLSearchParams(query);
const now = new Date(2026, 9, 29, 15, 30);

describe('reportPeriod', () => {
  it('uses the instants the screen sends as they are', () => {
    const from = '2026-05-01T21:00:00.000Z';
    const to = '2026-05-31T20:59:59.999Z';
    expect(reportPeriod(params(`from=${from}&to=${to}&timeframe=custom`), now)).toEqual({
      gte: new Date(from),
      lte: new Date(to),
    });
  });

  it('reads a bare day as the whole day, and allows an open end', () => {
    expect(reportPeriod(params('from=2026-05-01'), now)).toEqual({ gte: new Date(2026, 4, 1) });
    expect(reportPeriod(params('to=2026-05-31'), now)).toEqual({ lte: endOfDay(new Date(2026, 4, 31)) });
  });

  it('falls back to the named timeframe, including a specific month', () => {
    expect(reportPeriod(params('timeframe=monthly'), now)).toEqual({
      gte: new Date(2026, 9, 1),
      lte: endOfMonth(new Date(2026, 9, 1)),
    });
    expect(reportPeriod(params('timeframe=month&month=2026-05'), now)).toEqual({
      gte: new Date(2026, 4, 1),
      lte: endOfMonth(new Date(2026, 4, 1)),
    });
    expect(reportPeriod(params('timeframe=month&month=bad'), now)).toEqual({});
    expect(reportPeriod(params('timeframe=overall'), now)).toEqual({});
    expect(reportPeriod(params(''), now)).toEqual({});
    expect(reportPeriod(params('from=garbage&timeframe=daily'), now)).toEqual(timeframePeriod('daily', now));
  });

  it('tests instants against open and closed bounds', () => {
    const may = { gte: new Date(2026, 4, 1), lte: new Date(2026, 4, 31, 23, 59) };
    expect(inPeriod(may, new Date(2026, 4, 15))).toBe(true);
    expect(inPeriod(may, new Date(2026, 5, 1))).toBe(false);
    expect(inPeriod({}, new Date(1990, 0, 1))).toBe(true);
  });
});

describe('the user and the request', () => {
  it('locks a provider-bound user to their provider', () => {
    expect(reportProvider({ loanProviderId: 'p1' }, 'p2')).toBe('p1');
    expect(reportProvider({ loanProviderId: null }, 'p2')).toBe('p2');
    expect(reportProvider({ loanProviderId: null }, 'all')).toBeNull();
    expect(reportProvider({}, null)).toBeNull();
    expect(reportProvider({}, 'none')).toBe('none');
  });

  it('takes the user timezone offset when it is sane', () => {
    expect(reportTzOffset(params('tzOffset=180'), now)).toBe(180);
    expect(reportTzOffset(params('tzOffset=-300'), now)).toBe(-300);
    expect(reportTzOffset(params('tzOffset=9999'), now)).toBe(-now.getTimezoneOffset());
    expect(reportTzOffset(params('tzOffset=abc'), now)).toBe(-now.getTimezoneOffset());
    expect(reportTzOffset(params('tzOffset='), now)).toBe(-now.getTimezoneOffset());
  });

  it('names the calendar day of an instant in the user timezone', () => {
    // 21:30 UTC on 1 May is already 2 May in Addis Ababa (UTC+3).
    expect(localDay(new Date('2026-05-01T21:30:00Z'), 180)).toBe('2026-05-02');
    expect(localDay(new Date('2026-05-01T21:30:00Z'), 0)).toBe('2026-05-01');
    expect(localDay(new Date('2026-05-02T02:00:00Z'), -300)).toBe('2026-05-01');
  });

  it('caps paging and defaults what is missing', () => {
    expect(reportPaging(params(''))).toEqual({ page: 1, pageSize: 50 });
    expect(reportPaging(params('page=3&pageSize=100'))).toEqual({ page: 3, pageSize: 100 });
    expect(reportPaging(params('page=0&pageSize=5000'))).toEqual({ page: 1, pageSize: 200 });
    expect(reportPaging(params('page=-4&pageSize=x'))).toEqual({ page: 1, pageSize: 50 });
  });

  it('sorts only by the columns a report allows', () => {
    const columns = ['date', 'total'] as const;
    const fallback = { by: 'date' as const, dir: 'desc' as const };
    expect(reportSort(params('sortBy=total&sortDir=asc'), columns, fallback)).toEqual({ by: 'total', dir: 'asc' });
    expect(reportSort(params('sortBy=total'), columns, fallback)).toEqual({ by: 'total', dir: 'desc' });
    expect(reportSort(params('sortBy=id; DROP TABLE Loan'), columns, fallback)).toBe(fallback);
  });
});

describe('lists', () => {
  it('chunks long IN lists', () => {
    expect(chunked([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunked([], 2)).toEqual([]);
  });

  it('pages a list held in full', () => {
    const page = pageOf([1, 2, 3, 4, 5], { page: 2, pageSize: 2 });
    expect(page).toEqual({ data: [3, 4], total: 5, page: 2, pageSize: 2, totalPages: 3 });
  });

  it('compares numbers by size and text A–Z, missing values last', () => {
    const rows = [{ v: 3 }, { v: null }, { v: 10 }, { v: 1 }];
    expect([...rows].sort(compareBy((r) => r.v, 'asc')).map((r) => r.v)).toEqual([1, 3, 10, null]);
    expect([...rows].sort(compareBy((r) => r.v, 'desc')).map((r) => r.v)).toEqual([10, 3, 1, null]);
    expect(['b', 'a', 'C'].sort(compareBy((s) => s, 'asc'))).toEqual(['a', 'b', 'C']);
  });

  it('reads every page of a report', async () => {
    const all = Array.from({ length: 7 }, (_, i) => i);
    const rows = await allRows(async ({ page, pageSize }) => {
      const data = all.slice((page - 1) * pageSize, page * pageSize);
      return { data, total: all.length, page, pageSize, totalPages: Math.ceil(all.length / pageSize) };
    }, 3);
    expect(rows).toEqual(all);
  });
});
