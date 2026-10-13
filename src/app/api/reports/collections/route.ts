

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, format, isValid } from 'date-fns';
import { getUserFromSession } from '@/lib/user';
import { resolveBranchBorrowerIdsForUser, parseBranchCodeQueryParam } from '@/lib/branch-filter';
import { reconcileRepaymentsForLoans } from '@/lib/repayment-reconciliation-data';
import { buildOutstandingSeries, outstandingAt } from '@/lib/collections-outstanding';

// SQL Server caps a statement at ~2100 parameters.
const BORROWER_ID_BATCH = 1000;

interface ScopedLoan {
    id: string;
    provider: string;
    loanAmount: number;
    disbursedDate: Date;
}

/**
 * Every live loan the report covers, with its provider's name: the loans whose
 * repayments make up the collections, and the loans whose principal makes up the
 * outstanding balance behind them.
 *
 * Borrower id lists are chunked — a branch's borrower set can run past the ~2100
 * parameters SQL Server allows in one statement.
 */
async function loadScopedLoans(
    loanWhere: Record<string, any>,
    borrowerIds: string[] | null,
): Promise<ScopedLoan[]> {
    const select = {
        id: true,
        loanAmount: true,
        disbursedDate: true,
        product: { select: { provider: { select: { name: true } } } },
    } as const;

    const chunks: (string[] | null)[] = [];
    if (borrowerIds) {
        for (let i = 0; i < borrowerIds.length; i += BORROWER_ID_BATCH) {
            chunks.push(borrowerIds.slice(i, i + BORROWER_ID_BATCH));
        }
    } else {
        chunks.push(null);
    }

    const scoped: ScopedLoan[] = [];
    for (const chunk of chunks) {
        const loans = await prisma.loan.findMany({
            where: { ...loanWhere, ...(chunk ? { borrowerId: { in: chunk } } : {}) },
            select,
        });
        for (const loan of loans) {
            scoped.push({
                id: loan.id,
                provider: loan.product.provider.name,
                loanAmount: loan.loanAmount,
                disbursedDate: loan.disbursedDate,
            });
        }
    }
    return scoped;
}

const getDates = (timeframe: string, from?: string, to?: string) => {
    if (from && to) {
        const fromDate = new Date(from);
        const toDate = new Date(to);
        if(isValid(fromDate) && isValid(toDate)) {
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
            const qStart = startOfMonth(new Date(now.getFullYear(), qStartMonth, 1));
            const qEnd = endOfMonth(new Date(now.getFullYear(), qStartMonth + 2, 1));
            return { gte: qStart, lte: qEnd };
        }
        case 'semiAnnually': {
            const year = now.getFullYear();
            if (now.getMonth() < 6) {
                const s = startOfMonth(new Date(year, 0, 1));
                const e = endOfMonth(new Date(year, 5, 1));
                return { gte: s, lte: e };
            } else {
                const s = startOfMonth(new Date(year, 6, 1));
                const e = endOfMonth(new Date(year, 11, 1));
                return { gte: s, lte: e };
            }
        }
        case 'annually':
        case 'yearly':
            return { gte: startOfYear(now), lte: endOfYear(now) };
        case 'overall':
        default:
            return { gte: undefined, lte: undefined };
    }
};

export async function GET(req: NextRequest) {
    const user = await getUserFromSession();
    if (!user || !user.permissions?.['reports']?.read) {
        return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    let providerId = searchParams.get('providerId');
    const timeframe = searchParams.get('timeframe') || 'overall';
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const qRaw = searchParams.get('q');
    const q = qRaw ? qRaw.trim().toLowerCase() : '';
    const dateRange = getDates(timeframe, from ?? undefined, to ?? undefined);

    // Pagination parameters
    const DEFAULT_PAGE_SIZE = 50;
    const MAX_PAGE_SIZE = 200;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(
        MAX_PAGE_SIZE,
        Math.max(1, parseInt(searchParams.get("pageSize") || String(DEFAULT_PAGE_SIZE), 10))
    );

    // Collections are the repayments (Payment rows) on live loans, split the way
    // the dashboard and the Repayments tab split them (reconcileLoanRepayments),
    // against the principal those same loans still owe at the end of the day.
    // Reversed loans are out: a reversal deletes their Payment rows anyway.
    // Payment.date is the repayment's journal date.
    const loanWhere: Record<string, any> = {
        repaymentStatus: { not: 'REVERSED' },
        // A loan disbursed after the window collects nothing inside it and sits in
        // none of its end-of-day balances, so it is no part of this report.
        ...(dateRange.lte ? { disbursedDate: { lte: dateRange.lte } } : {}),
    };

    const isSuperAdminOrRecon = user.role === 'Super Admin' || user.role === 'Reconciliation';

    // Users with loanProviderId are restricted to their own provider
    // Users without loanProviderId (and with reports permission) can access all providers
    if (user.loanProviderId) {
        providerId = user.loanProviderId;
    }

    if (providerId && providerId !== 'all' && providerId !== 'none') {
        loanWhere.product = { providerId };
    }

    if (providerId === 'none') {
        return NextResponse.json({ data: [], total: 0, page: 1, pageSize, totalPages: 0 });
    }

    // Branch/District users only see collections from their branch borrowers.
    const requestedBranchCode = parseBranchCodeQueryParam(searchParams.get('branchCode'));
    const branchBorrowerIds = await resolveBranchBorrowerIdsForUser(user, requestedBranchCode);
    if (branchBorrowerIds !== null && branchBorrowerIds.length === 0) {
        return NextResponse.json({ data: [], total: 0, page: 1, pageSize, totalPages: 0 });
    }

    try {
        const loans = await loadScopedLoans(loanWhere, branchBorrowerIds);
        const reconciled = await reconcileRepaymentsForLoans(prisma, loans.map((l) => l.id));
        const outstandingSeries = buildOutstandingSeries(loans, reconciled);

        const inRange = (date: Date) =>
            (!dateRange.gte || date >= dateRange.gte) && (!dateRange.lte || date <= dateRange.lte);

        const aggregatedData: Record<string, {
            provider: string;
            date: string;
            principal: number;
            interest: number;
            serviceFee: number;
            penalty: number;
            tax: number;
            unapplied: number;
        }> = {};

        for (const loan of loans) {
            for (const entry of reconciled.entriesByLoan.get(loan.id) ?? []) {
                const split = reconciled.byEntry.get(entry.id);
                const date = new Date(entry.date);
                if (!split || !inRange(date)) continue;
                const dateStr = format(date, 'yyyy-MM-dd');
                // NUL separates the parts so a provider name holding a hyphen (or a
                // digit) cannot be split back apart in the wrong place.
                const key = `${loan.provider}\u0000${dateStr}`;

                if (!aggregatedData[key]) {
                    aggregatedData[key] = {
                        provider: loan.provider,
                        date: dateStr,
                        principal: 0,
                        interest: 0,
                        serviceFee: 0,
                        penalty: 0,
                        tax: 0,
                        unapplied: 0,
                    };
                }
                const row = aggregatedData[key];
                row.principal += split.principal;
                row.interest += split.interest;
                row.serviceFee += split.serviceFee;
                row.penalty += split.penalty;
                row.tax += split.tax;
                row.unapplied += split.unapplied;
            }
        }

        let reportData = Object.values(aggregatedData).map((value) => {
            // The balance still outstanding once that day's collections are in.
            const point = outstandingAt(outstandingSeries, value.provider, value.date);
            return {
                ...value,
                total: value.principal + value.interest + value.serviceFee + value.penalty + value.tax + value.unapplied,
                outstandingPrincipal: point.outstanding,
                outstandingLoans: point.loans,
            };
        });

        if (q) {
            reportData = reportData.filter((r) => {
                return (
                    String(r.provider || '').toLowerCase().includes(q) ||
                    String(r.date || '').toLowerCase().includes(q)
                );
            });
        }

        reportData.sort((a,b) => {
            const diff = new Date(b.date).getTime() - new Date(a.date).getTime();
            if (diff !== 0) return diff;
            // Tiebreak on provider so pagination is stable for same-day rows
            return String(a.provider).localeCompare(String(b.provider));
        });

        // Apply pagination on aggregated data
        const total = reportData.length;
        const totalPages = Math.ceil(total / pageSize);
        const skip = (page - 1) * pageSize;
        const paginatedData = reportData.slice(skip, skip + pageSize);

        return NextResponse.json({
            data: paginatedData,
            total,
            page,
            pageSize,
            totalPages,
        });

    } catch (error) {
        console.error('Failed to fetch collections report:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
