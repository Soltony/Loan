import { startOfDay } from 'date-fns';

/**
 * @fileOverview A borrower's repayment history as eligibility and credit scoring read it: how a
 * repaid loan behaved against its due date, whether an unpaid loan is overdue, and the history
 * counts scoring rules use. Pure functions; the callers load the loans.
 */

export type RepaymentBehavior = 'EARLY' | 'ON_TIME' | 'LATE';

/** How a loan fully repaid on `paidAt` behaved against its due date, compared by calendar day. */
export function repaymentBehaviorFor(paidAt: Date, dueDate: Date): RepaymentBehavior {
  const paid = startOfDay(paidAt).getTime();
  const due = startOfDay(dueDate).getTime();
  return paid < due ? 'EARLY' : paid === due ? 'ON_TIME' : 'LATE';
}

type InstallmentLike = {
  dueDate: Date;
  amount: number | null;
  paidAmount: number | null;
  status: string | null;
};

// Installments that need no more paying: paid, or merged into a later one. The status is written
// in more than one case ("PAID", "Paid", "MERGED", "Merged").
const SETTLED_INSTALLMENT = new Set(['PAID', 'MERGED']);

/**
 * Whether an unpaid loan is past due on `today`: its final due date has passed, or an installment
 * that still needs paying fell due before today. A loan due today is not overdue.
 */
export function isLoanOverdue(
  loan: { dueDate: Date; installments?: InstallmentLike[] | null },
  today: Date
): boolean {
  const day = startOfDay(today).getTime();
  if (startOfDay(loan.dueDate).getTime() < day) return true;
  return (loan.installments ?? []).some((installment) => {
    const owed = (installment.amount ?? 0) - (installment.paidAmount ?? 0);
    return (
      !SETTLED_INSTALLMENT.has(String(installment.status ?? '').toUpperCase()) &&
      owed > 0.01 &&
      startOfDay(installment.dueDate).getTime() < day
    );
  });
}

type LoanHistoryRow = {
  repaymentStatus: string | null;
  repaymentBehavior: string | null;
  disbursedDate: Date;
};

/** How many of the latest repaid loans the "last 5" history fields cover. */
export const RECENT_REPAID_LOANS = 5;

/**
 * The history fields scoring rules and loan cycles use. Reversed loans are left out. "On time"
 * means repaid by the due date, so early repayments count too; loansEarly counts early ones only.
 * The ...Top5 fields cover the latest repaid loans (newest disbursement first); rules on
 * loansOnTime, loansLate and loansEarly read those, loan cycles read the all-time counts.
 */
export function repaymentHistory(loans: LoanHistoryRow[]) {
  const kept = loans.filter((l) => l.repaymentStatus !== 'REVERSED' && l.repaymentBehavior !== 'REVERSED');
  const repaid = kept.filter((l) => ['EARLY', 'ON_TIME', 'LATE'].includes(String(l.repaymentBehavior)));
  const recent = [...repaid]
    .sort((a, b) => b.disbursedDate.getTime() - a.disbursedDate.getTime())
    .slice(0, RECENT_REPAID_LOANS);
  const count = (rows: LoanHistoryRow[], ...behaviors: RepaymentBehavior[]) =>
    rows.filter((l) => (behaviors as string[]).includes(String(l.repaymentBehavior))).length;
  return {
    totalLoansCount: kept.length,
    loansOnTime: count(repaid, 'EARLY', 'ON_TIME'),
    loansLate: count(repaid, 'LATE'),
    loansEarly: count(repaid, 'EARLY'),
    loansOnTimeTop5: count(recent, 'EARLY', 'ON_TIME'),
    loansLateTop5: count(recent, 'LATE'),
    loansEarlyTop5: count(recent, 'EARLY'),
  };
}
