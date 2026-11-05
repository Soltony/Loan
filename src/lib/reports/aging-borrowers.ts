import type { PrismaClient } from '@prisma/client';
import { borrowerAging, overdueLoans, type AgingClass, type BorrowerAging } from './aging';
import { borrowerIdentities, phonesMatching } from './borrowers';
import { compareBy, pageOf, type Paging, type ReportPage, type ReportSort } from './params';

export const AGING_SORT_COLUMNS = [
  'daysOverdue',
  'totalOutstanding',
  'principalOutstanding',
  'loanCount',
  'provider',
] as const;
export type AgingSortColumn = (typeof AGING_SORT_COLUMNS)[number];
export const DEFAULT_AGING_SORT: ReportSort<AgingSortColumn> = { by: 'daysOverdue', dir: 'desc' };

export interface BorrowerAgingRow extends BorrowerAging {
  borrowerName: string;
  borrowerPhone: string;
  borrowerAccount: string;
}

export interface AgingBorrowersFilter {
  /** null = every provider. */
  providerId: string | null;
  /** Borrower phone, bank account or name. */
  search?: string;
  /** Only borrowers in this class (by their oldest overdue loan). */
  classification?: AgingClass | null;
  /** Borrowers in the user's branch scope; null = no restriction. */
  scope: string[] | null;
}

/** Overdue borrowers as of today, classed by their oldest overdue loan. The period does not apply. */
export async function agingBorrowersReport(
  prisma: PrismaClient,
  filter: AgingBorrowersFilter,
  paging: Paging,
  sort: ReportSort<AgingSortColumn> = DEFAULT_AGING_SORT,
): Promise<ReportPage<BorrowerAgingRow>> {
  let rows = borrowerAging(await overdueLoans(prisma, { providerId: filter.providerId, scope: filter.scope }));
  if (filter.classification) rows = rows.filter((row) => row.classification === filter.classification);
  if (filter.search) {
    const search = filter.search;
    const phones = new Set(await phonesMatching(prisma, search));
    rows = rows.filter((row) => row.borrowerId.includes(search) || phones.has(row.borrowerId));
  }

  const primary = compareBy<BorrowerAging>((row) => row[sort.by], sort.dir);
  const tiebreak = compareBy<BorrowerAging>((row) => row.borrowerId, 'asc');
  rows.sort((a, b) => primary(a, b) || tiebreak(a, b));

  const page = pageOf(rows, paging);
  const identities = await borrowerIdentities(
    prisma,
    page.data.map((row) => row.borrowerId),
  );
  return {
    ...page,
    data: page.data.map((row) => {
      const identity = identities.get(row.borrowerId);
      return {
        ...row,
        borrowerName: identity?.name ?? '',
        borrowerPhone: identity?.phone ?? row.borrowerId,
        borrowerAccount: identity?.account ?? '',
      };
    }),
  };
}
