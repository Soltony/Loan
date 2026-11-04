import prisma from './prisma';

/**
 * @fileOverview How customer data is fetched: set in the Scoring Engine, stored in one row.
 *
 * Read on every statement refresh and every scoring run, so the values are cached for a few
 * seconds. If the table is missing (migration not applied yet) the defaults are used.
 */

export type DataFetchSettings = {
  /** Complete months of statement the figures cover. */
  statementMonths: number;
  /** An account's statement is fetched again when its figures are older than this. */
  statementRefreshDays: number;
  /** Figures older than this are not used for scoring at all. */
  statementMaxAgeDays: number;
  /** How often customer info is fetched again; 0 = fetch once and keep. */
  customerInfoRefreshDays: number;
  updatedAt: Date | null;
};

export const DEFAULT_DATA_FETCH_SETTINGS: DataFetchSettings = {
  statementMonths: 6,
  statementRefreshDays: 7,
  statementMaxAgeDays: 31,
  customerInfoRefreshDays: 0,
  updatedAt: null,
};

/** 12 months is the most the data API allows in one statement request (366 days). */
export const DATA_FETCH_LIMITS = {
  statementMonths: { min: 1, max: 12 },
  statementRefreshDays: { min: 1, max: 90 },
  statementMaxAgeDays: { min: 1, max: 365 },
  customerInfoRefreshDays: { min: 0, max: 365 },
} as const;

type Field = keyof typeof DATA_FETCH_LIMITS;

export function validateDataFetchSettings(
  input: any
): { ok: true; settings: Omit<DataFetchSettings, 'updatedAt'> } | { ok: false; error: string } {
  const out = {} as Omit<DataFetchSettings, 'updatedAt'>;
  for (const field of Object.keys(DATA_FETCH_LIMITS) as Field[]) {
    const { min, max } = DATA_FETCH_LIMITS[field];
    const value = Number(input?.[field]);
    if (!Number.isInteger(value) || value < min || value > max) {
      return { ok: false, error: `${field} must be a whole number between ${min} and ${max}.` };
    }
    out[field] = value;
  }
  if (out.statementMaxAgeDays < out.statementRefreshDays) {
    return { ok: false, error: 'Figures may not be dropped sooner than they are refreshed.' };
  }
  return { ok: true, settings: out };
}

const CACHE_MS = 10_000;
const cache: { value: DataFetchSettings | null; readAt: number } =
  ((globalThis as any).__dataFetchSettings ??= { value: null, readAt: 0 });

export function clearDataFetchSettingsCache() {
  cache.value = null;
  cache.readAt = 0;
}

/** The current settings, or the defaults when they have never been saved. */
export async function loadDataFetchSettings(): Promise<DataFetchSettings> {
  if (cache.value && Date.now() - cache.readAt < CACHE_MS) return cache.value;
  let settings = DEFAULT_DATA_FETCH_SETTINGS;
  try {
    const row = await prisma.dataFetchSetting.findUnique({ where: { id: 'global' } });
    if (row) {
      settings = {
        statementMonths: row.statementMonths,
        statementRefreshDays: row.statementRefreshDays,
        statementMaxAgeDays: row.statementMaxAgeDays,
        customerInfoRefreshDays: row.customerInfoRefreshDays,
        updatedAt: row.updatedAt,
      };
    }
  } catch (e) {
    // Fall back to the defaults so fetching keeps working if the table is not there yet.
    console.error('[data-fetch-settings] could not read the settings', e);
  }
  cache.value = settings;
  cache.readAt = Date.now();
  return settings;
}

export async function saveDataFetchSettings(
  settings: Omit<DataFetchSettings, 'updatedAt'>,
  updatedById: string
): Promise<DataFetchSettings> {
  const row = await prisma.dataFetchSetting.upsert({
    where: { id: 'global' },
    create: { id: 'global', ...settings, updatedById },
    update: { ...settings, updatedById },
  });
  clearDataFetchSettingsCache();
  return {
    statementMonths: row.statementMonths,
    statementRefreshDays: row.statementRefreshDays,
    statementMaxAgeDays: row.statementMaxAgeDays,
    customerInfoRefreshDays: row.customerInfoRefreshDays,
    updatedAt: row.updatedAt,
  };
}
