import { NextRequest, NextResponse } from 'next/server';
import { subDays, startOfDay } from 'date-fns';
import prisma from '@/lib/prisma';
import { parseBranchCodeQueryParam } from '@/lib/branch-filter';
import { reportBorrowerScope, reportContext } from '@/lib/reports/http';
import { localDay, periodFilter, reportPeriod, reportTzOffset } from '@/lib/reports/params';
import { scopeChunks } from '@/lib/reports/scope';

export const dynamic = 'force-dynamic';

// Hard ceiling on rows pulled for the trend series. Only two narrow columns are
// selected, and the trend window is clamped to 12 months, so this is a safety net
// rather than an expected limit.
const TREND_ROW_LIMIT = 250_000;

const AGING_BUCKETS = [
    { label: 'Pass', minDays: 0, maxDays: 29 },
    { label: 'Special Mention', minDays: 30, maxDays: 89 },
    { label: 'Substandard', minDays: 90, maxDays: 179 },
    { label: 'Doubtful', minDays: 180, maxDays: 359 },
    { label: 'Loss', minDays: 360, maxDays: Infinity },
] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

/** `yyyy-MM` moved by `months`. */
function addMonths(key: string, months: number): string {
    const [year, month] = key.split('-').map(Number);
    const index = year * 12 + (month - 1) + months;
    return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/** Every day key from `from` to `to` (`yyyy-MM-dd`, inclusive). */
function dayKeys(from: string, to: string): string[] {
    const keys: string[] = [];
    for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += DAY_MS) {
        keys.push(new Date(t).toISOString().slice(0, 10));
    }
    return keys;
}

/** Every month key from `from` to `to` (`yyyy-MM`, inclusive). */
function monthKeys(from: string, to: string): string[] {
    const keys: string[] = [];
    for (let key = from; key <= to; key = addMonths(key, 1)) keys.push(key);
    return keys;
}

/** GET /api/reports/overview — the Overall tab: KPIs, collected income, aging and the trend. `sections=summary` stops after the aging. */
export async function GET(req: NextRequest) {
    const context = await reportContext(req);
    if (context instanceof NextResponse) return context;
    const { user, params: searchParams } = context;

    const timeframe = searchParams.get('timeframe') || 'overall';
    const summaryOnly = searchParams.get('sections') === 'summary';
    const tzOffset = reportTzOffset(searchParams);

    let requestedProviderId = searchParams.get('providerId');
    // Provider-bound users are locked to their own provider regardless of the query.
    if (user.loanProviderId) {
        requestedProviderId = user.loanProviderId;
    }
    if (requestedProviderId === 'none') {
        return NextResponse.json({ error: 'No provider selected' }, { status: 400 });
    }
    // `all` (or missing) means "every provider the user is allowed to see".
    const providerId =
        requestedProviderId && requestedProviderId !== 'all' ? requestedProviderId : null;

    try {
        const requestedBranchCode = parseBranchCodeQueryParam(searchParams.get('branchCode'));
        // SQL Server caps a statement at ~2100 parameters, so borrower-id `IN` lists
        // are chunked. Sums and counts are additive and the chunks are disjoint by
        // borrowerId, so per-chunk results can simply be added together.
        const chunks = scopeChunks(await reportBorrowerScope(user, searchParams));

        const period = reportPeriod(searchParams);
        const range = periodFilter(period);

        const providerScope = providerId ? { product: { providerId } } : {};
        const loanWhere = (chunk: string[] | null, extra: Record<string, unknown> = {}) => ({
            ...providerScope,
            ...(chunk ? { borrowerId: { in: chunk } } : {}),
            ...extra,
        });
        const paymentWhere = (chunk: string[] | null, extra: Record<string, unknown> = {}) => ({
            loan: {
                // Reversed loans are excluded system-wide in the transaction reports.
                repaymentStatus: { not: 'REVERSED' },
                ...providerScope,
                ...(chunk ? { borrowerId: { in: chunk } } : {}),
            },
            ...extra,
        });

        // ---------------------------------------------------------------
        // 1. Disbursement + collection for the selected period
        // ---------------------------------------------------------------
        let disbursedAmount = 0;
        let loansDisbursed = 0;
        let uniqueBorrowers = 0;
        let collectedAmount = 0;
        let repaymentCount = 0;

        for (const chunk of chunks) {
            const disbursedWhere = loanWhere(chunk, {
                // Failed disbursements can be reversed internally; those loans are
                // marked REVERSED and must not count as disbursed.
                repaymentStatus: { not: 'REVERSED' },
                ...(range && { disbursedDate: range }),
            });

            const [disbursed, borrowerGroups, collected] = await Promise.all([
                prisma.loan.aggregate({
                    _sum: { loanAmount: true },
                    _count: { _all: true },
                    where: disbursedWhere,
                }),
                prisma.loan.groupBy({ by: ['borrowerId'], where: disbursedWhere }),
                prisma.payment.aggregate({
                    _sum: { amount: true },
                    _count: { _all: true },
                    where: paymentWhere(chunk, { ...(range && { date: range }) }),
                }),
            ]);

            disbursedAmount += disbursed._sum.loanAmount || 0;
            loansDisbursed += disbursed._count._all;
            // Chunks are disjoint by borrowerId, so group counts are additive.
            uniqueBorrowers += borrowerGroups.length;
            collectedAmount += collected._sum.amount || 0;
            repaymentCount += collected._count._all;
        }

        // ---------------------------------------------------------------
        // 2. Portfolio snapshot (as of now, not period-bound)
        // ---------------------------------------------------------------
        const today = startOfDay(new Date());
        let outstandingPrincipal = 0;
        let outstandingLoans = 0;
        let repaidOnOutstanding = 0;
        let overduePrincipal = 0;
        let overdueLoans = 0;
        let repaidOnOverdue = 0;

        for (const chunk of chunks) {
            const [outstanding, overdue] = await Promise.all([
                prisma.loan.aggregate({
                    _sum: { loanAmount: true, repaidAmount: true },
                    _count: { _all: true },
                    where: loanWhere(chunk, { repaymentStatus: 'Unpaid' }),
                }),
                prisma.loan.aggregate({
                    _sum: { loanAmount: true, repaidAmount: true },
                    _count: { _all: true },
                    where: loanWhere(chunk, { repaymentStatus: 'Unpaid', dueDate: { lt: today } }),
                }),
            ]);

            outstandingPrincipal += outstanding._sum.loanAmount || 0;
            outstandingLoans += outstanding._count._all;
            repaidOnOutstanding += outstanding._sum.repaidAmount || 0;
            overduePrincipal += overdue._sum.loanAmount || 0;
            overdueLoans += overdue._count._all;
            repaidOnOverdue += overdue._sum.repaidAmount || 0;
        }

        // ---------------------------------------------------------------
        // 3. Aging distribution (snapshot, one aggregate per bucket)
        // ---------------------------------------------------------------
        const aging = await Promise.all(
            AGING_BUCKETS.map(async (bucket) => {
                // daysOverdue = today - dueDate, so a bucket of [min, max] days maps to
                // dueDate in (today - max - 1, today - min].
                const dueDateFilter: Record<string, Date> = {};
                if (bucket.minDays === 0) {
                    dueDateFilter.lt = today;
                } else {
                    dueDateFilter.lte = subDays(today, bucket.minDays);
                }
                if (Number.isFinite(bucket.maxDays)) {
                    dueDateFilter.gt = subDays(today, bucket.maxDays + 1);
                }

                let loans = 0;
                let principal = 0;
                let repaid = 0;
                for (const chunk of chunks) {
                    const result = await prisma.loan.aggregate({
                        _sum: { loanAmount: true, repaidAmount: true },
                        _count: { _all: true },
                        where: loanWhere(chunk, {
                            repaymentStatus: 'Unpaid',
                            dueDate: dueDateFilter,
                        }),
                    });
                    loans += result._count._all;
                    principal += result._sum.loanAmount || 0;
                    repaid += result._sum.repaidAmount || 0;
                }

                return {
                    bucket: bucket.label,
                    loans,
                    amount: Math.max(0, principal - repaid),
                };
            })
        );

        const outstandingBalance = Math.max(0, outstandingPrincipal - repaidOnOutstanding);
        const overdueBalance = Math.max(0, overduePrincipal - repaidOnOverdue);
        const kpis = {
            disbursedAmount,
            loansDisbursed,
            uniqueBorrowers,
            avgLoanSize: loansDisbursed > 0 ? disbursedAmount / loansDisbursed : 0,
            collectedAmount,
            repaymentCount,
            // Cash-flow ratio: repayments received in the period over principal
            // disbursed in the same period. Not a due-based recovery rate.
            collectionRate: disbursedAmount > 0 ? (collectedAmount / disbursedAmount) * 100 : 0,
            outstandingPrincipal,
            outstandingBalance,
            outstandingLoans,
            overduePrincipal,
            overdueBalance,
            overdueLoans,
            parRatio: outstandingBalance > 0 ? (overdueBalance / outstandingBalance) * 100 : 0,
        };
        const scope = {
            providerId: providerId ?? 'all',
            from: period.gte ? period.gte.toISOString() : null,
            to: period.lte ? period.lte.toISOString() : null,
            timeframe,
            branchCode: requestedBranchCode ?? null,
        };

        // The strip above the detail tabs needs nothing past this point.
        if (summaryOnly) {
            return NextResponse.json({ scope, kpis, aging, generatedAt: new Date().toISOString() });
        }

        // ---------------------------------------------------------------
        // 4. Collected income by component (ledger-sourced)
        // ---------------------------------------------------------------
        const INCOME_CATEGORIES = ['Principal', 'Interest', 'ServiceFee', 'Penalty', 'Tax'];
        const collectedByCategory: Record<string, number> = {
            principal: 0,
            interest: 0,
            servicefee: 0,
            penalty: 0,
            tax: 0,
        };

        for (const chunk of chunks) {
            const grouped = await prisma.ledgerEntry.groupBy({
                by: ['ledgerAccountId'],
                where: {
                    type: 'Debit',
                    ledgerAccount: {
                        type: { in: ['Received'] },
                        category: { in: INCOME_CATEGORIES },
                        ...(providerId ? { providerId } : {}),
                    },
                    journalEntry: {
                        ...(providerId ? { providerId } : {}),
                        ...(range && { date: range }),
                        ...(chunk ? { loan: { is: { borrowerId: { in: chunk } } } } : {}),
                    },
                },
                _sum: { amount: true },
            });

            if (grouped.length === 0) continue;
            const accounts = await prisma.ledgerAccount.findMany({
                where: { id: { in: grouped.map((g) => g.ledgerAccountId) } },
                select: { id: true, category: true },
            });
            const categoryById = new Map(accounts.map((a) => [a.id, a.category.toLowerCase()]));

            for (const row of grouped) {
                const key = categoryById.get(row.ledgerAccountId);
                if (key && key in collectedByCategory) {
                    collectedByCategory[key] += row._sum.amount || 0;
                }
            }
        }

        // ---------------------------------------------------------------
        // 5. Disbursed vs collected trend, on the user's calendar
        // ---------------------------------------------------------------
        // With no explicit period ("Overall") an all-time daily series is both huge
        // and unreadable, so the trend is clamped to the last 12 months.
        const trendEnd = period.lte ?? new Date();
        const endDay = localDay(trendEnd, tzOffset);
        const yearBack = `${addMonths(endDay.slice(0, 7), -11)}-01`;
        const startDay = period.gte ? localDay(period.gte, tzOffset) : yearBack;
        const spanDays = Math.round((Date.parse(endDay) - Date.parse(startDay)) / DAY_MS);
        const granularity: 'day' | 'month' = spanDays <= 62 ? 'day' : 'month';
        const firstDay = granularity === 'month' && spanDays > 366 ? yearBack : startDay;
        // Local midnight of the first day, as an instant.
        const trendStart = new Date(Date.parse(`${firstDay}T00:00:00Z`) - tzOffset * 60_000);

        const bucketKey = (date: Date) =>
            granularity === 'day' ? localDay(date, tzOffset) : localDay(date, tzOffset).slice(0, 7);
        const keys =
            granularity === 'day' ? dayKeys(firstDay, endDay) : monthKeys(firstDay.slice(0, 7), endDay.slice(0, 7));
        const series = new Map(keys.map((key) => [key, { period: key, disbursed: 0, collected: 0 }]));

        const trendPeriod = { gte: trendStart, lte: trendEnd };
        for (const chunk of chunks) {
            const [loanRows, paymentRows] = await Promise.all([
                prisma.loan.findMany({
                    where: loanWhere(chunk, {
                        repaymentStatus: { not: 'REVERSED' },
                        disbursedDate: trendPeriod,
                    }),
                    select: { disbursedDate: true, loanAmount: true },
                    take: TREND_ROW_LIMIT,
                }),
                prisma.payment.findMany({
                    where: paymentWhere(chunk, { date: trendPeriod }),
                    select: { date: true, amount: true },
                    take: TREND_ROW_LIMIT,
                }),
            ]);

            for (const row of loanRows) {
                const entry = series.get(bucketKey(row.disbursedDate));
                if (entry) entry.disbursed += row.loanAmount || 0;
            }
            for (const row of paymentRows) {
                const entry = series.get(bucketKey(row.date));
                if (entry) entry.collected += row.amount || 0;
            }
        }

        return NextResponse.json({
            scope,
            kpis,
            income: {
                principal: collectedByCategory.principal,
                interest: collectedByCategory.interest,
                serviceFee: collectedByCategory.servicefee,
                penalty: collectedByCategory.penalty,
                tax: collectedByCategory.tax,
                total:
                    collectedByCategory.interest +
                    collectedByCategory.servicefee +
                    collectedByCategory.penalty,
            },
            aging,
            trend: {
                granularity,
                clamped: !period.gte,
                from: trendStart.toISOString(),
                to: trendEnd.toISOString(),
                points: [...series.values()],
            },
            generatedAt: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Failed to build reports overview:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
