

import { DashboardClient } from '@/components/admin/dashboard-client';
import { getPortfolioLedgerMetrics, getIncomeForLoanIds } from '@/lib/dashboard-metrics';
import prisma from '@/lib/prisma';
import type { LoanProvider, DashboardData } from '@/lib/types';
import { getUserFromSession } from '@/lib/user';
import { resolveBranchBorrowerIdsForUser, parseBranchCodeQueryParam } from '@/lib/branch-filter';
import { startOfToday, endOfToday, subDays } from 'date-fns';

export const dynamic = 'force-dynamic';

// `borrowerIds` scopes the dashboard to a Branch/District user's borrowers.
// `null`/`undefined` => unrestricted; `[]` => no borrowers in scope (all zeros).
async function getProviderData(providerId?: string, borrowerIds?: string[] | null): Promise<DashboardData> {
    const today = new Date();
    const startOfTodayDate = startOfToday();
    const endOfTodayDate = endOfToday();

    const providerFilter = providerId ? { product: { providerId: providerId }} : {};
    const providerWhereClause = providerId ? { id: providerId } : {};
    const borrowerFilter = borrowerIds ? { borrowerId: { in: borrowerIds } } : {};
    // Combined loan-relation filter for queries that key off `loan` (payments).
    const loanScopeFilter: any = { ...(providerId ? { product: { providerId } } : {}), ...borrowerFilter };
    const hasLoanScope = providerId != null || borrowerIds != null;

    const loans = await prisma.loan.findMany({
        where: {
            ...providerFilter,
            ...borrowerFilter,
            repaymentStatus: { not: 'REVERSED' },
        },
        select: {
            id: true,
            loanAmount: true,
            repaymentStatus: true,
            dueDate: true,
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
    
    const usersCount = borrowerIds
        ? await prisma.loan.groupBy({
            by: ['borrowerId'],
            where: { ...providerFilter, ...borrowerFilter, repaymentStatus: { not: 'REVERSED' } },
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

    const portfolioLedger = await getPortfolioLedgerMetrics(prisma, providerId, borrowerIds);
    const { totalDisbursed, receivables, collections } = portfolioLedger;
    // Capital remaining for disbursement is the live available balance, which is
    // decremented on every disbursement and incremented by revolving-fund
    // replenishments. Deriving it from startingCapital - totalDisbursed would
    // ignore replenishments and go negative once disbursements exceed the
    // original capital.
    const providerFund = providersData.reduce((acc, p) => acc + p.initialBalance, 0);

    // Branch/District: income is scoped to the in-scope loans (entry-based).
    // Otherwise income is the provider/portfolio account-balance aggregate.
    let income: { interest: number; serviceFee: number; penalty: number };
    if (borrowerIds) {
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

    const dailyDisbursementResult = await prisma.loan.aggregate({
        _sum: { loanAmount: true },
        where: {
            disbursedDate: {
                gte: startOfTodayDate,
                lt: endOfTodayDate,
            },
            repaymentStatus: { not: 'REVERSED' },
            ...providerFilter,
            ...borrowerFilter,
        },
    });

    const dailyRepaymentResult = await prisma.payment.aggregate({
        _sum: { amount: true },
        where: {
            date: {
                gte: startOfTodayDate,
                lt: endOfTodayDate,
            },
             ...(hasLoanScope ? { loan: loanScopeFilter } : {})
        }
    });

    const loanDisbursementData = await Promise.all(
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
        const active = await prisma.loan.count({ where: { productId: p.id, repaymentStatus: 'Unpaid', ...borrowerFilter } });
        const defaulted = await prisma.loan.count({ where: { productId: p.id, repaymentStatus: 'Unpaid', dueDate: { lt: new Date() }, ...borrowerFilter } });
        const total = await prisma.loan.count({ where: { productId: p.id, repaymentStatus: { not: 'REVERSED' }, ...borrowerFilter } });
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

export async function getDashboardData(userId: string, requestedBranchCode?: number | null): Promise<{
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
        const overallData = await getProviderData(undefined, borrowerIds ?? []);
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

    const overallData = await getProviderData(isSuperAdminOrAdmin ? undefined : user?.loanProvider?.id);
    
    let providerSpecificData: Record<string, DashboardData> = {};

    if (isSuperAdminOrAdmin) {
         const specificDataPromises = providers.map(p => getProviderData(p.id));
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
    searchParams?: Promise<{ branch?: string }>;
}) {
    const user = await getUserFromSession();
    if (!user) {
        return <div>Not authenticated</div>;
    }

    const sp = (await searchParams) ?? {};
    const requestedBranch = parseBranchCodeQueryParam(sp.branch);

    const data = await getDashboardData(user.id, requestedBranch);
    if (!data) {
        return <div>Loading dashboard...</div>;
    }

    return <DashboardClient dashboardData={data} />;
}
