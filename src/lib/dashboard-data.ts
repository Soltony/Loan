import type { Prisma } from '@prisma/client';
import { differenceInCalendarDays, endOfMonth, endOfToday, endOfYear, format, startOfToday, subDays } from 'date-fns';
import { resolveBranchBorrowerIdsForUser } from './branch-filter';
import {
  getIncomeForLoanScope,
  getOpenLoanOutstanding,
  getPortfolioLedgerMetrics,
  narrowOpenLoans,
  sumReconciledCollections,
  type OpenLoanOutstanding,
} from './dashboard-metrics';
import { parseDayEnd, parseDayStart } from './date-utils';
import prisma from './prisma';
import type { ReconciledAmounts } from './repayment-reconciliation';
import { rowsOverScope, sumOverScope } from './reports/scope';
import type { DashboardData, LoanProvider } from './types';

/**
 * The admin dashboard's figures (src/app/admin/page.tsx and /admin/dashboard).
 *
 * The page renders on the server before anything appears, so this is what the
 * user waits on after signing in. The per-loan work — every loan of the view,
 * what open loans still owe, and the restated repayments — is read once for
 * the widest view and each provider's view is cut from it in memory; the rest
 * are a few aggregate queries per view, run side by side.
 */

/** Month/year window the user picked, applied to loans by disbursement date. */
export interface DashboardRange {
  gte: Date;
  lte: Date;
}

const LOAN_SELECT = {
  id: true,
  loanAmount: true,
  repaymentStatus: true,
  dueDate: true,
  disbursedDate: true,
  borrowerId: true,
  productId: true,
  product: { select: { id: true, name: true, providerId: true } },
} satisfies Prisma.LoanSelect;
type DashboardLoan = Prisma.LoanGetPayload<{ select: typeof LOAN_SELECT }>;

/** The per-loan data of a view: its loans and what the open ones still owe. */
interface DashboardBase {
  loans: DashboardLoan[];
  openLoans: OpenLoanOutstanding;
}

interface DashboardView {
  /** Unset: every provider. */
  providerId?: string;
  /** Branch/District scope: null = none, [] = no borrowers in scope. */
  borrowerIds: string[] | null;
  range: DashboardRange | null;
  day: DashboardRange | null;
  base: DashboardBase;
  /** Restated repayments per loan, shared by the views of one request. */
  reconciled: Map<string, ReconciledAmounts>;
}

/**
 * Buckets range-filtered loans into the disbursement chart series: one bar per
 * day for windows up to 31 days, one per month beyond that, so a long range
 * doesn't render hundreds of unreadable bars.
 */
function bucketDisbursements(
  loans: { loanAmount: number; disbursedDate: Date | null }[],
  range: DashboardRange,
): { name: string; amount: number }[] {
  const byMonth = differenceInCalendarDays(range.lte, range.gte) > 31;
  const keyOf = (date: Date) => (byMonth ? format(date, 'yyyy-MM') : format(date, 'yyyy-MM-dd'));
  const labelOf = (date: Date) => (byMonth ? format(date, 'MMM yyyy') : format(date, 'MMM d'));

  // Seed every bucket in the window so gaps show as zero rather than vanishing.
  const buckets = new Map<string, { name: string; amount: number }>();
  const cursor = new Date(range.gte.getFullYear(), range.gte.getMonth(), byMonth ? 1 : range.gte.getDate());
  while (cursor <= range.lte) {
    buckets.set(keyOf(cursor), { name: labelOf(cursor), amount: 0 });
    if (byMonth) cursor.setMonth(cursor.getMonth() + 1);
    else cursor.setDate(cursor.getDate() + 1);
  }

  for (const loan of loans) {
    if (!loan.disbursedDate) continue;
    const bucket = buckets.get(keyOf(new Date(loan.disbursedDate)));
    if (bucket) bucket.amount += loan.loanAmount;
  }

  return Array.from(buckets.values());
}

/** The view's non-reversed loans (disbursed in the range, if any) and what the open ones owe. */
async function loadBase(
  providerId: string | undefined,
  borrowerIds: string[] | null,
  range: DashboardRange | null,
  reconciled: Map<string, ReconciledAmounts>,
): Promise<DashboardBase> {
  const [loans, openLoans] = await Promise.all([
    rowsOverScope(borrowerIds, (chunk) =>
      prisma.loan.findMany({
        where: {
          repaymentStatus: { not: 'REVERSED' },
          ...(providerId ? { product: { providerId } } : {}),
          ...(chunk ? { borrowerId: { in: chunk } } : {}),
          ...(range ? { disbursedDate: { gte: range.gte, lte: range.lte } } : {}),
        },
        select: LOAN_SELECT,
      }),
    ).then(async (rows) => {
      // Restate every loan's repayments once (alongside the open-loan read);
      // the provider views read the cache.
      await sumReconciledCollections(
        prisma,
        rows.map((l) => l.id),
        reconciled,
      );
      return rows;
    }),
    getOpenLoanOutstanding(prisma, { providerId, borrowerIds, disbursedRange: range }),
  ]);
  return { loans, openLoans };
}

/** One provider's share of an all-provider base. */
function narrowBase(base: DashboardBase, providerId: string): DashboardBase {
  return {
    loans: base.loans.filter((loan) => loan.product.providerId === providerId),
    openLoans: narrowOpenLoans(base.openLoans, providerId),
  };
}

// `borrowerIds` scopes the dashboard to a Branch/District user's borrowers.
// `range` narrows every flow metric to loans disbursed inside the window; the
// capital cards (Initial Fund / Provider Fund) stay point-in-time by nature.
// `day` only retargets the two daily cards, which default to today.
async function getViewData(view: DashboardView): Promise<DashboardData> {
  const { providerId, borrowerIds, range, day } = view;
  const { loans, openLoans } = view.base;
  const startOfTodayDate = startOfToday();
  const now = new Date();

  const providerFilter = providerId ? { product: { providerId } } : {};
  // The two "daily" cards follow the day picker first, then the selected
  // period, and fall back to today. The client relabels them to match.
  const flowWindow = day ?? range ?? { gte: startOfTodayDate, lte: endOfToday() };
  // Repayments belong to the period they were received in, whenever the loan
  // behind them was disbursed: no range filter here.
  const hasLoanScope = providerId != null || borrowerIds != null;

  const [usersCount, providersData, portfolioLedger, collected, income, dailyDisbursement, dailyRepayments, allProducts] =
    await Promise.all([
      // Every borrower on file for the unscoped view; otherwise those with a loan in view.
      borrowerIds || range || providerId
        ? Promise.resolve(new Set(loans.map((l) => l.borrowerId)).size)
        : prisma.borrower.count(),
      prisma.loanProvider.findMany({
        where: providerId ? { id: providerId } : {},
        select: { startingCapital: true, initialBalance: true },
      }),
      getPortfolioLedgerMetrics(prisma, providerId, borrowerIds, range),
      // The Repayments and Collections tabs report the same restated figures, and
      // Principal Receivable + Principal Received = Total Disbursed.
      sumReconciledCollections(
        prisma,
        loans.map((l) => l.id),
        view.reconciled,
      ),
      // Branch/District (and any date-scoped view): income is scoped to the
      // in-scope loans (entry-based), since account balances are all-time only.
      borrowerIds || range
        ? getIncomeForLoanScope(prisma, { providerId, borrowerIds, disbursedRange: range })
        : prisma.ledgerAccount
            .findMany({ where: { type: 'Income', ...(providerId ? { providerId } : {}) } })
            .then((accounts) => {
              const balance = (category: string) =>
                accounts.filter((a) => a.category === category).reduce((sum, a) => sum + a.balance, 0);
              return { interest: balance('Interest'), serviceFee: balance('ServiceFee'), penalty: balance('Penalty') };
            }),
      sumOverScope(borrowerIds, async (chunk) => {
        const result = await prisma.loan.aggregate({
          _sum: { loanAmount: true },
          where: {
            disbursedDate: flowWindow,
            repaymentStatus: { not: 'REVERSED' },
            ...providerFilter,
            ...(chunk ? { borrowerId: { in: chunk } } : {}),
          },
        });
        return result._sum.loanAmount || 0;
      }),
      sumOverScope(borrowerIds, async (chunk) => {
        const result = await prisma.payment.aggregate({
          _sum: { amount: true },
          where: {
            date: flowWindow,
            ...(hasLoanScope ? { loan: { ...providerFilter, ...(chunk ? { borrowerId: { in: chunk } } : {}) } } : {}),
          },
        });
        return result._sum.amount || 0;
      }),
      prisma.loanProduct.findMany({
        where: providerId ? { providerId } : {},
        select: { id: true, name: true, provider: { select: { name: true } } },
      }),
    ]);

  const totalStartingCapital = providersData.reduce((acc, p) => acc + p.startingCapital, 0);
  // Capital remaining for disbursement is the live available balance, which is
  // decremented on every disbursement and incremented by revolving-fund
  // replenishments. Deriving it from startingCapital - totalDisbursed would
  // ignore replenishments and go negative once disbursements exceed the
  // original capital.
  const providerFund = providersData.reduce((acc, p) => acc + p.initialBalance, 0);

  // What open loans still owe, computed the way the loans report computes it.
  // Tax payable stays on the ledger: it is inclusive tax withheld at
  // disbursement and owed onward, not a balance borrowers owe.
  const receivables = { ...openLoans.receivables, tax: portfolioLedger.receivables.tax };
  const collections = {
    principal: collected.principal,
    interest: collected.interest,
    serviceFee: collected.serviceFee,
    penalty: collected.penalty,
    // Tax Paid card: tax collected plus tax transferred out, from the ledger.
    tax: portfolioLedger.collections.tax,
  };

  // A loan is open while it still owes something, whatever its status flag says.
  const openLoanIds = new Set(openLoans.loans.map((l) => l.id));
  const totalLoans = loans.length;
  const paidLoans = loans.filter((l) => !openLoanIds.has(l.id)).length;
  const repaymentRate = totalLoans > 0 ? (paidLoans / totalLoans) * 100 : 0;
  const atRiskLoans = loans.filter((l) => openLoanIds.has(l.id) && new Date(l.dueDate) < now).length;
  const unpaidCount = loans.filter((l) => openLoanIds.has(l.id) && new Date(l.dueDate) >= now).length;

  // With a range the loans are bucketed daily or monthly; without one, the
  // last 7 days (the loans in view are then not date-limited).
  const loanDisbursementData = range
    ? bucketDisbursements(loans, range)
    : Array.from({ length: 7 }, (_, i) => {
        const date = subDays(startOfTodayDate, 6 - i);
        const nextDate = subDays(startOfTodayDate, 5 - i);
        const amount = loans
          .filter((l) => l.disbursedDate >= date && l.disbursedDate < nextDate)
          .reduce((sum, l) => sum + l.loanAmount, 0);
        return { name: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), amount };
      });

  const recentActivity = [...loans]
    .sort((a, b) => b.disbursedDate.getTime() - a.disbursedDate.getTime())
    .slice(0, 5)
    .map((l) => ({
      id: l.id,
      customer: `Borrower #${l.borrowerId.substring(0, 8)}...`,
      product: l.product.name,
      status: l.repaymentStatus,
      amount: l.loanAmount,
    }));

  const loansPerProduct = new Map<string, number>();
  for (const loan of loans) loansPerProduct.set(loan.productId, (loansPerProduct.get(loan.productId) ?? 0) + 1);
  const productOverview = allProducts.map((p) => {
    const openForProduct = openLoans.loans.filter((l) => l.productId === p.id);
    // Past due and still owing, as a share of every loan the product issued.
    const defaulted = openForProduct.filter((l) => new Date(l.dueDate) < now).length;
    const total = loansPerProduct.get(p.id) ?? 0;
    return {
      name: p.name,
      provider: p.provider.name,
      active: openForProduct.length,
      defaulted,
      total,
      defaultRate: total > 0 ? (defaulted / total) * 100 : 0,
    };
  });

  return {
    totalLoans,
    totalDisbursed: portfolioLedger.totalDisbursed,
    dailyDisbursement,
    dailyRepayments,
    repaymentRate,
    atRiskLoans,
    totalUsers: usersCount,
    loanDisbursementData,
    loanStatusData: [
      { name: 'Paid', value: paidLoans },
      { name: 'Active (Unpaid)', value: unpaidCount },
      { name: 'Overdue', value: atRiskLoans },
    ],
    recentActivity,
    productOverview,
    initialFund: totalStartingCapital,
    providerFund,
    receivables,
    collections,
    income,
  };
}

/**
 * Reads the `month`/`year` query params into a range. The year is what makes a
 * period: a year on its own covers the whole year, a month narrows it. A month
 * without a year is ignored, since it has nothing to anchor to.
 * `month` is 0-based, matching `Date`.
 */
export function parseDashboardPeriod(month?: string | null, year?: string | null): DashboardRange | null {
  const yearNum = Number(year);
  if (!year || !Number.isInteger(yearNum) || yearNum < 1970 || yearNum > 9999) {
    return null;
  }

  const monthNum = Number(month);
  const hasMonth = !!month && Number.isInteger(monthNum) && monthNum >= 0 && monthNum <= 11;

  const gte = new Date(yearNum, hasMonth ? monthNum : 0, 1);
  return { gte, lte: hasMonth ? endOfMonth(gte) : endOfYear(gte) };
}

/** Reads the `day` query param (`yyyy-MM-dd`) into a single-day window. */
export function parseDashboardDay(day?: string | null): DashboardRange | null {
  const gte = parseDayStart(day);
  const lte = parseDayEnd(day);
  if (!gte || !lte) return null;
  return { gte, lte };
}

export async function getDashboardData(
  userId: string,
  requestedBranchCode?: number | null,
  range: DashboardRange | null = null,
  day: DashboardRange | null = null,
): Promise<{
  providers: LoanProvider[];
  overallData: DashboardData;
  providerSpecificData: Record<string, DashboardData>;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      roleId: true,
      loanProviderId: true,
      branchCode: true,
      managedBranchCodes: true,
      role: { select: { id: true, name: true } },
      loanProvider: {
        select: { id: true, name: true, displayOrder: true, startingCapital: true, initialBalance: true },
      },
    },
  });

  const roleName = user?.role?.name;
  const isSuperAdminOrAdmin = roleName === 'Super Admin' || roleName === 'Admin';
  const reconciled = new Map<string, ReconciledAmounts>();

  // Branch/District users see a single dashboard scoped to their branch
  // borrowers (District optionally narrowed to one managed branch).
  if (roleName === 'Branch' || roleName === 'District') {
    const borrowerIds =
      (await resolveBranchBorrowerIdsForUser(
        {
          role: roleName,
          branchCode: user?.branchCode ?? null,
          managedBranchCodes: user?.managedBranchCodes ?? null,
        },
        requestedBranchCode ?? null,
      )) ?? [];
    const base = await loadBase(undefined, borrowerIds, range, reconciled);
    const overallData = await getViewData({ borrowerIds, range, day, base, reconciled });
    return { providers: [], overallData, providerSpecificData: {} };
  }

  // For non-admins, their own provider (or none).
  const providers = isSuperAdminOrAdmin
    ? await prisma.loanProvider.findMany({
        select: { id: true, name: true, displayOrder: true, startingCapital: true, initialBalance: true },
      })
    : user?.loanProvider
      ? [user.loanProvider]
      : [];

  // The overall view reads every loan once; each provider's view is cut from it.
  const overallProvider = isSuperAdminOrAdmin ? undefined : user?.loanProvider?.id;
  const base = await loadBase(overallProvider, null, range, reconciled);
  const [overallData, ...perProvider] = await Promise.all([
    getViewData({ providerId: overallProvider, borrowerIds: null, range, day, base, reconciled }),
    ...(isSuperAdminOrAdmin
      ? providers.map((p) =>
          getViewData({ providerId: p.id, borrowerIds: null, range, day, base: narrowBase(base, p.id), reconciled }),
        )
      : []),
  ]);

  const providerSpecificData: Record<string, DashboardData> = {};
  if (isSuperAdminOrAdmin) {
    providers.forEach((p, index) => {
      providerSpecificData[p.id] = perProvider[index];
    });
  } else if (user?.loanProvider) {
    providerSpecificData[user.loanProvider.id] = overallData;
  }

  return {
    providers: providers as unknown as LoanProvider[],
    overallData,
    providerSpecificData,
  };
}
