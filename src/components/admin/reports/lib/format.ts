import { format } from 'date-fns';

const money = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const count = new Intl.NumberFormat('en-US');

/** Amounts as the reports show them: 2 decimals, grouped thousands. */
export function formatMoney(amount: number | null | undefined): string {
  return amount === null || amount === undefined || Number.isNaN(amount) ? '0.00' : money.format(amount);
}

export function formatCount(value: number | null | undefined): string {
  return count.format(value || 0);
}

/** Stat tiles: millions and thousands shortened; tables keep exact figures. */
export function formatCompact(value: number): string {
  const abs = Math.abs(value || 0);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${(value / 1_000).toFixed(1)}K`;
  return count.format(Math.round(value || 0));
}

/** A date (ISO string) on the user's calendar, or '' when there is none. */
export function formatDay(value: string | Date | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : format(date, 'yyyy-MM-dd');
}

/** Sums a numeric field over rows (page totals). */
export function sumOf<T>(rows: T[], value: (row: T) => number | null | undefined): number {
  return rows.reduce((total, row) => total + (value(row) || 0), 0);
}
