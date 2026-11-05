import type { Prisma, PrismaClient } from '@prisma/client';
import { calculateOutstandingBreakdown } from '../loan-calculator';
import {
  borrowerIdentities,
  loanReportStatus,
  loanSearchWhere,
  loanStatusWhere,
  type LoanReportStatus,
  type LoanStatusFilter,
} from './borrowers';
import {
  compareBy,
  periodFilter,
  reportPage,
  skipOf,
  type Paging,
  type ReportPage,
  type ReportPeriod,
  type ReportSort,
} from './params';
import { asCalculatorLoan, asCalculatorProduct, PRODUCT_TERMS, PROVIDER_NAME } from './product';
import { pageWithinScope } from './scope';

export const LOAN_SORT_COLUMNS = ['provider', 'disbursedDate', 'dueDate', 'principalDisbursed'] as const;
export type LoanSortColumn = (typeof LOAN_SORT_COLUMNS)[number];
export const DEFAULT_LOAN_SORT: ReportSort<LoanSortColumn> = { by: 'disbursedDate', dir: 'desc' };

function loanOrder(sort: ReportSort<LoanSortColumn>): Prisma.LoanOrderByWithRelationInput {
  switch (sort.by) {
    case 'provider':
      return { product: { provider: { name: sort.dir } } };
    case 'dueDate':
      return { dueDate: sort.dir };
    case 'principalDisbursed':
      return { loanAmount: sort.dir };
    default:
      return { disbursedDate: sort.dir };
  }
}

interface LoanKey {
  id: string;
  disbursedDate: Date;
  dueDate: Date;
  loanAmount: number;
  product: { provider: { name: string } };
}

/** The order loanOrder gives, for a scope paged outside the database. */
function compareLoanKeys(sort: ReportSort<LoanSortColumn>) {
  const primary = compareBy<LoanKey>((k) => {
    switch (sort.by) {
      case 'provider':
        return k.product.provider.name;
      case 'dueDate':
        return k.dueDate.getTime();
      case 'principalDisbursed':
        return k.loanAmount;
      default:
        return k.disbursedDate.getTime();
    }
  }, sort.dir);
  const tiebreak = compareBy<LoanKey>((k) => k.id, 'desc');
  return (a: LoanKey, b: LoanKey) => primary(a, b) || tiebreak(a, b);
}

export interface LoanReportFilter {
  /** null = every provider. */
  providerId: string | null;
  /** Disbursement date. */
  period: ReportPeriod;
  /** Borrower phone, bank account, name or loan id. */
  search?: string;
  status?: LoanStatusFilter | null;
  /** Borrowers in the user's branch scope; null = no restriction. */
  scope: string[] | null;
}

export interface LoanReportRow {
  provider: string;
  loanId: string;
  borrowerId: string;
  /** Empty when no source has the borrower's name. */
  borrowerName: string;
  borrowerPhone: string;
  borrowerAccount: string;
  disbursedDate: Date;
  dueDate: Date;
  principalDisbursed: number;
  principalOutstanding: number;
  interestOutstanding: number;
  serviceFeeOutstanding: number;
  penaltyOutstanding: number;
  totalOutstanding: number;
  status: LoanReportStatus;
  daysInArrears: number;
}

const LOAN_INCLUDE = {
  product: { select: { ...PRODUCT_TERMS, provider: PROVIDER_NAME } },
  payments: { select: { amount: true, date: true }, orderBy: { date: 'desc' } },
  // Per-installment penalty products owe what the repayment flows charge.
  installments: { orderBy: { installmentNumber: 'asc' } },
} satisfies Prisma.LoanInclude;

/** The loan book (Provider Loans and Borrower Performance), one page at a time. */
export async function loansReport(
  prisma: PrismaClient,
  filter: LoanReportFilter,
  paging: Paging,
  sort: ReportSort<LoanSortColumn> = DEFAULT_LOAN_SORT,
): Promise<ReportPage<LoanReportRow>> {
  const now = new Date();
  // Failed external disbursements can be reversed internally; those loans are
  // marked REVERSED and are not reported.
  const conditions: Prisma.LoanWhereInput[] = [{ repaymentStatus: { not: 'REVERSED' } }];
  const disbursed = periodFilter(filter.period);
  if (disbursed) conditions.push({ disbursedDate: disbursed });
  if (filter.providerId) conditions.push({ product: { providerId: filter.providerId } });
  if (filter.status) conditions.push(loanStatusWhere(filter.status, now));
  if (filter.search) conditions.push(await loanSearchWhere(prisma, filter.search));
  const where = (borrowerIds: string[] | null): Prisma.LoanWhereInput => ({
    AND: borrowerIds ? [...conditions, { borrowerId: { in: borrowerIds } }] : conditions,
  });
  // The id tiebreaker keeps skip/take paging deterministic when many loans
  // share a disbursement date.
  const orderBy = [loanOrder(sort), { id: 'desc' as const }];

  const [{ total, rows: loans }, taxConfigs] = await Promise.all([
    pageWithinScope({
      scope: filter.scope,
      paging,
      direct: async (borrowerIds) => {
        const [count, rows] = await Promise.all([
          prisma.loan.count({ where: where(borrowerIds) }),
          prisma.loan.findMany({
            where: where(borrowerIds),
            include: LOAN_INCLUDE,
            orderBy,
            skip: skipOf(paging),
            take: paging.pageSize,
          }),
        ]);
        return { total: count, rows };
      },
      keysIn: (borrowerIds) =>
        prisma.loan.findMany({
          where: where(borrowerIds),
          select: {
            id: true,
            disbursedDate: true,
            dueDate: true,
            loanAmount: true,
            product: { select: { provider: { select: { name: true } } } },
          },
        }),
      compare: compareLoanKeys(sort),
      rowsById: (ids) => prisma.loan.findMany({ where: { id: { in: ids } }, include: LOAN_INCLUDE }),
      idOf: (loan) => loan.id,
    }),
    prisma.tax.findMany(),
  ]);

  const identities = await borrowerIdentities(
    prisma,
    loans.map((loan) => loan.borrowerId),
  );

  const rows = loans.map((loan): LoanReportRow => {
    // A paid loan is valued as of its last repayment, so the charges it had
    // run up by then are what it is measured against.
    const asOf =
      loan.repaymentStatus === 'Paid' && loan.payments.length > 0 ? new Date(loan.payments[0].date) : now;
    const outstanding = calculateOutstandingBreakdown(asCalculatorLoan(loan), asCalculatorProduct(loan.product), taxConfigs, asOf);
    const { status, daysInArrears } = loanReportStatus(loan, now, outstanding.total);
    // A paid loan owes nothing: every column is zero, the total included, so
    // the export never sums phantom balances from settled loans.
    const owes = status !== 'Paid';
    const identity = identities.get(loan.borrowerId);
    return {
      provider: loan.product.provider.name,
      loanId: loan.id,
      borrowerId: loan.borrowerId,
      borrowerName: identity?.name ?? '',
      borrowerPhone: identity?.phone ?? loan.borrowerId,
      borrowerAccount: identity?.account ?? '',
      disbursedDate: loan.disbursedDate,
      dueDate: loan.dueDate,
      principalDisbursed: loan.loanAmount,
      principalOutstanding: owes ? outstanding.principal : 0,
      interestOutstanding: owes ? outstanding.interest : 0,
      serviceFeeOutstanding: owes ? outstanding.serviceFee : 0,
      penaltyOutstanding: owes ? outstanding.penalty : 0,
      totalOutstanding: owes ? outstanding.total : 0,
      status,
      daysInArrears,
    };
  });

  return reportPage(rows, total, paging);
}
