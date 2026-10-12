/**
 * Restates how a loan's repayments split between principal, charges and
 * overpayment, so the dashboard, the Repayments tab and the Collections tab all
 * report the same figures — and principal received plus principal outstanding
 * equals what was disbursed.
 *
 * The ledger's own split cannot be used as-is. Repayment flows have posted
 * principal beyond the amount lent (overpayments, and charges posted as
 * principal), posted part of a settled loan's principal as a duplicate interest
 * or penalty charge, and left some cash unposted. So each loan's repayments are
 * restated to what its own terms say each bucket received (`received`):
 *
 *  - Open loan: what the loans report says it has been paid, the same basis as
 *    its outstanding balance.
 *  - Settled loan: everything it owed up to the repayment that cleared it (see
 *    settledLoanTarget). Charges a posting put on principal are charges again,
 *    a charge posted twice counts once, and cash beyond the total is unapplied
 *    (overpaid).
 *
 * A refund (a repayment with negative cash) returns overpaid cash, so it is all
 * unapplied. Whenever the cash kept falls short of the loan's terms, the shortfall
 * is waived charges (see waiveCharges).
 *
 * Each repayment's cash is never changed — only its split. Corrections land on
 * the latest repayments first.
 */
export const BUCKETS = ['principal', 'interest', 'serviceFee', 'penalty', 'tax'] as const;
export type Bucket = (typeof BUCKETS)[number];
export type BucketAmounts = Record<Bucket, number>;
export type ReconciledAmounts = BucketAmounts & { unapplied: number };

export interface RepaymentRow {
  id: string;
  date: Date;
  /** Cash the repayment brought in (Payment.amount). */
  cash: number;
  /** What the ledger posted to each Received bucket for this repayment. */
  booked: BucketAmounts;
}

/** What each bucket of a loan's repayments is restated to; the rest of the cash is unapplied. */
export interface LoanBasis {
  received: BucketAmounts;
}

type Key = Bucket | 'unapplied';

const cents = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const zeroAmounts = (): ReconciledAmounts => ({
  principal: 0,
  interest: 0,
  serviceFee: 0,
  penalty: 0,
  tax: 0,
  unapplied: 0,
});

export function addAmounts(into: ReconciledAmounts, from: ReconciledAmounts): ReconciledAmounts {
  for (const k of [...BUCKETS, 'unapplied'] as Key[]) into[k] += from[k];
  return into;
}

const CHARGES = ['penalty', 'serviceFee', 'interest', 'tax'] as const;

/**
 * Take `amount` off the target's charges, penalty first, then service fee,
 * interest, tax, and return what they could not cover.
 */
function waiveCharges(target: BucketAmounts, amount: number): number {
  let left = cents(amount);
  for (const b of CHARGES) {
    const take = Math.min(left, target[b]);
    target[b] = cents(target[b] - take);
    left = cents(left - take);
  }
  return left;
}

/**
 * A settled loan's restatement target: what its repayments paid on its own terms.
 * A loan closed short of those terms (the customer paid what the app showed while
 * its counters were out of date) had charges waived, not principal: principal is
 * made up to the amount lent from the waived charges (see waiveCharges).
 */
export function settledLoanTarget(loanAmount: number, paidOnTerms: BucketAmounts): BucketAmounts {
  const target = { ...paidOnTerms };
  const short = cents(loanAmount - target.principal);
  if (short > 0) target.principal = cents(target.principal + short - waiveCharges(target, short));
  return target;
}

/** The target trimmed to the cash actually kept: charges give way first, principal last. */
function capToCash(received: BucketAmounts, cash: number): BucketAmounts {
  const target = { ...received };
  const over = cents(BUCKETS.reduce((s, b) => s + target[b], 0) - cash);
  if (over > 0) target.principal = Math.max(0, cents(target.principal - waiveCharges(target, over)));
  return target;
}

export function reconcileLoanRepayments(
  basis: LoanBasis,
  rows: RepaymentRow[],
): Map<string, ReconciledAmounts> {
  const ordered = [...rows].sort((a, b) => a.date.getTime() - b.date.getTime() || a.id.localeCompare(b.id));
  const split = new Map<string, ReconciledAmounts>();
  for (const row of ordered) {
    if (row.cash < 0) {
      split.set(row.id, { ...zeroAmounts(), unapplied: cents(row.cash) });
      continue;
    }
    const amounts = { ...zeroAmounts(), ...row.booked };
    const posted = BUCKETS.reduce((s, b) => s + amounts[b], 0);
    amounts.unapplied = Math.max(0, cents(row.cash - posted));
    split.set(row.id, amounts);
  }
  const latestFirst = [...ordered].reverse().map((r) => split.get(r.id)!);
  const total = (k: Key) => latestFirst.reduce((s, a) => s + a[k], 0);
  const move = (from: Key, to: Key, amount: number) => {
    let left = cents(amount);
    for (const a of latestFirst) {
      if (left <= 0) break;
      const take = Math.min(a[from], left);
      if (take <= 0) continue;
      a[from] = cents(a[from] - take);
      a[to] = cents(a[to] + take);
      left = cents(left - take);
    }
  };

  const cash = ordered.reduce((s, r) => s + r.cash, 0);
  const target: Record<Key, number> = { ...capToCash(basis.received, cash), unapplied: 0 };
  target.unapplied = Math.max(0, cents(cash - BUCKETS.reduce((s, b) => s + target[b], 0)));
  const gap = {} as Record<Key, number>;
  for (const k of [...BUCKETS, 'unapplied'] as Key[]) gap[k] = cents(target[k] - total(k));
  const donors: Key[] = ['unapplied', 'principal', 'tax', 'interest', 'serviceFee', 'penalty'];
  const takers: Key[] = ['penalty', 'serviceFee', 'interest', 'tax', 'principal', 'unapplied'];
  for (const from of donors) {
    for (const to of takers) {
      if (gap[from] >= 0) break;
      if (gap[to] <= 0) continue;
      const amount = Math.min(-gap[from], gap[to]);
      move(from, to, amount);
      gap[from] = cents(gap[from] + amount);
      gap[to] = cents(gap[to] - amount);
    }
  }
  return split;
}
