import { startOfDay } from 'date-fns';

/**
 * Gets the current date for all loan calculations.
 * Returns the start of the current day (midnight) for consistent date comparisons.
 * 
 * @returns Date object representing the start of today
 */
export function getAsOfDate(): Date {
  return startOfDay(new Date());
}

/**
 * Gets the current date for server-side calculations.
 * This version is explicitly for server actions and API routes.
 */
export function getServerAsOfDate(): Date {
  return getAsOfDate();
}

/**
 * Parses a `yyyy-MM-dd` filter value into the local start of that day.
 * Built from the date parts rather than `new Date(str)` because the string form
 * is parsed as UTC midnight, which lands on the wrong local day/hours.
 *
 * @returns the local start of day, or null when the input is missing/malformed
 */
export function parseDayStart(value: string | null | undefined): Date | null {
  const parts = parseDayParts(value);
  if (!parts) return null;
  const [year, month, day] = parts;
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

/** Parses a `yyyy-MM-dd` filter value into the local end of that day (inclusive). */
export function parseDayEnd(value: string | null | undefined): Date | null {
  const parts = parseDayParts(value);
  if (!parts) return null;
  const [year, month, day] = parts;
  return new Date(year, month - 1, day, 23, 59, 59, 999);
}

function parseDayParts(value: string | null | undefined): [number, number, number] | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value?.trim() ?? '');
  if (!match) return null;
  const [, year, month, day] = match;
  return [Number(year), Number(month), Number(day)];
}
