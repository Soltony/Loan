import {
  endOfDay,
  endOfMonth,
  endOfQuarter,
  endOfWeek,
  endOfYear,
  isValid,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
} from 'date-fns';

/**
 * Query parameters the report routes share: the period, the provider, paging
 * and sorting. The reports screen works the period out in the user's timezone
 * and sends it as two instants (`from`, `to`), so they are used as they are; a
 * bare day (`yyyy-MM-dd`) or a named `timeframe` is resolved in the server's
 * timezone.
 */

/** Inclusive bounds of a reporting period; either may be open. */
export interface ReportPeriod {
  gte?: Date;
  lte?: Date;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_ONLY = /^(\d{4})-(\d{2})$/;

function bound(value: string | null, edge: 'start' | 'end'): Date | undefined {
  if (!value) return undefined;
  if (DATE_ONLY.test(value)) {
    const day = parseISO(value);
    if (!isValid(day)) return undefined;
    return edge === 'start' ? startOfDay(day) : endOfDay(day);
  }
  const instant = new Date(value);
  return isValid(instant) ? instant : undefined;
}

/**
 * A named timeframe of the reports screen, in the server's timezone (`overall`
 * is unbounded). `month` takes the month it covers as `yyyy-MM`.
 */
export function timeframePeriod(
  timeframe: string,
  now: Date = new Date(),
  month?: string | null,
): ReportPeriod {
  switch (timeframe) {
    case 'daily':
      return { gte: startOfDay(now), lte: endOfDay(now) };
    case 'weekly':
      return {
        gte: startOfWeek(now, { weekStartsOn: 1 }),
        lte: endOfWeek(now, { weekStartsOn: 1 }),
      };
    case 'monthly':
      return { gte: startOfMonth(now), lte: endOfMonth(now) };
    case 'month': {
      const match = MONTH_ONLY.exec(month ?? '');
      if (!match) return {};
      const anchor = new Date(Number(match[1]), Number(match[2]) - 1, 1);
      return isValid(anchor) ? { gte: startOfMonth(anchor), lte: endOfMonth(anchor) } : {};
    }
    case 'quarterly':
      return { gte: startOfQuarter(now), lte: endOfQuarter(now) };
    case 'semiAnnually': {
      const firstHalf = now.getMonth() < 6;
      return {
        gte: startOfMonth(new Date(now.getFullYear(), firstHalf ? 0 : 6, 1)),
        lte: endOfMonth(new Date(now.getFullYear(), firstHalf ? 5 : 11, 1)),
      };
    }
    case 'annually':
    case 'yearly':
      return { gte: startOfYear(now), lte: endOfYear(now) };
    default:
      return {};
  }
}

/** The period of a report request: `from` / `to` when given, else the named `timeframe`. */
export function reportPeriod(params: URLSearchParams, now: Date = new Date()): ReportPeriod {
  const gte = bound(params.get('from'), 'start');
  const lte = bound(params.get('to'), 'end');
  if (gte || lte) return periodFilter({ gte, lte }) ?? {};
  return timeframePeriod(params.get('timeframe') || 'overall', now, params.get('month'));
}

/** The period as a Prisma date filter, undefined when it is unbounded. */
export function periodFilter(period: ReportPeriod): ReportPeriod | undefined {
  if (!period.gte && !period.lte) return undefined;
  return { ...(period.gte && { gte: period.gte }), ...(period.lte && { lte: period.lte }) };
}

/** Whether an instant falls inside the period. */
export function inPeriod(period: ReportPeriod, date: Date): boolean {
  return (!period.gte || date >= period.gte) && (!period.lte || date <= period.lte);
}

/**
 * The provider a report covers: a user tied to a provider always gets their
 * own, anyone else the one they asked for. `null` means every provider; the
 * caller answers `'none'` with an empty report.
 */
export function reportProvider(
  user: { loanProviderId?: string | null },
  requested: string | null,
): string | null {
  const providerId = user.loanProviderId || requested;
  return providerId && providerId !== 'all' ? providerId : null;
}

/**
 * Minutes east of UTC of the user's timezone (`tzOffset`), else the server's:
 * rows grouped by day fall on the user's calendar days.
 */
export function reportTzOffset(params: URLSearchParams, now: Date = new Date()): number {
  const raw = params.get('tzOffset');
  const minutes = raw === null || raw.trim() === '' ? Number.NaN : Number(raw);
  return Number.isInteger(minutes) && Math.abs(minutes) <= 14 * 60
    ? minutes
    : -now.getTimezoneOffset();
}

/** The calendar day (`yyyy-MM-dd`) an instant falls on, `tzOffset` minutes east of UTC. */
export function localDay(date: Date, tzOffset: number): string {
  return new Date(date.getTime() + tzOffset * 60_000).toISOString().slice(0, 10);
}

export interface Paging {
  page: number;
  pageSize: number;
}

function positive(value: string | null, fallback: number): number {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** `page` and `pageSize` of a request; the screen asks for at most `maxSize` rows. */
export function reportPaging(params: URLSearchParams, defaultSize = 50, maxSize = 200): Paging {
  return {
    page: positive(params.get('page'), 1),
    pageSize: Math.min(maxSize, positive(params.get('pageSize'), defaultSize)),
  };
}

export const skipOf = (paging: Paging): number => (paging.page - 1) * paging.pageSize;

/** One page of report rows, as the reports screen reads it. */
export interface ReportPage<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function reportPage<T>(data: T[], total: number, paging: Paging): ReportPage<T> {
  return {
    data,
    total,
    page: paging.page,
    pageSize: paging.pageSize,
    totalPages: Math.ceil(total / paging.pageSize),
  };
}

/** The rows of one page of a list already held in full. */
export function pageOf<T>(rows: T[], paging: Paging): ReportPage<T> {
  return reportPage(rows.slice(skipOf(paging), skipOf(paging) + paging.pageSize), rows.length, paging);
}

export type SortDir = 'asc' | 'desc';

export interface ReportSort<K extends string> {
  by: K;
  dir: SortDir;
}

/** The requested sort (`sortBy`, `sortDir`) when the report can sort by that column, else its default. */
export function reportSort<K extends string>(
  params: URLSearchParams,
  columns: readonly K[],
  fallback: ReportSort<K>,
): ReportSort<K> {
  const by = params.get('sortBy');
  if (!by || !(columns as readonly string[]).includes(by)) return fallback;
  return { by: by as K, dir: params.get('sortDir') === 'asc' ? 'asc' : 'desc' };
}

/**
 * A comparator over a row value: numbers by size, text A–Z, then `dir`.
 * Missing values sort last either way.
 */
export function compareBy<T>(value: (row: T) => number | string | null | undefined, dir: SortDir) {
  const sign = dir === 'asc' ? 1 : -1;
  return (a: T, b: T): number => {
    const x = value(a);
    const y = value(b);
    if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1;
    return sign * (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y)));
  };
}

/** SQL Server takes at most 2,100 parameters per statement, so long `IN` lists go in chunks. */
export function chunked<T>(items: readonly T[], size = 1000): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

/** Every row of a paged report, read page by page (exports). */
export async function allRows<T>(
  read: (paging: Paging) => Promise<ReportPage<T>>,
  pageSize = 500,
): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 1; ; page++) {
    const result = await read({ page, pageSize });
    rows.push(...result.data);
    if (result.data.length === 0 || page >= result.totalPages) return rows;
  }
}
