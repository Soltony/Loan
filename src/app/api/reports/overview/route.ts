import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
    startOfDay,
    endOfDay,
    startOfWeek,
    endOfWeek,
    startOfMonth,
    endOfMonth,
    startOfYear,
    endOfYear,
    subDays,
    subMonths,
    differenceInDays,
    eachDayOfInterval,
    eachMonthOfInterval,
    isValid,
    format,
} from 'date-fns';
import { getUserFromSession } from '@/lib/user';
import { parseBranchCodeQueryParam, resolveBranchBorrowerIdsForUser } from '@/lib/branch-filter';

// SQL Server caps a statement at ~2100 parameters, so borrower-id `IN` lists are
// chunked. Sums and counts are additive and the chunks are disjoint by borrowerId,
// so per-chunk results can simply be added together.
const BORROWER_CHUNK = 2000;

// Hard ceiling on rows pulled for the trend series. Only two narrow columns are
// selected, and the trend window is clamped to 12 months, so this is a safety net
// rather than an expected limit.
const TREND_ROW_LIMIT = 250_000;

// Same window definitions the other report endpoints use, so the Overview totals
// line up with the detail tabs for an identical filter selection.
const getDates = (timeframe: string, from?: string, to?: string) => {
    if (from && to) {
        const fromDate = new Date(from);
        const toDate = new Date(to);
        if (isValid(fromDate) && isValid(toDate)) {
            return { gte: startOfDay(fromDate), lte: endOfDay(toDate) };
        }
    }
    const now = new Date();
    switch (timeframe) {
        case 'daily':
            return { gte: startOfDay(now), lte: endOfDay(now) };
        case 'weekly':
            return { gte: startOfWeek(now, { weekStartsOn: 1 }), lte: endOfWeek(now, { weekStartsOn: 1 }) };
        case 'monthly':
            return { gte: startOfMonth(now), lte: endOfMonth(now) };
        case 'quarterly': {
            const qStartMonth = Math.floor(now.getMonth() / 3) * 3;
            return {
                gte: startOfMonth(new Date(now.getFullYear(), qStartMonth, 1)),
                lte: endOfMonth(new Date(now.getFullYear(), qStartMonth + 2, 1)),
            };
        }
        case 'semiAnnually': {
            const year = now.getFullYear();
            return now.getMonth() < 6
                ? { gte: startOfMonth(new Date(year, 0, 1)), lte: endOfMonth(new Date(year, 5, 1)) }
                : { gte: startOfMonth(new Date(year, 6, 1)), lte: endOfMonth(new Date(year, 11, 1)) };
        }
        case 'annually':
        case 'yearly':
            return { gte: startOfYear(now), lte: endOfYear(now) };
        case 'overall':
        default:
            return { gte: undefined, lte: undefined };
    }
};

const AGING_BUCKETS = [
    { label: 'Pass', minDays: 0, maxDays: 29 },
    { label: 'Special Mention', minDays: 30, maxDays: 89 },
    { label: 'Substandard', minDays: 90, maxDays: 179 },
    { label: 'Doubtful', minDays: 180, maxDays: 359 },
    { label: 'Loss', minDays: 360, maxDays: Infinity },
] as const;

/**
 * Split the branch-scoped borrower ids into `IN`-sized chunks.
 *  - `null` (unrestricted user) yields a single "no borrower filter" pass.
 *  - `[]` (branch user with nothing in scope) yields no passes at all, so every
 *    aggregate below correctly resolves to zero.
 */
function borrowerChunks(ids: string[] | null): (string[] | null)[] {
    if (ids === null) return [null];
    if (ids.length === 0) return [];
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += BORROWER_CHUNK) {
        chunks.push(ids.slice(i, i + BORROWER_CHUNK));
    }
    return chunks;
}

export async function GET(req: NextRequest) {
    const user = await getUserFromSession();
    if (!user || !user.permissions?.['reports']?.read) {
        return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const timeframe = searchParams.get('timeframe') || 'overall';
    const from = searchParams.get('from');
    const to = searchParams.get('to');

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
        const branchBorrowerIds = await resolveBranchBorrowerIdsForUser(user, requestedBranchCode);
        const chunks = borrowerChunks(branchBorrowerIds);

        const dateRange = getDates(timeframe, from ?? undefined, to ?? undefined);
        const periodFilter = {
            ...(dateRange.gte && { gte: dateRange.gte }),
            ...(dateRange.lte && { lte: dateRange.lte }),
        };
        const hasPeriod = Boolean(dateRange.gte || dateRange.lte);

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
                ...(hasPeriod && { disbursedDate: periodFilter }),
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
                    where: paymentWhere(chunk, { ...(hasPeriod && { date: periodFilter }) }),
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
        // 3. Collected income by component (ledger-sourced)
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
                        ...(hasPeriod && { date: periodFilter }),
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
        // 4. Aging distribution (snapshot, one aggregate per bucket)
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

        // ---------------------------------------------------------------
        // 5. Disbursed vs collected trend
        // ---------------------------------------------------------------
        // With no explicit period ("Overall") an all-time daily series is both huge
        // and unreadable, so the trend is clamped to the last 12 months.
        const trendEnd = dateRange.lte ?? endOfDay(new Date());
        const trendStart = dateRange.gte ?? startOfMonth(subMonths(trendEnd, 11));
        const spanDays = differenceInDays(trendEnd, trendStart);
        const granularity: 'day' | 'month' = spanDays <= 62 ? 'day' : 'month';
        const clampedStart =
            granularity === 'month' && spanDays > 366
                ? startOfMonth(subMonths(trendEnd, 11))
                : trendStart;

        const bucketKey = (date: Date) =>
            granularity === 'day' ? format(date, 'yyyy-MM-dd') : format(date, 'yyyy-MM');

        const series = new Map<string, { period: string; disbursed: number; collected: number }>();
        const interval = { start: clampedStart, end: trendEnd };
        const points =
            granularity === 'day' ? eachDayOfInterval(interval) : eachMonthOfInterval(interval);
        for (const point of points) {
            const key = bucketKey(point);
            series.set(key, { period: key, disbursed: 0, collected: 0 });
        }

        const trendPeriod = { gte: clampedStart, lte: trendEnd };
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

        const outstandingBalance = Math.max(0, outstandingPrincipal - repaidOnOutstanding);
        const overdueBalance = Math.max(0, overduePrincipal - repaidOnOverdue);

        return NextResponse.json({
            scope: {
                providerId: providerId ?? 'all',
                from: dateRange.gte ? dateRange.gte.toISOString() : null,
                to: dateRange.lte ? dateRange.lte.toISOString() : null,
                timeframe,
                branchCode: requestedBranchCode ?? null,
            },
            kpis: {
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
            },
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
                clamped: !dateRange.gte,
                from: clampedStart.toISOString(),
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
