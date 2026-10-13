import { format } from 'date-fns';

/** A live loan the collections report covers, with the provider it belongs to. */
export interface OutstandingLoanInput {
    id: string;
    provider: string;
    loanAmount: number;
    disbursedDate: Date;
}

/** The reconciled repayments of those loans — the shape `reconcileRepaymentsForLoans` returns. */
export interface OutstandingRepaymentInput {
    byEntry: Map<string, { principal: number }>;
    entriesByLoan: Map<string, { id: string; date: Date }[]>;
}

/** Principal still owed, and how many loans still owe it, at the end of one day. */
export interface OutstandingPoint {
    outstanding: number;
    loans: number;
}

/** One provider's end-of-day balances, with its days of activity in order. */
export interface OutstandingSeries {
    days: string[];
    points: Map<string, OutstandingPoint>;
}

const EMPTY_POINT: OutstandingPoint = { outstanding: 0, loans: 0 };

const cents = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * What borrowers still owe on principal at the end of each day, per provider.
 *
 * Disbursement puts a loan's principal on the books and each repayment's
 * reconciled principal share takes part of it back off, so
 * `disbursed - principal received` is the balance still outstanding. Taking it
 * from the same reconciled split the Principal Received column reports keeps the
 * two columns of a row on one basis, and makes the identity the dashboard states
 * hold by construction: Principal Receivable + Principal Received = Total
 * Disbursed. Walking both event streams in date order gives the balance as of
 * any day, and the count of loans still carrying one.
 *
 * It therefore follows the cash, not the status flag, and can sit above the
 * dashboard's Principal Receivable card, which counts only loans still flagged
 * Unpaid: a loan flagged Paid whose repayments never brought its principal in
 * still carries a balance here.
 *
 * Every event counts, not only those inside the report's date range: the balance
 * on a given day is the whole history up to it. Reversed loans must be left out
 * by the caller — a reversal takes the loan and its repayments off the books.
 */
export function buildOutstandingSeries(
    loans: OutstandingLoanInput[],
    reconciled: OutstandingRepaymentInput,
): Map<string, OutstandingSeries> {
    type Event = { day: string; loanId: string; delta: number };
    const eventsByProvider = new Map<string, Event[]>();
    const add = (provider: string, event: Event) => {
        const list = eventsByProvider.get(provider);
        if (list) list.push(event);
        else eventsByProvider.set(provider, [event]);
    };

    for (const loan of loans) {
        add(loan.provider, {
            day: format(new Date(loan.disbursedDate), 'yyyy-MM-dd'),
            loanId: loan.id,
            delta: loan.loanAmount,
        });
        for (const entry of reconciled.entriesByLoan.get(loan.id) ?? []) {
            const principal = reconciled.byEntry.get(entry.id)?.principal ?? 0;
            if (principal === 0) continue;
            add(loan.provider, {
                day: format(new Date(entry.date), 'yyyy-MM-dd'),
                loanId: loan.id,
                delta: -principal,
            });
        }
    }

    const series = new Map<string, OutstandingSeries>();
    for (const [provider, events] of eventsByProvider) {
        // `yyyy-MM-dd` sorts chronologically. A loan disbursed and repaid on the
        // same day takes the disbursement first, so it never shows a negative.
        events.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : b.delta - a.delta));

        const remaining = new Map<string, number>();
        const points = new Map<string, OutstandingPoint>();
        const days: string[] = [];
        let outstanding = 0;
        let open = 0;

        events.forEach((event, i) => {
            const before = remaining.get(event.loanId) ?? 0;
            const after = before + event.delta;
            remaining.set(event.loanId, after);
            outstanding += event.delta;
            if (before <= 0.01 && after > 0.01) open += 1;
            else if (before > 0.01 && after <= 0.01) open -= 1;

            // Checkpoint once the day's last event has been applied.
            if (i === events.length - 1 || events[i + 1].day !== event.day) {
                days.push(event.day);
                points.set(event.day, { outstanding: Math.max(0, cents(outstanding)), loans: Math.max(0, open) });
            }
        });

        series.set(provider, { days, points });
    }
    return series;
}

/**
 * A provider's balance at the end of `day` (`yyyy-MM-dd`), carried forward from
 * its last day of activity. Days before the provider's first disbursement, and
 * providers with no loans at all, read as zero.
 */
export function outstandingAt(
    series: Map<string, OutstandingSeries>,
    provider: string,
    day: string,
): OutstandingPoint {
    const providerSeries = series.get(provider);
    if (!providerSeries) return EMPTY_POINT;
    const exact = providerSeries.points.get(day);
    if (exact) return exact;

    const { days } = providerSeries;
    let lo = 0;
    let hi = days.length - 1;
    let found = -1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (days[mid] <= day) {
            found = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    return found >= 0 ? providerSeries.points.get(days[found])! : EMPTY_POINT;
}
