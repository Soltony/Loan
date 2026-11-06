import prisma from './prisma';
import { fetchAccountStatement, parseStoredPayload, storedAccountNumber } from './customer-data-api';
import { loadCustomerInfoCopies } from './customer-info';
import {
  computeMetrics,
  normalizeStatementLines,
  parseAmount,
  statementDay,
  type StatementLine,
  type StatementParameterDefinition,
} from './statement-utils';
import { definitionsVersion, loadStatementParameters } from './statement-parameters';
import { loadDataFetchSettings, type DataFetchSettings } from './data-fetch-settings';
import { runWithFetchSlot } from './fetch-queue';

/**
 * @fileOverview Statement figures used by scoring (average deposit, airtime use, ...).
 *
 * The figures are computed from the 6 complete months before today (see computeMetrics) and stored
 * as `statementFigures` inside the borrower's customer-info copy - no statement tables. The
 * transactions themselves stay in the data API's shared store.
 *
 * The first statement fetch of the day can take minutes, so /api/phone-accounts/fetch-customer
 * starts it in the background (see borrower-data-sync.ts). Until the figures are stored, a product
 * whose rules use them answers "still checking" instead of deciding (see checkLoanEligibility);
 * the dashboard then recalculates the limit.
 */

export type StatementFigures = ReturnType<typeof computeMetrics> & {
  accountNumber: string;
  periodStart: string; // YYYYMMDD
  periodEnd: string; // YYYYMMDD
  transactionCount: number;
  computedAt: string; // ISO time the figures were computed
  odsFetchedAt: string | null; // when the data API read the statement from ODS, if it said
  definitionsVersion?: string; // the statement parameters `custom` was computed with
  latestTransactionDate?: string | null; // YYYYMMDD of the newest transaction in the statement
};

/** The built-in figures scoring rules can use; keep in step with statementFiguresForScoring. */
export const STATEMENT_FIGURE_FIELDS = [
  'monthsAtEbirr',
  'txCountRelevant',
  'billPaymentsCount',
  'avgMonthlyDeposit',
  'avgUniqueDepositSources',
  'avgMonthlyAirtimeCount',
  'avgMonthlyAirtimeValue',
  'withdrawalToDepositRatio',
  'avgBalance',
] as const;

export type StatementRefreshResult =
  | { ok: true; outcome: 'fresh' | 'saved'; figures: StatementFigures }
  | {
      ok: false;
      reason: 'disabled' | 'no-customer-info' | 'account-changed' | 'recent-failure' | 'busy' | 'upstream';
      status?: number;
      body?: string | null;
    };

const DAY_MS = 24 * 60 * 60 * 1000;
const RETRY_AFTER_FAILURE_MS = 30 * 60 * 1000;

/**
 * Whether statements are fetched at all. STATEMENT_FIGURES_ENABLED=true/false decides; when it is
 * not set, only with the shared data API (CUSTOMER_DATA_API_URL), because statement fetching
 * through the bank middleware had been switched off before (January 2026, reason not recorded).
 */
export function statementFiguresEnabled(): boolean {
  const flag = process.env.STATEMENT_FIGURES_ENABLED?.trim().toLowerCase();
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  return Boolean(process.env.CUSTOMER_DATA_API_URL?.trim());
}

// Kept on globalThis so every route bundle shares them: one statement fetch per account at a time,
// and no retry storm while the API is down or refuses an account.
const state: { running: Map<string, Promise<StatementRefreshResult>>; lastFailure: Map<string, number> } =
  ((globalThis as any).__statementFigures ??= { running: new Map(), lastFailure: new Map() });

/** The newest stored figures for `accountNumber` among parsed customer-info payloads. */
export function figuresForAccount(
  payloads: Array<Record<string, any> | null>,
  accountNumber: string
): StatementFigures | null {
  let best: StatementFigures | null = null;
  for (const payload of payloads) {
    const figures = payload?.statementFigures;
    if (!figures || typeof figures !== 'object' || String(figures.accountNumber) !== accountNumber) continue;
    if (!best || String(figures.computedAt) > String(best.computedAt)) best = figures;
  }
  return best;
}

/**
 * The figures under the field names scoring rules use. `includeCustom` adds the defined statement
 * parameters; leave it off when their definitions changed after the figures were computed.
 */
export function statementFiguresForScoring(figures: StatementFigures, includeCustom = true): Record<string, any> {
  return {
    ...(includeCustom ? figures.custom ?? {} : {}),
    monthsAtEbirr: figures.monthsAtEbirr,
    txCountRelevant: figures.txCountRelevant,
    billPaymentsCount: figures.billPaymentsCount,
    avgMonthlyDeposit: figures.avgMonthlyDeposit,
    avgUniqueDepositSources: figures.avgUniqueDepositSources,
    avgMonthlyAirtimeCount: figures.avgMonthlyAirtimeCount,
    avgMonthlyAirtimeValue: figures.avgMonthlyAirtimeValue,
    withdrawalToDepositRatio: figures.withdrawalToDepositRatio,
    avgBalance: figures.avgBalance,
    accountMetricsRaw: figures.derived ?? {},
  };
}

/**
 * What scoring may use from the stored figures of `accountNumber`: nothing when there are none or
 * they are older than the Scoring Engine allows, and no statement-parameter values computed under
 * definitions that have changed since. A product whose rules need what is missing answers "still
 * checking" until the next refresh (see checkLoanEligibility).
 */
export async function statementScoringData(
  payloads: Array<Record<string, any> | null>,
  accountNumber: string,
  now = Date.now()
): Promise<Record<string, any>> {
  const figures = figuresForAccount(payloads, accountNumber);
  if (!figures) return {};
  const settings = await loadDataFetchSettings();
  if (!(now - Date.parse(figures.computedAt) < settings.statementMaxAgeDays * DAY_MS)) return {};
  const customIsCurrent = figures.definitionsVersion === definitionsVersion(await loadStatementParameters());
  return statementFiguresForScoring(figures, customIsCurrent);
}

/**
 * Whether stored figures can stay as they are: computed within the refresh interval, with the
 * statement parameters and the number of months the Scoring Engine has now. Otherwise the next
 * refresh fetches the statement again.
 */
export function figuresAreCurrent(
  figures: StatementFigures | null,
  settings: Pick<DataFetchSettings, 'statementRefreshDays' | 'statementMonths'>,
  version: string,
  now = Date.now()
): boolean {
  return Boolean(
    figures &&
      now - Date.parse(figures.computedAt) < settings.statementRefreshDays * DAY_MS &&
      figures.definitionsVersion === version &&
      figures.derived?.monthsConsidered?.length === settings.statementMonths
  );
}

function ymd(d: Date) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

/** The months the figures cover: `months` complete months, ending with last month. */
export function figureWindow(months: number, today = new Date()) {
  const firstDay = new Date(today.getFullYear(), today.getMonth() - months, 1);
  const lastDay = new Date(today.getFullYear(), today.getMonth(), 0); // last day of last month
  return { periodStart: ymd(firstDay), periodEnd: ymd(lastDay), asOf: ymd(today) };
}

/** YYYYMMDD of the newest dated line (booking date, else value date); null when none has a date. */
export function newestTransactionDay(lines: StatementLine[]): string | null {
  let newest: number | null = null;
  for (const line of lines) {
    const day = statementDay(line.bookDate ?? line.valueDate);
    if (day !== null && (newest === null || day > newest)) newest = day;
  }
  if (newest === null) return null;
  const d = new Date(newest * DAY_MS);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

/**
 * ODS loads every day, so across the accounts fetched lately the newest transaction should be a day
 * or two old. Older than this suggests ODS (or the data API) stopped receiving data, and every
 * figure would read the missing months as zero.
 */
export const STALE_STATEMENT_DAYS = 4;

/**
 * How current the statement data is: the newest transaction among statements fetched in the last
 * 7 days. A dormant account says nothing, but the newest across all of them shows the source's
 * cut-off. Figures computed before latestTransactionDate was recorded are not counted.
 */
export async function statementDataFreshness(now = new Date()) {
  const since = new Date(now.getTime() - 7 * DAY_MS);
  const rows = await prisma.provisionedData.findMany({
    where: { uploadId: null, updatedAt: { gte: since }, config: { name: 'ExternalCustomerInfo' } },
    select: { data: true },
  });
  let newest: string | null = null;
  let accountsChecked = 0;
  for (const row of rows) {
    const figures = parseStoredPayload(row.data)?.statementFigures;
    if (!figures?.latestTransactionDate || !(Date.parse(figures.computedAt) >= since.getTime())) continue;
    accountsChecked++;
    if (!newest || figures.latestTransactionDate > newest) newest = figures.latestTransactionDate;
  }
  const newestDay = newest ? statementDay(newest) : null;
  const today = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / DAY_MS);
  const daysOld = newestDay === null ? null : today - newestDay;
  return {
    newestTransactionDate: newest,
    accountsChecked,
    daysOld,
    stale: daysOld !== null && daysOld > STALE_STATEMENT_DAYS,
  };
}

/**
 * Makes sure the borrower's stored figures for `accountNumber` are within the refresh interval set
 * in the Scoring Engine, fetching the statement if needed. Calls for the same account at the same
 * time share one fetch, and only a few fetches run at once (see fetch-queue.ts).
 * Needs the borrower's customer-info copy for this account, which holds the figures.
 */
export function refreshStatementFigures(borrowerId: string, accountNumber: string): Promise<StatementRefreshResult> {
  if (!statementFiguresEnabled()) return Promise.resolve({ ok: false, reason: 'disabled' });
  const key = `${borrowerId}|${accountNumber}`;
  let job = state.running.get(key);
  if (!job) {
    job = refresh(borrowerId, accountNumber, key).finally(() => state.running.delete(key));
    state.running.set(key, job);
  }
  return job;
}

/** The refresh running for this borrower's account right now, if any. */
export function statementRefreshInProgress(borrowerId: string, accountNumber: string): Promise<StatementRefreshResult> | null {
  return state.running.get(`${borrowerId}|${accountNumber}`) ?? null;
}

async function refresh(borrowerId: string, accountNumber: string, key: string): Promise<StatementRefreshResult> {
  const payloads = (await loadCustomerInfoCopies(borrowerId)).map((c) => parseStoredPayload(c.data));
  if (!payloads.some((p) => storedAccountNumber(p) === accountNumber)) {
    return { ok: false, reason: 'no-customer-info' };
  }

  // Figures are redone when they are past the refresh interval, when the statement parameters
  // changed, or when the Scoring Engine now asks for a different number of months.
  const [settings, definitions] = await Promise.all([loadDataFetchSettings(), loadStatementParameters()]);
  const version = definitionsVersion(definitions);
  const current = figuresForAccount(payloads, accountNumber);
  if (current && figuresAreCurrent(current, settings, version)) {
    return { ok: true, outcome: 'fresh', figures: current };
  }

  const failedAt = state.lastFailure.get(key);
  if (failedAt && Date.now() - failedAt < RETRY_AFTER_FAILURE_MS) {
    return { ok: false, reason: 'recent-failure' };
  }

  // The slow part runs a few at a time; the rest wait their turn (see fetch-queue.ts).
  return runWithFetchSlot<StatementRefreshResult>(
    () => fetchAndStore(borrowerId, accountNumber, key, settings, definitions, version),
    () => ({ ok: false, reason: 'busy' })
  );
}

async function fetchAndStore(
  borrowerId: string,
  accountNumber: string,
  key: string,
  settings: DataFetchSettings,
  definitions: StatementParameterDefinition[],
  version: string
): Promise<StatementRefreshResult> {
  // Whole months only, ending with last month: the current month is not finished, and this keeps
  // even 12 months inside the data API's 366-day limit.
  const { periodStart, periodEnd, asOf } = figureWindow(settings.statementMonths);

  const upstream = await fetchAccountStatement(accountNumber, periodStart, periodEnd);
  const info = upstream.ok ? (upstream.body?.details ?? upstream.body) : null;
  const isStatement = info && typeof info === 'object' && (info.statementDetails != null || info.CustomerAccount != null);
  if (!upstream.ok || !isStatement) {
    for (const [k, at] of state.lastFailure) if (Date.now() - at >= RETRY_AFTER_FAILURE_MS) state.lastFailure.delete(k);
    state.lastFailure.set(key, Date.now());
    const status = upstream.ok ? 502 : upstream.status;
    const body = upstream.ok ? JSON.stringify(upstream.body) : upstream.body;
    console.warn('[statement-figures] statement fetch failed', accountNumber, status, body);
    return { ok: false, reason: 'upstream', status, body };
  }
  state.lastFailure.delete(key);

  const lines = normalizeStatementLines(info.statementDetails);
  const figures: StatementFigures = {
    accountNumber,
    periodStart,
    periodEnd,
    transactionCount: lines.length,
    computedAt: new Date().toISOString(),
    odsFetchedAt: upstream.odsFetchedAt,
    definitionsVersion: version,
    latestTransactionDate: newestTransactionDay(lines),
    ...computeMetrics(lines, asOf, parseAmount(info.OpeningBalance), definitions, settings.statementMonths),
  };

  // Re-read just before writing: the customer-info refresh may have rewritten the copy meanwhile.
  const latest = (await loadCustomerInfoCopies(borrowerId))
    .map((c) => ({ id: c.id, payload: parseStoredPayload(c.data) }))
    .filter((c) => storedAccountNumber(c.payload) === accountNumber);
  if (latest.length === 0) {
    return { ok: false, reason: 'account-changed' };
  }
  await prisma.$transaction(
    latest.map((c) =>
      prisma.provisionedData.update({
        where: { id: c.id },
        data: { data: JSON.stringify({ ...c.payload, statementFigures: figures }) },
      })
    )
  );
  return { ok: true, outcome: 'saved', figures };
}
