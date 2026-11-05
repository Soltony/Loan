import {
  endOfDay,
  endOfMonth,
  endOfQuarter,
  endOfWeek,
  endOfYear,
  format,
  isValid,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
} from 'date-fns';
import { AGING_CLASSES, type AgingClass, type LoanStatus, type SortDir, type TableSort } from '../types';

/**
 * The reports screen's filters and how they travel: in the page URL (so a view
 * can be shared and survives a reload) and as report route parameters. Periods
 * are worked out here, in the user's timezone, and sent as instants.
 */

export const REPORT_TABS = [
  { id: 'overview', label: 'Overall' },
  { id: 'loans', label: 'Provider Loans' },
  { id: 'disbursements', label: 'Disbursements' },
  { id: 'repayments', label: 'Repayments' },
  { id: 'collections', label: 'Collections' },
  { id: 'utilization', label: 'Fund Utilization' },
  { id: 'aging', label: 'Aging' },
  { id: 'borrowers', label: 'Borrower Performance' },
  { id: 'national-bank', label: 'National Bank Reporting' },
] as const;

export type ReportTab = (typeof REPORT_TABS)[number]['id'];

/** What the search box looks for on each tab; tabs without an entry ignore it. */
export const SEARCH_PLACEHOLDERS: Partial<Record<ReportTab, string>> = {
  loans: 'Search by name, phone, account number or loan ID…',
  disbursements: 'Search by name, phone, account number or loan ID…',
  repayments: 'Search by name, phone, account number or loan ID…',
  aging: 'Search overdue borrowers by name, phone or account number…',
  borrowers: 'Search by name, phone, account number or loan ID…',
  'national-bank': 'Search by name, phone, account number or loan ID…',
};

/** Workbook sheets each tab produces, for the export dialog's "This tab only". */
export const TAB_EXPORT_SHEETS: Partial<Record<ReportTab, string[]>> = {
  loans: ['providerLoans'],
  disbursements: ['disbursements'],
  repayments: ['repayments'],
  collections: ['collections'],
  utilization: ['utilization'],
  aging: ['aging', 'borrowerAging'],
  borrowers: ['borrowerPerformance'],
  'national-bank': ['nationalBank'],
};

export const EXPORT_SHEETS = [
  { id: 'providerLoans', label: 'Provider Loans' },
  { id: 'collections', label: 'Collections' },
  { id: 'utilization', label: 'Fund Utilization', utilizationOnly: true },
  { id: 'disbursements', label: 'Disbursements' },
  { id: 'repayments', label: 'Repayments' },
  { id: 'aging', label: 'Aging Report' },
  { id: 'borrowerAging', label: 'Borrower Aging' },
  { id: 'borrowerPerformance', label: 'Borrower Performance' },
  { id: 'nationalBank', label: 'National Bank Report' },
] as const;

export const TIMEFRAMES = [
  { value: 'daily', label: 'Today' },
  { value: 'weekly', label: 'This Week' },
  { value: 'monthly', label: 'This Month' },
  { value: 'month', label: 'Specific Month' },
  { value: 'quarterly', label: 'This Quarter' },
  { value: 'semiAnnually', label: 'This Half-Year' },
  { value: 'annually', label: 'This Year' },
  { value: 'custom', label: 'Custom Range' },
  { value: 'overall', label: 'Overall' },
] as const;

export type Timeframe = (typeof TIMEFRAMES)[number]['value'];

export const LOAN_STATUSES: Array<{ value: LoanStatus; label: string }> = [
  { value: 'current', label: 'Current' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'defaulted', label: 'Defaulted' },
  { value: 'paid', label: 'Paid' },
];

export const PAGE_SIZES = [25, 50, 100, 200];
export const DEFAULT_PAGE_SIZE = 50;

export interface ReportFilters {
  tab: ReportTab;
  timeframe: Timeframe;
  /** Specific Month: `yyyy-MM`. */
  month?: string;
  /** Custom range: calendar days (`yyyy-MM-dd`) in the user's timezone. */
  from?: string;
  to?: string;
  /** A provider id or 'all'; '' (no choice made) = the user's default. */
  providerId: string;
  /** District users: one of their branch codes, or 'all'. */
  branch: string;
  search: string;
  /** Loan status (Provider Loans and Borrower Performance). */
  status?: LoanStatus;
  /** Aging class of the borrower-level aging table. */
  agingClass?: AgingClass;
  page: number;
  pageSize: number;
  /** Unset: the report's own order. */
  sort?: TableSort;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function day(value: string | null | undefined): string | undefined {
  return value && DAY.test(value) && isValid(parseISO(value)) ? value : undefined;
}

function positive(value: string | null, fallback: number): number {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** This month as `yyyy-MM`. */
export function currentMonth(now: Date = new Date()): string {
  return format(now, 'yyyy-MM');
}

/** The filters a page URL describes; anything missing or invalid takes its default. */
export function parseFilters(params: URLSearchParams, now: Date = new Date()): ReportFilters {
  const tab = REPORT_TABS.find((t) => t.id === params.get('tab'))?.id ?? 'overview';
  const from = day(params.get('from'));
  const to = day(params.get('to'));
  const monthParam = params.get('month') ?? '';
  let timeframe: Timeframe = TIMEFRAMES.find((t) => t.value === params.get('timeframe'))?.value ?? 'overall';
  // A custom range needs its first day.
  if (timeframe === 'custom' && !from) timeframe = 'overall';
  const pageSize = positive(params.get('pageSize'), DEFAULT_PAGE_SIZE);
  const [sortBy, sortDir] = (params.get('sort') ?? '').split(':');
  return {
    tab,
    timeframe,
    ...(timeframe === 'month' && { month: MONTH.test(monthParam) ? monthParam : currentMonth(now) }),
    ...(timeframe === 'custom' && { from, to: to && to >= from! ? to : from }),
    providerId: params.get('provider') ?? '',
    branch: params.get('branch') || 'all',
    search: params.get('q')?.trim() ?? '',
    status: LOAN_STATUSES.find((s) => s.value === params.get('status'))?.value,
    agingClass: AGING_CLASSES.find((c) => c.key === params.get('class'))?.key,
    page: positive(params.get('page'), 1),
    pageSize: PAGE_SIZES.includes(pageSize) ? pageSize : DEFAULT_PAGE_SIZE,
    ...(sortBy && (sortDir === 'asc' || sortDir === 'desc') && { sort: { by: sortBy, dir: sortDir as SortDir } }),
  };
}

/** The page URL's query string for the filters; defaults are left out. */
export function filtersQuery(filters: ReportFilters, defaultProvider: string): string {
  const params = new URLSearchParams();
  if (filters.tab !== 'overview') params.set('tab', filters.tab);
  if (filters.timeframe !== 'overall') params.set('timeframe', filters.timeframe);
  if (filters.timeframe === 'month' && filters.month) params.set('month', filters.month);
  if (filters.timeframe === 'custom' && filters.from) {
    params.set('from', filters.from);
    if (filters.to && filters.to !== filters.from) params.set('to', filters.to);
  }
  if (filters.providerId && filters.providerId !== defaultProvider) params.set('provider', filters.providerId);
  if (filters.branch && filters.branch !== 'all') params.set('branch', filters.branch);
  if (filters.search) params.set('q', filters.search);
  if (filters.status) params.set('status', filters.status);
  if (filters.agingClass) params.set('class', filters.agingClass);
  if (filters.page > 1) params.set('page', String(filters.page));
  if (filters.pageSize !== DEFAULT_PAGE_SIZE) params.set('pageSize', String(filters.pageSize));
  if (filters.sort) params.set('sort', `${filters.sort.by}:${filters.sort.dir}`);
  return params.toString();
}

export interface Period {
  from?: Date;
  to?: Date;
}

type PeriodFilters = Pick<ReportFilters, 'timeframe' | 'month' | 'from' | 'to'>;

/** The period of the filters, in the user's timezone (`overall` is unbounded). */
export function periodBounds(filters: PeriodFilters, now: Date = new Date()): Period {
  switch (filters.timeframe) {
    case 'daily':
      return { from: startOfDay(now), to: endOfDay(now) };
    case 'weekly':
      return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }) };
    case 'monthly':
      return { from: startOfMonth(now), to: endOfMonth(now) };
    case 'month': {
      const anchor = parseISO(`${filters.month ?? currentMonth(now)}-01`);
      return isValid(anchor) ? { from: startOfMonth(anchor), to: endOfMonth(anchor) } : {};
    }
    case 'quarterly':
      return { from: startOfQuarter(now), to: endOfQuarter(now) };
    case 'semiAnnually': {
      const firstHalf = now.getMonth() < 6;
      return {
        from: startOfMonth(new Date(now.getFullYear(), firstHalf ? 0 : 6, 1)),
        to: endOfMonth(new Date(now.getFullYear(), firstHalf ? 5 : 11, 1)),
      };
    }
    case 'annually':
      return { from: startOfYear(now), to: endOfYear(now) };
    case 'custom': {
      if (!filters.from) return {};
      return { from: startOfDay(parseISO(filters.from)), to: endOfDay(parseISO(filters.to ?? filters.from)) };
    }
    default:
      return {};
  }
}

/** The period as report route parameters: the instants, and the user's UTC offset for day grouping. */
export function periodParams(filters: PeriodFilters, now: Date = new Date()): Record<string, string> {
  const { from, to } = periodBounds(filters, now);
  return {
    timeframe: filters.timeframe,
    ...(from && { from: from.toISOString() }),
    ...(to && { to: to.toISOString() }),
    tzOffset: String(-now.getTimezoneOffset()),
  };
}

/** Provider and branch: whose loans a report covers. */
export function audienceParams(filters: Pick<ReportFilters, 'providerId' | 'branch'>): Record<string, string> {
  return {
    providerId: filters.providerId,
    ...(filters.branch !== 'all' && { branchCode: filters.branch }),
  };
}

/** Provider, branch and period: what every report request carries. */
export function scopeParams(filters: ReportFilters, now: Date = new Date()): Record<string, string> {
  return { ...audienceParams(filters), ...periodParams(filters, now) };
}

/** Parameters of a paged report request: scope, period, search, page and sort, plus `extra`. */
export function reportQuery(
  filters: ReportFilters,
  extra: Record<string, string | undefined> = {},
  now: Date = new Date(),
): Record<string, string> {
  const query: Record<string, string> = {
    ...scopeParams(filters, now),
    page: String(filters.page),
    pageSize: String(filters.pageSize),
  };
  if (filters.search) query.search = filters.search;
  if (filters.sort) {
    query.sortBy = filters.sort.by;
    query.sortDir = filters.sort.dir;
  }
  for (const [key, value] of Object.entries(extra)) if (value !== undefined) query[key] = value;
  return query;
}

/** A route URL with its parameters, keys in a stable order (the URL is also the cache key). */
export function reportUrl(path: string, query: Record<string, string>): string {
  const params = new URLSearchParams(Object.entries(query).sort(([a], [b]) => a.localeCompare(b)));
  return `${path}?${params.toString()}`;
}

/** How a custom range reads. */
export function rangeLabel(from: string, to?: string): string {
  const start = format(parseISO(from), 'LLL dd, y');
  return to && to !== from ? `${start} – ${format(parseISO(to), 'LLL dd, y')}` : start;
}

/** The period in words, for the summary and the overview. */
export function periodLabel(filters: PeriodFilters): string {
  if (filters.timeframe === 'custom' && filters.from) return rangeLabel(filters.from, filters.to);
  if (filters.timeframe === 'month' && filters.month) return format(parseISO(`${filters.month}-01`), 'MMMM yyyy');
  if (filters.timeframe === 'overall') return 'All time';
  return TIMEFRAMES.find((t) => t.value === filters.timeframe)?.label ?? '';
}
