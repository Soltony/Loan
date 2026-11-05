import type { PrismaClient } from '@prisma/client';
import { agingSummary, overdueLoans, type AgingSummary } from './aging';
import { periodFilter, type ReportPeriod } from './params';
import { scopeChunks, sumOverScope } from './scope';

export interface ProviderSummary {
  providerId: string;
  portfolioSummary: {
    /** Principal disbursed in the period, and how many loans. */
    disbursed: number;
    disbursedCount: number;
    /** Repayments received in the period. */
    repaid: number;
    /** Principal of the loans still unpaid (now), and how many. */
    outstanding: number;
    openCount: number;
  };
  /** Received in the period, per component (ledger). */
  collectionsReport: { principal: number; interest: number; servicefee: number; penalty: number; total: number };
  incomeStatement: {
    accrued: Record<string, number>;
    collected: Record<string, number>;
    net: number;
  };
  /** Principal ever disbursed, as a percentage of the provider's starting capital. */
  fundUtilization: number;
  /** Overdue loans as of today. */
  agingReport: AgingSummary;
}

/** Ledger entries of the provider in the period, summed per account category (lower-cased). */
async function ledgerTotals(
  prisma: PrismaClient,
  options: {
    providerId: string;
    period: ReportPeriod;
    scope: string[] | null;
    entryType: 'Debit' | 'Credit';
    accountTypes: string[];
    categories: string[];
  },
): Promise<Record<string, number>> {
  const date = periodFilter(options.period);
  const totals: Record<string, number> = Object.fromEntries(options.categories.map((c) => [c.toLowerCase(), 0]));
  const sums = new Map<string, number>();
  for (const chunk of scopeChunks(options.scope)) {
    const grouped = await prisma.ledgerEntry.groupBy({
      by: ['ledgerAccountId'],
      where: {
        type: options.entryType,
        journalEntry: {
          providerId: options.providerId,
          ...(date && { date }),
          ...(chunk ? { loan: { is: { borrowerId: { in: chunk } } } } : {}),
        },
        ledgerAccount: { type: { in: options.accountTypes }, category: { in: options.categories } },
      },
      _sum: { amount: true },
    });
    for (const row of grouped) sums.set(row.ledgerAccountId, (sums.get(row.ledgerAccountId) ?? 0) + (row._sum.amount || 0));
  }
  if (sums.size === 0) return totals;

  const accounts = await prisma.ledgerAccount.findMany({
    where: { id: { in: [...sums.keys()] } },
    select: { id: true, category: true },
  });
  for (const account of accounts) {
    const key = account.category.toLowerCase();
    if (key in totals) totals[key] += sums.get(account.id) ?? 0;
  }
  return totals;
}

/** Disbursed, collected, outstanding, utilization and aging of one provider. */
export async function providerSummary(
  prisma: PrismaClient,
  providerId: string,
  period: ReportPeriod,
  scope: string[] | null,
): Promise<ProviderSummary> {
  const range = periodFilter(period);
  const borrowers = (chunk: string[] | null) => (chunk ? { borrowerId: { in: chunk } } : {});
  // Failed external disbursements can be reversed internally; those loans are
  // marked REVERSED and do not count as disbursed.
  const live = (chunk: string[] | null) => ({
    product: { providerId },
    repaymentStatus: { not: 'REVERSED' },
    ...borrowers(chunk),
  });

  const [
    provider,
    disbursed,
    disbursedCount,
    everDisbursed,
    repaid,
    outstanding,
    openCount,
    collections,
    accruedIncome,
    collectedIncome,
    overdue,
  ] = await Promise.all([
    prisma.loanProvider.findUnique({ where: { id: providerId }, select: { startingCapital: true } }),
    sumOverScope(scope, async (chunk) =>
      (await prisma.loan.aggregate({ _sum: { loanAmount: true }, where: { ...live(chunk), ...(range && { disbursedDate: range }) } }))
        ._sum.loanAmount ?? 0,
    ),
    sumOverScope(scope, (chunk) => prisma.loan.count({ where: { ...live(chunk), ...(range && { disbursedDate: range }) } })),
    sumOverScope(scope, async (chunk) =>
      (await prisma.loan.aggregate({ _sum: { loanAmount: true }, where: live(chunk) }))._sum.loanAmount ?? 0,
    ),
    sumOverScope(scope, async (chunk) =>
      (
        await prisma.payment.aggregate({
          _sum: { amount: true },
          where: { loan: { product: { providerId }, ...borrowers(chunk) }, ...(range && { date: range }) },
        })
      )._sum.amount ?? 0,
    ),
    sumOverScope(scope, async (chunk) =>
      (
        await prisma.loan.aggregate({
          _sum: { loanAmount: true },
          where: { product: { providerId }, repaymentStatus: 'Unpaid', ...borrowers(chunk) },
        })
      )._sum.loanAmount ?? 0,
    ),
    sumOverScope(scope, (chunk) =>
      prisma.loan.count({ where: { product: { providerId }, repaymentStatus: 'Unpaid', ...borrowers(chunk) } }),
    ),
    ledgerTotals(prisma, {
      providerId,
      period,
      scope,
      entryType: 'Debit',
      accountTypes: ['Received'],
      categories: ['Principal', 'Interest', 'ServiceFee', 'Penalty'],
    }),
    ledgerTotals(prisma, {
      providerId,
      period,
      scope,
      entryType: 'Credit',
      accountTypes: ['Income'],
      categories: ['Interest', 'ServiceFee', 'Penalty'],
    }),
    ledgerTotals(prisma, {
      providerId,
      period,
      scope,
      entryType: 'Debit',
      accountTypes: ['Received'],
      categories: ['Interest', 'ServiceFee', 'Penalty'],
    }),
    overdueLoans(prisma, { providerId, scope }),
  ]);

  return {
    providerId,
    portfolioSummary: { disbursed, disbursedCount, repaid, outstanding, openCount },
    collectionsReport: {
      principal: collections.principal || 0,
      interest: collections.interest || 0,
      servicefee: collections.servicefee || 0,
      penalty: collections.penalty || 0,
      total: Object.values(collections).reduce((sum, value) => sum + value, 0),
    },
    incomeStatement: {
      accrued: accruedIncome,
      collected: collectedIncome,
      net: (collectedIncome.interest || 0) + (collectedIncome.servicefee || 0) + (collectedIncome.penalty || 0),
    },
    fundUtilization:
      provider && provider.startingCapital > 0 ? (everDisbursed / provider.startingCapital) * 100 : 0,
    agingReport: agingSummary(overdue),
  };
}
