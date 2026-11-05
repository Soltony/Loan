import type { Prisma, PrismaClient } from '@prisma/client';
import { buildOutstandingSeries, outstandingAt } from '../collections-outstanding';
import { reconcileRepaymentsForLoans } from '../repayment-reconciliation-data';
import { compareBy, inPeriod, localDay, pageOf, type Paging, type ReportPage, type ReportPeriod, type ReportSort } from './params';
import { rowsOverScope } from './scope';

export const COLLECTION_SORT_COLUMNS = [
  'date',
  'provider',
  'principal',
  'interest',
  'serviceFee',
  'penalty',
  'tax',
  'unapplied',
  'total',
  'outstandingPrincipal',
  'outstandingLoans',
] as const;
export type CollectionSortColumn = (typeof COLLECTION_SORT_COLUMNS)[number];
export const DEFAULT_COLLECTION_SORT: ReportSort<CollectionSortColumn> = { by: 'date', dir: 'desc' };

export interface CollectionReportFilter {
  /** null = every provider. */
  providerId: string | null;
  /** Repayment date. */
  period: ReportPeriod;
  /** Minutes east of UTC: rows fall on the user's calendar days. */
  tzOffset: number;
  /** Borrowers in the user's branch scope; null = no restriction. */
  scope: string[] | null;
}

export interface CollectionAmounts {
  principal: number;
  interest: number;
  serviceFee: number;
  penalty: number;
  tax: number;
  unapplied: number;
  total: number;
}

export interface CollectionRow extends CollectionAmounts {
  provider: string;
  /** yyyy-MM-dd, on the user's calendar. */
  date: string;
  /** Principal still owed at the end of the day: disbursed less principal received. */
  outstandingPrincipal: number;
  /** Loans still carrying a principal balance at the end of the day. */
  outstandingLoans: number;
}

export interface CollectionsPage extends ReportPage<CollectionRow> {
  /** Every day matching the filters, not just this page. */
  totals: CollectionAmounts;
}

const zero = (): CollectionAmounts => ({
  principal: 0,
  interest: 0,
  serviceFee: 0,
  penalty: 0,
  tax: 0,
  unapplied: 0,
  total: 0,
});

/**
 * Collections per provider and day: the repayments (Payment rows) on live
 * loans, split the way the dashboard and the Repayments tab split them
 * (reconcileLoanRepayments), next to the principal those loans still owe at
 * the end of the day. Reversed loans are out — a reversal deletes their
 * Payment rows anyway. Payment.date is the repayment's journal date.
 */
export async function collectionRows(prisma: PrismaClient, filter: CollectionReportFilter): Promise<CollectionRow[]> {
  const loanWhere: Prisma.LoanWhereInput = {
    repaymentStatus: { not: 'REVERSED' },
    // A loan disbursed after the window collects nothing inside it and sits in
    // none of its end-of-day balances.
    ...(filter.period.lte ? { disbursedDate: { lte: filter.period.lte } } : {}),
    ...(filter.providerId ? { product: { providerId: filter.providerId } } : {}),
  };
  const loans = (
    await rowsOverScope(filter.scope, (borrowerIds) =>
      prisma.loan.findMany({
        where: { ...loanWhere, ...(borrowerIds ? { borrowerId: { in: borrowerIds } } : {}) },
        select: {
          id: true,
          loanAmount: true,
          disbursedDate: true,
          product: { select: { provider: { select: { name: true } } } },
        },
      }),
    )
  ).map((loan) => ({
    id: loan.id,
    provider: loan.product.provider.name,
    loanAmount: loan.loanAmount,
    disbursedDate: loan.disbursedDate,
  }));

  const dayOf = (date: Date) => localDay(date, filter.tzOffset);
  const reconciled = await reconcileRepaymentsForLoans(
    prisma,
    loans.map((l) => l.id),
  );
  const series = buildOutstandingSeries(loans, reconciled, dayOf);

  // NUL separates the parts, so a provider name holding a hyphen cannot be
  // split back apart in the wrong place.
  const byDay = new Map<string, CollectionRow>();
  for (const loan of loans) {
    for (const entry of reconciled.entriesByLoan.get(loan.id) ?? []) {
      const split = reconciled.byEntry.get(entry.id);
      const date = new Date(entry.date);
      if (!split || !inPeriod(filter.period, date)) continue;
      const day = dayOf(date);
      const key = `${loan.provider}\u0000${day}`;
      let row = byDay.get(key);
      if (!row) {
        row = { provider: loan.provider, date: day, ...zero(), outstandingPrincipal: 0, outstandingLoans: 0 };
        byDay.set(key, row);
      }
      row.principal += split.principal;
      row.interest += split.interest;
      row.serviceFee += split.serviceFee;
      row.penalty += split.penalty;
      row.tax += split.tax;
      row.unapplied += split.unapplied;
    }
  }

  return [...byDay.values()].map((row) => {
    // The balance still outstanding once the day's collections are in.
    const point = outstandingAt(series, row.provider, row.date);
    return {
      ...row,
      total: row.principal + row.interest + row.serviceFee + row.penalty + row.tax + row.unapplied,
      outstandingPrincipal: point.outstanding,
      outstandingLoans: point.loans,
    };
  });
}

/** Rows in the requested order; ties fall back to the latest day, then provider A–Z. */
export function sortCollections(rows: CollectionRow[], sort: ReportSort<CollectionSortColumn>): CollectionRow[] {
  const primary = compareBy<CollectionRow>((r) => r[sort.by], sort.dir);
  const byDay = compareBy<CollectionRow>((r) => r.date, 'desc');
  const byProvider = compareBy<CollectionRow>((r) => r.provider, 'asc');
  return [...rows].sort((a, b) => primary(a, b) || byDay(a, b) || byProvider(a, b));
}

/** The amounts added up over every row. Balances are as of a day, so they are not summed. */
export function collectionTotals(rows: CollectionRow[]): CollectionAmounts {
  const totals = zero();
  for (const row of rows) {
    for (const key of Object.keys(totals) as Array<keyof CollectionAmounts>) totals[key] += row[key];
  }
  return totals;
}

export async function collectionsReport(
  prisma: PrismaClient,
  filter: CollectionReportFilter,
  paging: Paging,
  sort: ReportSort<CollectionSortColumn> = DEFAULT_COLLECTION_SORT,
): Promise<CollectionsPage> {
  const rows = sortCollections(await collectionRows(prisma, filter), sort);
  return { ...pageOf(rows, paging), totals: collectionTotals(rows) };
}
