import type { PrismaClient } from '@prisma/client';
import { calculateOutstandingBreakdown } from './loan-calculator';
import {
  addAmounts,
  reconcileLoanRepayments,
  settledLoanTarget,
  zeroAmounts,
  type Bucket,
  type BucketAmounts,
  type LoanBasis,
  type ReconciledAmounts,
  type RepaymentRow,
} from './repayment-reconciliation';

// SQL Server caps a statement at ~2100 parameters.
const LOAN_ID_BATCH = 500;

const BUCKET_BY_CATEGORY: Record<string, Bucket> = {
  Principal: 'principal',
  Interest: 'interest',
  ServiceFee: 'serviceFee',
  Penalty: 'penalty',
  Tax: 'tax',
};

function batches<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += LOAN_ID_BATCH) out.push(items.slice(i, i + LOAN_ID_BATCH));
  return out;
}

// Above this many loans it is cheaper to read whole tables once than to filter
// by id: LedgerEntry.journalEntryId and Payment.loanId are not indexed, so every
// filtered batch scans the table anyway.
const READ_ALL_ABOVE = 1000;

/**
 * One row per repayment (a Payment and its journal entry), with what the ledger
 * posted to each Received bucket. Built from flat reads: nested relation loads
 * scan LedgerEntry once per batch and took ~25s for the whole book.
 */
async function loadRepaymentRows(prisma: PrismaClient, loanIds: string[]) {
  const wanted = new Set(loanIds);
  const readAll = loanIds.length > READ_ALL_ABOVE;

  const paymentSelect = { journalEntryId: true, loanId: true, amount: true, date: true } as const;
  const payments = readAll
    ? (await prisma.payment.findMany({ select: paymentSelect })).filter((p) => wanted.has(p.loanId))
    : (
        await Promise.all(
          batches(loanIds).map((batch) =>
            prisma.payment.findMany({ where: { loanId: { in: batch } }, select: paymentSelect }),
          ),
        )
      ).flat();
  const repayments = payments.filter((p) => p.journalEntryId);

  const accounts = await prisma.ledgerAccount.findMany({
    where: { type: 'Received' },
    select: { id: true, category: true },
  });
  const bucketByAccount = new Map(accounts.map((a) => [a.id, BUCKET_BY_CATEGORY[a.category]]));
  const accountIds = accounts.map((a) => a.id);
  const entrySelect = { journalEntryId: true, amount: true, ledgerAccountId: true } as const;
  const entries = readAll
    ? await prisma.ledgerEntry.findMany({
        where: { type: 'Debit', ledgerAccountId: { in: accountIds } },
        select: entrySelect,
      })
    : (
        await Promise.all(
          batches(repayments.map((p) => p.journalEntryId!)).map((batch) =>
            prisma.ledgerEntry.findMany({
              where: { type: 'Debit', ledgerAccountId: { in: accountIds }, journalEntryId: { in: batch } },
              select: entrySelect,
            }),
          ),
        )
      ).flat();

  const rowsByEntry = new Map<string, RepaymentRow>();
  const rowsByLoan = new Map<string, RepaymentRow[]>();
  for (const p of repayments) {
    const row: RepaymentRow = {
      id: p.journalEntryId!,
      date: p.date,
      cash: p.amount,
      booked: { principal: 0, interest: 0, serviceFee: 0, penalty: 0, tax: 0 },
    };
    rowsByEntry.set(row.id, row);
    if (!rowsByLoan.has(p.loanId)) rowsByLoan.set(p.loanId, []);
    rowsByLoan.get(p.loanId)!.push(row);
  }
  for (const e of entries) {
    const row = rowsByEntry.get(e.journalEntryId);
    const bucket = bucketByAccount.get(e.ledgerAccountId);
    if (row && bucket) row.booked[bucket] += e.amount;
  }
  return rowsByLoan;
}

const cents = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const PRODUCT_TERMS = {
  id: true,
  duration: true,
  serviceFee: true,
  serviceFeeEnabled: true,
  dailyFee: true,
  dailyFeeEnabled: true,
  penaltyRules: true,
  penaltyRulesEnabled: true,
  penaltyPerInstallment: true,
} as const;

/**
 * What a settled loan's repayments paid toward each bucket on its own terms:
 * everything it owed up to the repayment that cleared it. Cash after that was
 * overpaid. Refunds pay nothing and are left out. Penalty is counted at loan level
 * from the due date — the installment counters are what went out of date on these
 * loans.
 */
function paidOnLoanTerms(loan: object, product: object, taxConfigs: object[], rows: RepaymentRow[]): BucketAmounts {
  const ordered = rows
    .filter((r) => r.cash > 0)
    .sort((a, b) => a.date.getTime() - b.date.getTime() || a.id.localeCompare(b.id));
  const asOfRepayment = (n: number, repaid: number) =>
    ({
      ...loan,
      installments: undefined,
      repaymentStatus: 'Unpaid',
      payments: ordered.slice(0, n).map((r) => ({ amount: r.cash, date: r.date })),
      repaidAmount: repaid,
    }) as any;
  let repaid = 0;
  for (const [i, r] of ordered.entries()) {
    const owed = calculateOutstandingBreakdown(asOfRepayment(i, repaid), product as any, taxConfigs as any, r.date);
    if (r.cash >= owed.total - 0.005) {
      // This repayment cleared the loan: the loan had earned every charge due that day.
      return {
        principal: cents(owed.paid.principal + owed.principal),
        interest: cents(owed.paid.interest + owed.interest),
        serviceFee: cents(owed.paid.serviceFee + owed.serviceFee),
        penalty: cents(owed.paid.penalty + owed.penalty),
        tax: cents(owed.paid.tax + owed.tax),
      };
    }
    repaid += r.cash;
  }
  // Never cleared on its terms: what the cash covered, in repayment order.
  const last = ordered[ordered.length - 1];
  return calculateOutstandingBreakdown(asOfRepayment(ordered.length, repaid), product as any, taxConfigs as any, last?.date ?? new Date()).paid;
}

/**
 * The basis each loan's repayments are restated to: an open loan to what the
 * loans report says each bucket has received, a settled loan to what it paid on
 * its own terms.
 */
async function loadLoanBases(
  prisma: PrismaClient,
  loanIds: string[],
  asOf: Date,
  rowsByLoan: Map<string, RepaymentRow[]>,
) {
  const bases = new Map<string, LoanBasis>();
  const unpaidIds: string[] = [];
  const wanted = new Set(loanIds);
  const loanSelect = {
    id: true,
    loanAmount: true,
    repaymentStatus: true,
    disbursedDate: true,
    dueDate: true,
    productId: true,
  } as const;
  const loans =
    loanIds.length > READ_ALL_ABOVE
      ? (await prisma.loan.findMany({ select: loanSelect })).filter((l) => wanted.has(l.id))
      : (
          await Promise.all(
            batches(loanIds).map((batch) => prisma.loan.findMany({ where: { id: { in: batch } }, select: loanSelect })),
          )
        ).flat();
  // Only a loan with repayments to restate ever reads its basis, and loading one
  // pulls in that loan's installments — so a loan that has never been repaid is
  // left out here. Most of an open book is in that state.
  for (const l of loans) if (l.repaymentStatus === 'Unpaid' && rowsByLoan.has(l.id)) unpaidIds.push(l.id);

  // Same inputs and tax set as the loans report, so "open" means the same thing.
  const [taxConfigs, products] = await Promise.all([
    prisma.tax.findMany(),
    prisma.loanProduct.findMany({
      where: { id: { in: Array.from(new Set(loans.map((l) => l.productId))) } },
      select: PRODUCT_TERMS,
    }),
  ]);
  for (const batch of batches(unpaidIds)) {
    const loans = await prisma.loan.findMany({
      where: { id: { in: batch } },
      include: {
        payments: { select: { amount: true, date: true } },
        installments: true,
        product: {
          select: {
            duration: true,
            serviceFee: true,
            serviceFeeEnabled: true,
            dailyFee: true,
            dailyFeeEnabled: true,
            penaltyRules: true,
            penaltyRulesEnabled: true,
            penaltyPerInstallment: true,
          },
        },
      },
    });
    for (const loan of loans) {
      const owed = calculateOutstandingBreakdown(loan as any, loan.product as any, taxConfigs as any, asOf);
      if (owed.total > 0.01) bases.set(loan.id, { received: owed.paid });
    }
  }

  const productById = new Map(products.map((p) => [p.id, p]));
  for (const l of loans) {
    const product = productById.get(l.productId);
    const rows = rowsByLoan.get(l.id);
    if (bases.has(l.id) || !product || !rows) continue;
    const paid = paidOnLoanTerms(l, product, taxConfigs, rows);
    bases.set(l.id, { received: settledLoanTarget(l.loanAmount, paid) });
  }
  return bases;
}

export interface ReconciledRepayments {
  /** Restated split per repayment journal entry id. */
  byEntry: Map<string, ReconciledAmounts>;
  /** Restated split summed per loan. */
  byLoan: Map<string, ReconciledAmounts>;
  /** Journal entry ids of each loan's repayments. */
  entriesByLoan: Map<string, { id: string; date: Date }[]>;
}

/**
 * Restated principal / charges / unapplied split of every repayment on these
 * loans (see reconcileLoanRepayments). Pass every loan whose repayments you will
 * show, not just some of its rows: corrections are made across a loan's rows.
 */
export async function reconcileRepaymentsForLoans(
  prisma: PrismaClient,
  loanIds: string[],
  asOf: Date = new Date(),
): Promise<ReconciledRepayments> {
  const result: ReconciledRepayments = { byEntry: new Map(), byLoan: new Map(), entriesByLoan: new Map() };
  const ids = Array.from(new Set(loanIds));
  if (ids.length === 0) return result;
  const rowsByLoan = await loadRepaymentRows(prisma, ids);
  const bases = await loadLoanBases(prisma, ids, asOf, rowsByLoan);

  for (const [loanId, rows] of rowsByLoan) {
    const basis = bases.get(loanId);
    if (!basis) continue;
    const split = reconcileLoanRepayments(basis, rows);
    const loanTotal = zeroAmounts();
    for (const [entryId, amounts] of split) {
      result.byEntry.set(entryId, amounts);
      addAmounts(loanTotal, amounts);
    }
    result.byLoan.set(loanId, loanTotal);
    result.entriesByLoan.set(loanId, rows.map((r) => ({ id: r.id, date: r.date })));
  }
  return result;
}
