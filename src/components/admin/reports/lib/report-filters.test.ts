import { endOfDay } from 'date-fns';
import { describe, expect, it } from 'vitest';
import {
  filtersQuery,
  parseFilters,
  periodBounds,
  periodLabel,
  periodParams,
  reportQuery,
  reportUrl,
  type ReportFilters,
} from './report-filters';

const now = new Date(2026, 9, 29, 15, 30);
const parse = (query: string) => parseFilters(new URLSearchParams(query), now);

describe('report filters in the URL', () => {
  it('defaults everything a URL leaves out, and writes defaults back as nothing', () => {
    const filters = parse('');
    expect(filters).toEqual({
      tab: 'overview',
      timeframe: 'overall',
      providerId: '',
      branch: 'all',
      search: '',
      status: undefined,
      agingClass: undefined,
      page: 1,
      pageSize: 50,
    });
    expect(filtersQuery({ ...filters, providerId: 'all' }, 'all')).toBe('');
  });

  it('round-trips a shared view', () => {
    const query =
      'tab=aging&timeframe=custom&from=2026-10-01&to=2026-10-15&provider=p1&branch=409&q=0911&status=overdue&class=Substandard&page=3&pageSize=100&sort=daysOverdue%3Adesc';
    const filters = parse(query);
    expect(filters).toMatchObject({
      tab: 'aging',
      timeframe: 'custom',
      from: '2026-10-01',
      to: '2026-10-15',
      providerId: 'p1',
      branch: '409',
      search: '0911',
      status: 'overdue',
      agingClass: 'Substandard',
      page: 3,
      pageSize: 100,
      sort: { by: 'daysOverdue', dir: 'desc' },
    });
    expect(filtersQuery(filters, 'all')).toBe(query);
  });

  it('keeps a specific month, and defaults it to this month', () => {
    expect(parse('timeframe=month&month=2026-05')).toMatchObject({ timeframe: 'month', month: '2026-05' });
    expect(parse('timeframe=month&month=2026-13').month).toBe('2026-10');
    expect(filtersQuery(parse('timeframe=month&month=2026-05'), 'all')).toBe('timeframe=month&month=2026-05');
  });

  it('ignores what it does not know', () => {
    const filters = parse('tab=nope&timeframe=hourly&status=late&class=Bad&page=-2&pageSize=7&sort=total:sideways');
    expect(filters).toMatchObject({
      tab: 'overview',
      timeframe: 'overall',
      status: undefined,
      agingClass: undefined,
      page: 1,
      pageSize: 50,
    });
    expect(filters.sort).toBeUndefined();
    // A custom range without its first day is no range; a reversed one is one day.
    expect(parse('timeframe=custom').timeframe).toBe('overall');
    expect(parse('timeframe=custom&from=2026-10-09&to=2026-10-01')).toMatchObject({
      from: '2026-10-09',
      to: '2026-10-09',
    });
  });
});

describe('report periods', () => {
  it('are worked out on the local calendar', () => {
    expect(periodBounds({ timeframe: 'daily' }, now)).toEqual({
      from: new Date(2026, 9, 29),
      to: endOfDay(new Date(2026, 9, 29)),
    });
    expect(periodBounds({ timeframe: 'weekly' }, now).from).toEqual(new Date(2026, 9, 26));
    expect(periodBounds({ timeframe: 'quarterly' }, now).from).toEqual(new Date(2026, 9, 1));
    expect(periodBounds({ timeframe: 'semiAnnually' }, now).from).toEqual(new Date(2026, 6, 1));
    expect(periodBounds({ timeframe: 'overall' }, now)).toEqual({});
    expect(periodBounds({ timeframe: 'month', month: '2026-05' }, now)).toEqual({
      from: new Date(2026, 4, 1),
      to: endOfDay(new Date(2026, 4, 31)),
    });
    expect(periodBounds({ timeframe: 'custom', from: '2026-10-01', to: '2026-10-15' }, now)).toEqual({
      from: new Date(2026, 9, 1),
      to: endOfDay(new Date(2026, 9, 15)),
    });
  });

  it('travel as instants with the UTC offset', () => {
    expect(periodParams({ timeframe: 'monthly' }, now)).toEqual({
      timeframe: 'monthly',
      from: new Date(2026, 9, 1).toISOString(),
      to: endOfDay(new Date(2026, 9, 31)).toISOString(),
      tzOffset: String(-now.getTimezoneOffset()),
    });
    expect(periodParams({ timeframe: 'overall' }, now)).toEqual({
      timeframe: 'overall',
      tzOffset: String(-now.getTimezoneOffset()),
    });
  });

  it('read in words', () => {
    expect(periodLabel({ timeframe: 'month', month: '2026-05' })).toBe('May 2026');
    expect(periodLabel({ timeframe: 'custom', from: '2026-10-01', to: '2026-10-15' })).toBe('Oct 01, 2026 – Oct 15, 2026');
    expect(periodLabel({ timeframe: 'overall' })).toBe('All time');
    expect(periodLabel({ timeframe: 'weekly' })).toBe('This Week');
  });
});

describe('reportQuery', () => {
  const filters: ReportFilters = {
    ...parse(''),
    providerId: 'p1',
    branch: '409',
    search: '0911',
    page: 2,
    sort: { by: 'dueDate', dir: 'asc' },
  };

  it('carries provider, branch, period, paging, search, order and extras', () => {
    expect(reportQuery(filters, { status: 'paid', type: undefined }, now)).toMatchObject({
      providerId: 'p1',
      branchCode: '409',
      timeframe: 'overall',
      page: '2',
      pageSize: '50',
      search: '0911',
      sortBy: 'dueDate',
      sortDir: 'asc',
      status: 'paid',
    });
    expect(reportQuery(filters, {}, now)).not.toHaveProperty('type');
    expect(reportQuery({ ...filters, branch: 'all' }, {}, now)).not.toHaveProperty('branchCode');
  });

  it('builds the same URL whatever order the parameters come in (the URL is the cache key)', () => {
    expect(reportUrl('/api/x', { b: '2', a: '1' })).toBe(reportUrl('/api/x', { a: '1', b: '2' }));
    expect(reportUrl('/api/x', { b: '2', a: '1' })).toBe('/api/x?a=1&b=2');
  });
});
