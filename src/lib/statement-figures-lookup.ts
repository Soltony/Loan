import prisma from './prisma';
import { parseStoredPayload } from './customer-data-api';
import { figuresAreCurrent, figuresForAccount, type StatementFigures } from './statement-figures';
import { definitionsVersion, loadStatementParameters } from './statement-parameters';
import { loadDataFetchSettings } from './data-fetch-settings';
import type { StatementParameterDefinition } from './statement-utils';

/**
 * @fileOverview The statement figures saved for an account, and the phones they score, for the
 * "Saved Statement Figures" card in the Scoring Engine. Reads only what is saved; fetching
 * missing figures is POST /api/settings/statement-figures.
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

/** A phone the lookup is about, and the account scoring reads its figures from. */
export type BorrowerFiguresView = {
  phone: string;
  /** The phone's active account: the only account whose figures its scoring uses. */
  activeAccount: string | null;
  /** Has opened the mini-app (a borrower record exists); only then is there a limit or a fetch. */
  isBorrower: boolean;
  /** Figures are saved for the active account. */
  figuresSaved: boolean;
  /** Fetching would get new figures: none are saved, or they are past the refresh interval, or
   *  were worked out with statement parameters or a number of months that changed since. */
  refetch: boolean;
};

/** One active product's answer for a phone: what the mini-app shows the customer. */
export type ProductLimit = {
  providerId: string;
  providerName: string;
  productId: string;
  productName: string;
  isSalaryAdvance: boolean;
  isEligible: boolean;
  score: number;
  /** What the customer may borrow now; 0 when not eligible. */
  limit: number;
  reason: string;
};

/** The answer of GET /api/settings/statement-figures. */
export type FiguresLookupResponse = {
  query: string;
  results: FiguresLookupResult[];
  /** `limits` is null for a phone that has not opened the mini-app. */
  borrowers: Array<BorrowerFiguresView & { limits: ProductLimit[] | null }>;
  /** Whether statements can be fetched at all (statementFiguresEnabled). */
  canFetch: boolean;
  withoutBalances: boolean;
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

type SavedByAccount = Map<string, { payloads: Array<Record<string, any> | null>; phones: Set<string> }>;

/**
 * The saved figures matching a query, by account: those of the account looked up, under whichever
 * phone they are saved, or those in the customer info of the phone looked up.
 */
async function savedFigures(q: string): Promise<SavedByAccount> {
  const rows = await prisma.provisionedData.findMany({
    where: {
      uploadId: null,
      config: { name: 'ExternalCustomerInfo' },
      OR: [{ borrowerId: q }, { data: { contains: `"${q}"` } }],
    },
    select: { borrowerId: true, data: true },
  });

  const byAccount: SavedByAccount = new Map();
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
  return byAccount;
}

/** The newest figures of each account as the card shows them, newest first. */
async function describeSaved(byAccount: SavedByAccount, now: number): Promise<FiguresLookupResult[]> {
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
    results.push(describeFigures(figures, borrowers, { maxAgeDays: settings.statementMaxAgeDays, definitions, now }));
  }
  return results.sort((a, b) => b.computedAt.localeCompare(a.computedAt));
}

/**
 * What the card shows for an account number or a phone number.
 *
 * `results`: the saved figures, newest first - for an account, the newest saved under any phone;
 * for a phone, those in its customer info and, for its active account, the newest saved under any
 * phone: scoring reads those (getBorrowerDataForScoring), so a changed phone number keeps them.
 *
 * `borrowers`: the phones looked up - the phone itself, or every phone whose active account is the
 * account looked up - and whether figures are saved for that active account. A phone whose active
 * account is another one is left out: its figures and limit come from that account.
 */
export async function lookupStatementFigures(
  query: string,
  now = Date.now()
): Promise<{ results: FiguresLookupResult[]; borrowers: BorrowerFiguresView[] }> {
  const q = query.trim();
  const [saved, links, borrower] = await Promise.all([
    savedFigures(q),
    prisma.phoneAccount.findMany({
      where: { OR: [{ phoneNumber: q }, { accountNumber: q, isActive: true }] },
      select: { phoneNumber: true },
    }),
    prisma.borrower.findUnique({ where: { id: q }, select: { id: true } }),
  ]);
  const phones = Array.from(new Set([...(borrower ? [q] : []), ...links.map((l) => l.phoneNumber)]));

  const borrowers: BorrowerFiguresView[] = [];
  if (phones.length > 0) {
    const [activeRows, borrowerRows, settings, definitions] = await Promise.all([
      prisma.phoneAccount.findMany({
        where: { phoneNumber: { in: phones }, isActive: true },
        select: { phoneNumber: true, accountNumber: true },
      }),
      prisma.borrower.findMany({ where: { id: { in: phones } }, select: { id: true } }),
      loadDataFetchSettings(),
      loadStatementParameters(),
    ]);
    const activeOf = new Map<string, string>();
    for (const row of activeRows) {
      if (!activeOf.has(row.phoneNumber)) activeOf.set(row.phoneNumber, row.accountNumber.trim());
    }
    for (const acct of new Set(activeOf.values())) {
      if (acct === q) continue; // searched by this account already
      const underAnyPhone = (await savedFigures(acct)).get(acct);
      if (underAnyPhone) saved.set(acct, underAnyPhone);
    }

    const registered = new Set(borrowerRows.map((b) => b.id));
    const version = definitionsVersion(definitions);
    for (const phone of phones) {
      const activeAccount = activeOf.get(phone) ?? null;
      const entry = activeAccount ? saved.get(activeAccount) : undefined;
      const figures = activeAccount && entry ? figuresForAccount(entry.payloads, activeAccount) : null;
      borrowers.push({
        phone,
        activeAccount,
        isBorrower: registered.has(phone),
        figuresSaved: figures !== null,
        refetch: !figuresAreCurrent(figures, settings, version, now),
      });
    }
  }
  return { results: await describeSaved(saved, now), borrowers };
}
