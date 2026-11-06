/**
 * Display formatting shared by the customer mini-app screens.
 */
import { differenceInCalendarDays, format } from 'date-fns';

const money = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 10000 -> "10,000.00". Missing or invalid amounts read as 0.00 (never "-0.00" or "NaN"). */
export function formatMoney(amount: number | null | undefined): string {
  const n = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;
  return money.format(Math.abs(n) < 0.005 ? 0 : n);
}

/** 10000 -> "10,000.00 ETB". */
export function formatETB(amount: number | null | undefined): string {
  return `${formatMoney(amount)} ETB`;
}

const toDate = (value: Date | string | number | null | undefined): Date | null => {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** "24 Jul 2026", or an em dash when there is no valid date. */
export function formatDate(value: Date | string | number | null | undefined): string {
  const d = toDate(value);
  return d ? format(d, 'd MMM yyyy') : '—';
}

/** "24 Jul 2026, 14:05". */
export function formatDateTime(value: Date | string | number | null | undefined): string {
  const d = toDate(value);
  return d ? format(d, 'd MMM yyyy, HH:mm') : '—';
}

const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;

export type DueTone = 'overdue' | 'today' | 'soon' | 'later';

export interface DueStatus {
  tone: DueTone;
  /** Whole calendar days until the due date (or since it, when overdue). */
  days: number;
  label: string;
}

/** How a due date reads relative to `asOf`: overdue, today, within 3 days, or later. */
export function dueStatus(
  dueDate: Date | string | number,
  asOf: Date | string | number = new Date(),
): DueStatus {
  const due = toDate(dueDate);
  const now = toDate(asOf) ?? new Date();
  if (!due) return { tone: 'later', days: 0, label: '' };
  const diff = differenceInCalendarDays(due, now);
  if (diff < 0) return { tone: 'overdue', days: -diff, label: `Overdue by ${days(-diff)}` };
  if (diff === 0) return { tone: 'today', days: 0, label: 'Due today' };
  return { tone: diff <= 3 ? 'soon' : 'later', days: diff, label: `Due in ${days(diff)}` };
}

const capitalise = (word: string) =>
  word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : '';

/** "CHALEW NEGASH DEGAREGE" -> "Chalew Negash Degarege". */
export function titleCaseName(name: string | null | undefined): string {
  return String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(capitalise)
    .join(' ');
}

/** "CHALEW NEGASH DEGAREGE" -> "Chalew". */
export function firstName(name: string | null | undefined): string {
  return titleCaseName(name).split(' ')[0] ?? '';
}

/** Share of `total` repaid, clamped to 0..1 (0 when there is nothing to repay). */
export function repaidShare(repaid: number | null | undefined, total: number | null | undefined): number {
  const t = Number(total) || 0;
  if (t <= 0) return 0;
  return Math.min(1, Math.max(0, (Number(repaid) || 0) / t));
}
