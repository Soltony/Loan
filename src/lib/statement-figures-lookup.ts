import prisma from './prisma';
import { parseStoredPayload } from './customer-data-api';
import { figuresForAccount, type StatementFigures } from './statement-figures';
import { definitionsVersion, loadStatementParameters } from './statement-parameters';
import { loadDataFetchSettings } from './data-fetch-settings';
import type { StatementParameterDefinition } from './statement-utils';

/**
 * @fileOverview The statement figures saved for an account, for the "Saved Statement Figures" card
 * in the Scoring Engine. Reads only what the background fetch saved; never fetches a statement.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** The built-in figures in the order shown, with the field name rules use and what each means. */
export const BUILT_IN_FIGURES = [
  { field: 'avgMonthlyDeposit', label: 'Average monthly income', kind: 'money',
    about: 'Money in per month, averaged without the best and the worst month. Loans, interest and reversals are not income.' },
  { field: 'txCountRelevant', label: 'Incoming payments of 50 or more', kind: 'count',
    about: 'Number of incoming payments of at least 50, over all the months.' },
  { field: 'avgUniqueDepositSources', label: 'Payers per month', kind: 'decimal',
    about: 'Different payers (by narrative) paying in, per month on average.' },
  { field: 'monthsAtEbirr', label: 'Months using Telebirr / e-birr', kind: 'count',
    about: 'Months with at least one Telebirr or e-birr transaction.' },
  { field: 'billPaymentsCount', label: 'Bill payments', kind: 'count',
    about: 'Bills paid from the account, over all the months.' },
  { field: 'avgMonthlyAirtimeCount', label: 'Airtime purchases per month', kind: 'decimal',
    about: 'Airtime bought from the account, per month on average.' },
  { field: 'avgMonthlyAirtimeValue', label: 'Airtime spend per month', kind: 'money',
    about: 'Amount spent on airtime, per month on average.' },
  { field: 'withdrawalToDepositRatio', label: 'Money out ÷ income', kind: 'decimal',
    about: 'Everything paid out (less reversals) divided by income. Above 1 means more went out than came in.' },
  { field: 'avgBalance', label: 'Average balance', kind: 'money',
    about: 'Average end-of-day balance. Not calculated while statements are fetched without balances.' },
] as const;

export type FiguresLookupResult = {
  accountNumber: string;
  /** Phones whose customer info holds these figures, and whether this is their active account. */
  borrowers: { phone: string; isActiveAccount: boolean }[];
  computedAt: string;
  ageDays: number;
  periodStart: string;
  periodEnd: string;
  transactionCount: number;
  usedForScoring: boolean;
  notUsedBecause: string | null;
  figures: { field: string; label: string; kind: string; about: string; value: number | null }[];
  /** Statement parameters defined in the Scoring Engine; `current` is false when their definition changed since. */
  custom: { field: string; name: string; value: number | null; current: boolean }[];
  months: { month: string; income: number; airtimeCount: number; airtimeValue: number }[];
  excludedFromIncome: { loanDisbursements: number; interest: number; reversals: number } | null;
};

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** What the card shows for one account's saved figures. Scoring uses them only while they are recent
 *  enough and the account is the active account of the phone being scored. */
export function describeFigures(
  figures: StatementFigures,
  borrowers: { phone: string; isActiveAccount: boolean }[],
  opts: { maxAgeDays: number; definitions: StatementParameterDefinition[]; now?: number }
): FiguresLookupResult {
  const now = opts.now ?? Date.now();
  const ageDays = (now - Date.parse(figures.computedAt)) / DAY_MS;
  const fresh = ageDays < opts.maxAgeDays;
  const active = borrowers.some((b) => b.isActiveAccount);

  const current = figures.definitionsVersion === definitionsVersion(opts.definitions);
  const names = new Map(opts.definitions.map((d) => [d.field, d.name]));
  const customFields = Array.from(new Set([...opts.definitions.map((d) => d.field), ...Object.keys(figures.custom ?? {})]));

  const derived: any = figures.derived ?? {};
  const monthKeys: string[] = Array.isArray(derived.monthsConsidered) ? derived.monthsConsidered : [];

  return {
    accountNumber: figures.accountNumber,
    borrowers,
    computedAt: figures.computedAt,
    ageDays,
    periodStart: figures.periodStart,
    periodEnd: figures.periodEnd,
    transactionCount: figures.transactionCount,
    usedForScoring: fresh && active,
    notUsedBecause: !fresh
      ? `older than ${opts.maxAgeDays} days`
      : !active
        ? 'not the active account of any phone'
        : null,
    figures: BUILT_IN_FIGURES.map((f) => ({ ...f, value: num((figures as any)[f.field]) })),
    custom: customFields.map((field) => ({
      field,
      name: names.get(field) ?? field,
      value: num(figures.custom?.[field]),
      current: current && field in (figures.custom ?? {}),
    })),
    months: monthKeys.map((month, i) => ({
      month,
      income: num(derived.monthlyDepositTotals?.[i]) ?? 0,
      airtimeCount: num(derived.monthlyAirtimeCounts?.[i]) ?? 0,
      airtimeValue: num(derived.monthlyAirtimeValues?.[i]) ?? 0,
    })),
    excludedFromIncome: derived.excludedFromDeposits ?? null,
  };
}

/**
 * The saved figures for an account number, or for every account of a phone number. Newest first.
 */
export async function lookupStatementFigures(query: string): Promise<FiguresLookupResult[]> {
  const q = query.trim();
  const rows = await prisma.provisionedData.findMany({
    where: {
      uploadId: null,
      config: { name: 'ExternalCustomerInfo' },
      OR: [{ borrowerId: q }, { data: { contains: `"${q}"` } }],
    },
    select: { borrowerId: true, data: true },
  });

  const byAccount = new Map<string, { payloads: Array<Record<string, any> | null>; phones: Set<string> }>();
  for (const row of rows) {
    const payload = parseStoredPayload(row.data);
    const account = payload?.statementFigures?.accountNumber;
    if (account == null) continue;
    const acct = String(account);
    // The text search can match the number anywhere; keep the phone's own rows or this account's figures.
    if (row.borrowerId !== q && acct !== q) continue;
    const entry = byAccount.get(acct) ?? { payloads: [], phones: new Set<string>() };
    entry.payloads.push(payload);
    entry.phones.add(row.borrowerId);
    byAccount.set(acct, entry);
  }
  if (byAccount.size === 0) return [];

  const phones = Array.from(new Set(Array.from(byAccount.values()).flatMap((e) => Array.from(e.phones))));
  const activeRows = await prisma.phoneAccount.findMany({
    where: { phoneNumber: { in: phones }, isActive: true },
    select: { phoneNumber: true, accountNumber: true },
  });
  const activeOf = new Map(activeRows.map((r) => [r.phoneNumber, r.accountNumber]));
  const [settings, definitions] = await Promise.all([loadDataFetchSettings(), loadStatementParameters()]);

  const results: FiguresLookupResult[] = [];
  for (const [acct, entry] of byAccount) {
    const figures = figuresForAccount(entry.payloads, acct);
    if (!figures) continue;
    const borrowers = Array.from(entry.phones).map((phone) => ({ phone, isActiveAccount: activeOf.get(phone) === acct }));
    results.push(describeFigures(figures, borrowers, { maxAgeDays: settings.statementMaxAgeDays, definitions }));
  }
  return results.sort((a, b) => b.computedAt.localeCompare(a.computedAt));
}
