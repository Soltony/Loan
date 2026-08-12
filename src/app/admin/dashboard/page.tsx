

import { DashboardClient } from '@/components/admin/dashboard-client';
import { getPortfolioLedgerMetrics, getIncomeForLoanIds } from '@/lib/dashboard-metrics';
import prisma from '@/lib/prisma';
import type { LoanProvider, DashboardData } from '@/lib/types';
import { getUserFromSession } from '@/lib/user';
import { resolveBranchBorrowerIdsForUser, parseBranchCodeQueryParam } from '@/lib/branch-filter';
import { parseDayStart, parseDayEnd } from '@/lib/date-utils';
import { startOfToday, endOfToday, subDays, differenceInCalendarDays, endOfMonth, endOfYear, format } from 'date-fns';

export const dynamic = 'force-dynamic';

/** Month/year window the user picked, applied to loans by disbursement date. */
export interface DashboardRange {
    gte: Date;
    lte: Date;
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

// `borrowerIds` scopes the dashboard to a Branch/District user's borrowers.
// `null`/`undefined` => unrestricted; `[]` => no borrowers in scope (all zeros).
// `range` narrows every flow metric to loans disbursed inside the window; the
// capital cards (Initial Fund / Provider Fund) stay point-in-time by nature.
// `day` only retargets the two daily cards, which default to today.
async function getProviderData(providerId?: string, borrowerIds?: string[] | null, range?: DashboardRange | null, day?: DashboardRange | null): Promise<DashboardData> {
    const today = new Date();
    const startOfTodayDate = startOfToday();
    const endOfTodayDate = endOfToday();

    const providerFilter = providerId ? { product: { providerId: providerId }} : {};
    const providerWhereClause = providerId ? { id: providerId } : {};
    const borrowerFilter = borrowerIds ? { borrowerId: { in: borrowerIds } } : {};
    // Loans are attributed to a period by when they were disbursed.
    const rangeFilter = range ? { disbursedDate: { gte: range.gte, lte: range.lte } } : {};
    // Combined loan-relation filter for queries that key off `loan` (payments).
    // Deliberately without `rangeFilter`: a repayment belongs to the period it
    // was received in, whenever the loan behind it happened to be disbursed.
    const loanScopeFilter: any = { ...(providerId ? { product: { providerId } } : {}), ...borrowerFilter };
    const hasLoanScope = providerId != null || borrowerIds != null;

    const loans = await prisma.loan.findMany({
        where: {
            ...providerFilter,
            ...borrowerFilter,
            ...rangeFilter,
            repaymentStatus: { not: 'REVERSED' },
        },
        select: {
            id: true,
            loanAmount: true,
            repaymentStatus: true,
            dueDate: true,
            disbursedDate: true,
            borrowerId: true,
            productId: true,
            product: {
                select: {
                    id: true,
                    name: true,
                    providerId: true,
                }
            }
        }
    });

    const usersCount = borrowerIds || range
        ? await prisma.loan.groupBy({
            by: ['borrowerId'],
            where: { ...providerFilter, ...borrowerFilter, ...rangeFilter, repaymentStatus: { not: 'REVERSED' } },
          }).then(results => results.length)
        : providerId
        ? await prisma.loan.groupBy({
            by: ['borrowerId'],
                        where: { product: { providerId: providerId }, repaymentStatus: { not: 'REVERSED' } },
          }).then(results => results.length)
        : await prisma.borrower.count();

    const providersData = await prisma.loanProvider.findMany({
        where: providerWhereClause,
    });
    
    const totalStartingCapital = providersData.reduce((acc, p) => acc + p.startingCapital, 0);

    const portfolioLedger = await getPortfolioLedgerMetrics(prisma, providerId, borrowerIds, range);
    const { totalDisbursed, receivables, collections } = portfolioLedger;
    // Capital remaining for disbursement is the live available balance, which is
    // decremented on every disbursement and incremented by revolving-fund
    // replenishments. Deriving it from startingCapital - totalDisbursed would
    // ignore replenishments and go negative once disbursements exceed the
    // original capital.
    const providerFund = providersData.reduce((acc, p) => acc + p.initialBalance, 0);

    // Branch/District (and any date-scoped view): income is scoped to the
    // in-scope loans (entry-based), since account balances are all-time only.
    let income: { interest: number; serviceFee: number; penalty: number };
    if (borrowerIds || range) {
        income = await getIncomeForLoanIds(prisma, loans.map((l) => l.id));
    } else {
        const allLedgerAccounts = await prisma.ledgerAccount.findMany({
            where: providerId ? { providerId } : {},
        });
        const aggregateLedgerBalance = (type: string, category?: string) =>
            allLedgerAccounts
                .filter((acc) => acc.type === type && (category ? acc.category === category : true))
                .reduce((sum, acc) => sum + acc.balance, 0);
        income = {
            interest: aggregateLedgerBalance('Income', 'Interest'),
            serviceFee: aggregateLedgerBalance('Income', 'ServiceFee'),
            penalty: aggregateLedgerBalance('Income', 'Penalty'),
        };
    }
    const totalLoans = loans.length;
    const paidLoans = loans.filter(l => l.repaymentStatus === 'Paid').length;
    const repaymentRate = totalLoans > 0 ? (paidLoans / totalLoans) * 100 : 0;
    const atRiskLoans = loans.filter(l => l.repaymentStatus === 'Unpaid' && new Date(l.dueDate) < new Date()).length;

    // The two "daily" cards follow the day picker first, then the selected
    // period, and fall back to today. The client relabels them to match.
    const flowWindow = day ?? range ?? { gte: startOfTodayDate, lte: endOfTodayDate };

    const dailyDisbursementResult = await prisma.loan.aggregate({
        _sum: { loanAmount: true },
        where: {
            disbursedDate: flowWindow,
            repaymentStatus: { not: 'REVERSED' },
            ...providerFilter,
            ...borrowerFilter,
        },
    });

    const dailyRepaymentResult = await prisma.payment.aggregate({
        _sum: { amount: true },
        where: {
            date: flowWindow,
             ...(hasLoanScope ? { loan: loanScopeFilter } : {})
        }
    });

    // Without a range this is the last 7 days. With one, the already-fetched
    // (range-filtered) loans are bucketed in memory — daily for short windows,
    // monthly for longer ones — so no extra queries are needed.
    const loanDisbursementData = range
        ? bucketDisbursements(loans, range)
        : await Promise.all(
            Array.from({ length: 7 }).map(async (_, i) => {
                const date = subDays(startOfTodayDate, 6 - i);
                const nextDate = subDays(startOfTodayDate, 5 - i);
                const amount = await prisma.loan.aggregate({
                    _sum: { loanAmount: true },
                    where: {
                        disbursedDate: {
                            gte: date,
                            lt: nextDate,
                        },
                        repaymentStatus: { not: 'REVERSED' },
                        ...providerFilter,
                        ...borrowerFilter,
                    },
                });
                return {
                    name: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                    amount: amount._sum.loanAmount || 0,
                };
            })
        );

    const paidCount = loans.filter(l => l.repaymentStatus === 'Paid').length;
    const unpaidCount = loans.filter(l => l.repaymentStatus === 'Unpaid' && new Date(l.dueDate) >= new Date()).length;
    const overdueCount = atRiskLoans;
    const loanStatusData = [
        { name: 'Paid', value: paidCount },
        { name: 'Active (Unpaid)', value: unpaidCount },
        { name: 'Overdue', value: overdueCount },
    ];

    const recentActivity = await prisma.loan.findMany({
        where: {
            ...providerFilter,
            ...borrowerFilter,
            ...rangeFilter,
            repaymentStatus: { not: 'REVERSED' },
        },
        take: 5,
        orderBy: { disbursedDate: 'desc' },
        select: {
            id: true,
            borrowerId: true,
            loanAmount: true,
            repaymentStatus: true,
            product: {
                select: {
                    name: true,
                }
            }
        }
    }).then(loans => loans.map(l => ({
        id: l.id,
        customer: `Borrower #${l.borrowerId.substring(0,8)}...`,
        product: l.product.name,
        status: l.repaymentStatus,
        amount: l.loanAmount,
    })));

    const allProducts = await prisma.loanProduct.findMany({
        where: providerId ? { providerId: providerId } : {},
        select: {
            id: true,
            name: true,
            providerId: true,
            provider: {
                select: {
                    id: true,
                    name: true,
                }
            },
            _count: { select: { loans: true } }
        }
    });

    const productOverview = await Promise.all(allProducts.map(async p => {
        const active = await prisma.loan.count({ where: { productId: p.id, repaymentStatus: 'Unpaid', ...borrowerFilter, ...rangeFilter } });
        const defaulted = await prisma.loan.count({ where: { productId: p.id, repaymentStatus: 'Unpaid', dueDate: { lt: new Date() }, ...borrowerFilter, ...rangeFilter } });
        const total = await prisma.loan.count({ where: { productId: p.id, repaymentStatus: { not: 'REVERSED' }, ...borrowerFilter, ...rangeFilter } });
        return {
            name: p.name,
            provider: p.provider.name,
            active,
            defaulted,
            total,
            defaultRate: total > 0 ? (defaulted / total) * 100 : 0
        };
    }));

    return {
        totalLoans,
        totalDisbursed,
        dailyDisbursement: dailyDisbursementResult._sum.loanAmount || 0,
        dailyRepayments: dailyRepaymentResult._sum.amount || 0,
        repaymentRate,
        atRiskLoans,
        totalUsers: usersCount,
        loanDisbursementData,
        loanStatusData,
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
export function parseDashboardPeriod(
    month?: string | null,
    year?: string | null,
): DashboardRange | null {
    const yearNum = Number(year);
    if (!year || !Number.isInteger(yearNum) || yearNum < 1970 || yearNum > 9999) {
        return null;
    }

    const monthNum = Number(month);
    const hasMonth =
        !!month && Number.isInteger(monthNum) && monthNum >= 0 && monthNum <= 11;

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

export async function getDashboardData(userId: string, requestedBranchCode?: number | null, range?: DashboardRange | null, day?: DashboardRange | null): Promise<{
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
            role: {
                select: {
                    id: true,
                    name: true,
                }
            },
            loanProvider: {
                select: {
                    id: true,
                    name: true,
                    displayOrder: true,
                    startingCapital: true,
                    initialBalance: true,
                }
            }
        }
    });

    const roleName = user?.role?.name;
    const isSuperAdminOrAdmin = roleName === 'Super Admin' || roleName === 'Admin';

    // Branch/District users see a single dashboard scoped to their branch
    // borrowers (District optionally narrowed to one managed branch).
    if (roleName === 'Branch' || roleName === 'District') {
        const borrowerIds = await resolveBranchBorrowerIdsForUser(
            {
                role: roleName,
                branchCode: user?.branchCode ?? null,
                managedBranchCodes: user?.managedBranchCodes ?? null,
            },
            requestedBranchCode ?? null,
        );
        const overallData = await getProviderData(undefined, borrowerIds ?? [], range, day);
        return { providers: [], overallData, providerSpecificData: {} };
    }

    // For non-admins, get their specific provider or an empty array
    const providers = isSuperAdminOrAdmin
        ? await prisma.loanProvider.findMany({
            select: {
                id: true,
                name: true,
                displayOrder: true,
                startingCapital: true,
                initialBalance: true,
            }
        })
        : (user?.loanProvider ? [user.loanProvider] : []);

    const overallData = await getProviderData(isSuperAdminOrAdmin ? undefined : user?.loanProvider?.id, null, range, day);
    
    let providerSpecificData: Record<string, DashboardData> = {};

    if (isSuperAdminOrAdmin) {
         const specificDataPromises = providers.map(p => getProviderData(p.id, null, range, day));
         const results = await Promise.all(specificDataPromises);
         results.forEach((data, index) => {
             providerSpecificData[providers[index].id] = data;
         });
    } else if (user?.loanProvider) {
        providerSpecificData[user.loanProvider.id] = overallData;
    }


    return {
        providers: providers as LoanProvider[],
        overallData: overallData,
        providerSpecificData: providerSpecificData,
    };
}


export default async function AdminDashboard({
    searchParams,
}: {
    searchParams?: Promise<{ branch?: string; month?: string; year?: string; day?: string }>;
}) {
    const user = await getUserFromSession();
    if (!user) {
        return <div>Not authenticated</div>;
    }

    const sp = (await searchParams) ?? {};
    const requestedBranch = parseBranchCodeQueryParam(sp.branch);
    const range = parseDashboardPeriod(sp.month, sp.year);
    const day = parseDashboardDay(sp.day);

    const data = await getDashboardData(user.id, requestedBranch, range, day);
    if (!data) {
        return <div>Loading dashboard...</div>;
    }

    return <DashboardClient dashboardData={data} />;
}
