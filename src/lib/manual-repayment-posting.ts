/**
 * Posting and reversal for manual digital loan repayments.
 *
 * Both run inside a caller-supplied transaction so the ledger, the installment
 * schedule, the loan and the ManualRepayment row move together or not at all.
 *
 * The waterfall mirrors the Super App callback (`/api/payment-callback`): the same
 * buckets, the same ledger accounts, the same `loan.repaidAmount` arithmetic — a
 * repayment posted at a branch leaves the loan in the state it would have been in
 * had the customer paid in the app. What this engine adds is a configurable
 * allocation order (BRD 3.7) and a cascade across every open installment, so a
 * branch settlement that clears several installments at once closes all of them
 * instead of only the active one.
 */

import type { Prisma } from '@prisma/client';
import { startOfDay, isBefore, isEqual } from 'date-fns';
import { calculateTotalRepayable, splitInstallmentPaidAmount } from './loan-calculator';
import { roundCurrency } from './interest-accrual';
import { ensureInstallmentRollover } from './installment-rollover';
import {
  type AllocationBucket,
  type LoanBalanceSnapshot,
  ALLOCATION_BUCKETS,
  DEFAULT_ALLOCATION_ORDER,
  MANUAL_REPAYMENT_TOLERANCE as TOLERANCE,
  loanBalanceSnapshot,
} from './manual-repayment';

/** Ledger account category backing each bucket, and whether it recognises income. */
const LEDGER_CATEGORY: Record<AllocationBucket, string> = {
  PENALTY: 'Penalty',
  SERVICE_FEE: 'ServiceFee',
  INTEREST: 'Interest',
  TAX: 'Tax',
  PRINCIPAL: 'Principal',
};

/** Buckets whose collection also credits an Income account, as the callback does. */
const RECOGNISES_INCOME: Record<AllocationBucket, boolean> = {
  PENALTY: true,
  SERVICE_FEE: true,
  INTEREST: true,
  TAX: false,
  PRINCIPAL: false,
};

export type Allocation = Record<AllocationBucket, number>;

export const zeroAllocation = (): Allocation => ({
  PENALTY: 0,
  SERVICE_FEE: 0,
  INTEREST: 0,
  TAX: 0,
  PRINCIPAL: 0,
});

export interface PostRepaymentArgs {
  loanId: string;
  amount: number;
  paymentDate: Date;
  /** Bucket order from bank policy; falls back to the portal's canonical order. */
  allocationOrder?: AllocationBucket[];
  /** Goes on the journal entry, and is what the reconciliation report reads back. */
  description: string;
}

export interface PostRepaymentResult {
  allocation: Allocation;
  /** What actually settled a bucket. */
  applied: number;
  /** Amount above the outstanding balance; never posted, needs refund or suspense. */
  unapplied: number;
  balanceBefore: LoanBalanceSnapshot;
  balanceAfter: number;
  loanStatusBefore: string;
  loanStatusAfter: string;
  paymentId: string;
  journalEntryId: string;
  borrowerId: string;
  fullyPaid: boolean;
}

class PostingError extends Error {}

/**
 * Applies `amount` to the loan: ledger entries, a Payment row, the installment
 * schedule and the loan's own counters. Throws rather than posting a partial state.
 */
export async function postManualRepayment(
  tx: Prisma.TransactionClient,
  args: PostRepaymentArgs,
): Promise<PostRepaymentResult> {
  const { loanId, paymentDate, description } = args;
  const amount = roundCurrency(Number(args.amount));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new PostingError('Repayment amount must be greater than zero.');
  }

  const order = normalizeOrder(args.allocationOrder);

  // Keep the installment schedule in step with the Super App flow before reading it:
  // an overdue installment is closed and merged forward there, and a branch posting
  // that skipped the merge would leave two channels disagreeing about what is active.
  await ensureInstallmentRollover(tx as never, loanId, paymentDate);

  const [loan, taxConfigs] = await Promise.all([
    tx.loan.findUnique({
      where: { id: loanId },
      include: {
        product: { include: { provider: { include: { ledgerAccounts: true } } } },
        installments: { orderBy: { installmentNumber: 'asc' } },
        // Interest depends on when principal was repaid, so the totals are wrong
        // without the payment history — see the note in the approvals route.
        payments: { orderBy: { date: 'asc' } },
      },
    }),
    tx.tax.findMany({ where: { status: 'ACTIVE' } }),
  ]);

  if (!loan) throw new PostingError(`Loan ${loanId} not found.`);
  const provider = loan.product?.provider;
  if (!provider) throw new PostingError(`No provider configured for loan ${loanId}.`);

  const balanceBefore = loanBalanceSnapshot(loan, loan.product, taxConfigs, paymentDate);
  const totals = calculateTotalRepayable(
    loan as never,
    loan.product as never,
    taxConfigs as never,
    paymentDate,
    true,
  );

  // Anything above the outstanding balance is not booked: there is no suspense
  // account in this ledger, and inflating repaidAmount past the total silently
  // turns into an unexplained credit on the loan.
  const applied = roundCurrency(Math.min(amount, balanceBefore.total));
  const unapplied = roundCurrency(Math.max(0, amount - applied));
  if (applied <= 0) {
    throw new PostingError('This loan has no outstanding balance to apply the repayment to.');
  }

  const journalEntry = await tx.journalEntry.create({
    data: { providerId: provider.id, loanId: loan.id, date: paymentDate, description },
  });

  const accountFor = (bucket: AllocationBucket, type: 'Receivable' | 'Received' | 'Income') =>
    provider.ledgerAccounts.find((a) => a.category === LEDGER_CATEGORY[bucket] && a.type === type);

  const due: Allocation = {
    PENALTY: balanceBefore.penalty,
    SERVICE_FEE: balanceBefore.serviceFee,
    INTEREST: balanceBefore.interest,
    TAX: balanceBefore.tax,
    PRINCIPAL: balanceBefore.principal,
  };

  const allocation = zeroAllocation();
  let remaining = applied;

  for (const bucket of order) {
    const settle = roundCurrency(Math.min(remaining, Math.max(0, due[bucket])));
    if (settle <= 0) continue;

    const receivable = accountFor(bucket, 'Receivable');
    const received = accountFor(bucket, 'Received');
    if (!receivable || !received) {
      throw new PostingError(
        `${LEDGER_CATEGORY[bucket]} ledger accounts are not configured for provider ${provider.name}.`,
      );
    }

    const entries: Prisma.LedgerEntryCreateManyInput[] = [
      { journalEntryId: journalEntry.id, ledgerAccountId: receivable.id, type: 'Credit', amount: settle },
      { journalEntryId: journalEntry.id, ledgerAccountId: received.id, type: 'Debit', amount: settle },
    ];
    await tx.ledgerAccount.update({
      where: { id: receivable.id },
      data: { balance: { decrement: settle } },
    });
    await tx.ledgerAccount.update({
      where: { id: received.id },
      data: { balance: { increment: settle } },
    });

    if (RECOGNISES_INCOME[bucket]) {
      const income = accountFor(bucket, 'Income');
      if (income) {
        await tx.ledgerAccount.update({
          where: { id: income.id },
          data: { balance: { increment: settle } },
        });
        entries.push({
          journalEntryId: journalEntry.id,
          ledgerAccountId: income.id,
          type: 'Credit',
          amount: settle,
        });
      }
    }

    await tx.ledgerEntry.createMany({ data: entries });
    allocation[bucket] = settle;
    remaining = roundCurrency(remaining - settle);
  }

  const repaidBefore = Number(loan.repaidAmount ?? 0);
  const repaidAfter = roundCurrency(repaidBefore + applied);
  const fullyPaid = repaidAfter >= totals.total - TOLERANCE;

  // Installments track penalty and principal only; service fee, interest and tax
  // are loan-level buckets settled against repaidAmount.
  const installmentId = await applyToInstallments(tx, {
    loan,
    paymentDate,
    money: roundCurrency(allocation.PENALTY + allocation.PRINCIPAL),
    fullyPaid,
  });

  const payment = await tx.payment.create({
    data: {
      loanId: loan.id,
      amount: applied,
      date: paymentDate,
      outstandingBalanceBeforePayment: balanceBefore.total,
      journalEntryId: journalEntry.id,
      ...(installmentId ? { installmentId } : {}),
    },
  });

  let repaymentBehavior: string | null = null;
  if (fullyPaid) {
    const payDay = startOfDay(paymentDate);
    const dueDay = startOfDay(loan.dueDate);
    if (isBefore(payDay, dueDay)) repaymentBehavior = 'EARLY';
    else if (isEqual(payDay, dueDay)) repaymentBehavior = 'ON_TIME';
    else repaymentBehavior = 'LATE';
  }

  await tx.loan.update({
    where: { id: loan.id },
    data: {
      repaidAmount: repaidAfter,
      repaymentStatus: fullyPaid ? 'Paid' : 'Unpaid',
      ...(fullyPaid ? { penaltyAmount: 0 } : {}),
      ...(repaymentBehavior ? { repaymentBehavior } : {}),
    },
  });

  return {
    allocation,
    applied,
    unapplied,
    balanceBefore,
    balanceAfter: roundCurrency(Math.max(0, balanceBefore.total - applied)),
    loanStatusBefore: loan.repaymentStatus,
    loanStatusAfter: fullyPaid ? 'Paid' : 'Unpaid',
    paymentId: payment.id,
    journalEntryId: journalEntry.id,
    borrowerId: loan.borrowerId,
    fullyPaid,
  };
}

/**
 * Spreads penalty + principal across open installments, oldest first, and leaves
 * exactly one of them active. Returns the installment the Payment row is filed
 * under (the first one the money touched), or undefined for a loan with no schedule.
 */
async function applyToInstallments(
  tx: Prisma.TransactionClient,
  params: {
    loan: { id: string; installments: InstallmentRow[]; dueDate: Date; product: unknown };
    paymentDate: Date;
    money: number;
    fullyPaid: boolean;
  },
): Promise<string | undefined> {
  const { loan, paymentDate, fullyPaid } = params;
  const installments = loan.installments ?? [];
  if (installments.length === 0) return undefined;

  const product = loan.product as { penaltyRules?: unknown; penaltyPerInstallment?: boolean };
  const penaltyRules = parsePenaltyRules(product?.penaltyRules);
  const penaltyPerInstallment = Boolean(product?.penaltyPerInstallment);

  const isClosed = (status: unknown) =>
    ['PAID', 'MERGED'].includes(String(status ?? '').toUpperCase());
  const open = installments
    .filter((i) => !isClosed(i.status) && Number(i.amount ?? 0) > 0)
    .sort((a, b) => a.installmentNumber - b.installmentNumber);

  let money = params.money;
  let firstTouched: string | undefined;
  let nextActive: string | undefined;

  for (const inst of open) {
    const amountDue = Number(inst.amount ?? 0);
    const paid = Number(inst.paidAmount ?? 0);
    const penaltyAccrued = splitInstallmentPaidAmount({
      installmentAmount: amountDue,
      installmentPaidAmount: paid,
      penaltyRules,
      penaltyDueDate: penaltyPerInstallment ? new Date(inst.dueDate) : new Date(loan.dueDate),
      asOfDate: paymentDate,
    }).penaltyAccrued;

    const capacity = Math.max(0, roundCurrency(amountDue + penaltyAccrued - paid));
    const give = roundCurrency(Math.min(money, capacity));
    const newPaid = roundCurrency(paid + give);
    // A lagging installment counter must not keep a settled loan open, so a loan
    // repaid in full closes every remaining installment regardless of the split.
    const settled = fullyPaid || newPaid >= amountDue + penaltyAccrued - 1e-9;

    if (give > 0 && !firstTouched) firstTouched = inst.id;
    if (!settled && !nextActive) nextActive = inst.id;
    const shouldBeActive = !settled && nextActive === inst.id;

    // The flag has to be written even when no money reached this installment: a
    // payment that exactly settles the one before it leaves this one to take over,
    // and skipping the write there left the loan with no active installment at all.
    if (give > 0 || settled || inst.isActive !== shouldBeActive) {
      await tx.loanInstallment.update({
        where: { id: inst.id },
        data: {
          paidAmount: newPaid,
          penaltyAmount: penaltyAccrued,
          status: settled ? 'PAID' : inst.status,
          isActive: shouldBeActive,
          ...(give > 0 || settled ? { paidAt: paymentDate } : {}),
        },
      });
    }

    money = roundCurrency(money - give);
  }

  // Everything merged into an installment this payment closed is closed with it.
  if (fullyPaid) {
    await tx.loanInstallment.updateMany({
      where: { loanId: loan.id, status: { notIn: ['PAID', 'Paid'] } },
      data: { status: 'PAID', isActive: false, paidAt: paymentDate },
    });
  }

  return firstTouched ?? open[0]?.id;
}

type InstallmentRow = {
  id: string;
  installmentNumber: number;
  amount: number;
  paidAmount: number | null;
  dueDate: Date;
  status: string;
  isActive: boolean;
};

function parsePenaltyRules(raw: unknown) {
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return Array.isArray(raw) ? raw : [];
}

function normalizeOrder(order: AllocationBucket[] | undefined): AllocationBucket[] {
  if (!order || order.length !== ALLOCATION_BUCKETS.length) return DEFAULT_ALLOCATION_ORDER;
  const unique = new Set(order);
  const complete = ALLOCATION_BUCKETS.every((b) => unique.has(b));
  return complete ? order : DEFAULT_ALLOCATION_ORDER;
}

// --------------------------------------
// Reversal (BRD 3.7: errors are corrected only by an approved reversal)
// --------------------------------------

export interface ReverseRepaymentResult {
  journalEntryId: string;
  balanceAfter: number;
  loanStatusAfter: string;
}

/**
 * Backs a posted repayment out: a mirrored journal entry, the Payment row deleted,
 * and `repaidAmount` wound back. The original entry is left untouched so the GL
 * keeps both halves of the correction.
 */
export async function reverseManualRepaymentPosting(
  tx: Prisma.TransactionClient,
  params: {
    loanId: string;
    paymentId: string | null;
    journalEntryId: string | null;
    /**
     * What the posting actually applied — not what the maker keyed in. An
     * overpayment posted under the WARN policy books less than it recorded, and
     * winding back the recorded figure would wipe out other repayments' money.
     */
    appliedAmount: number;
    /** The penalty + principal portion, which is all the schedule ever tracked. */
    installmentAmount: number;
    reason: string;
    reversedBy: string;
  },
): Promise<ReverseRepaymentResult> {
  const { loanId, paymentId, journalEntryId, reason } = params;
  const amount = roundCurrency(Number(params.appliedAmount));
  const installmentAmount = roundCurrency(Number(params.installmentAmount));

  const original = journalEntryId
    ? await tx.journalEntry.findUnique({
        where: { id: journalEntryId },
        include: { entries: true },
      })
    : null;

  const loan = await tx.loan.findUnique({
    where: { id: loanId },
    include: {
      product: { include: { provider: true } },
      installments: { orderBy: { installmentNumber: 'asc' } },
    },
  });
  if (!loan) throw new PostingError(`Loan ${loanId} not found.`);
  const providerId = loan.product?.provider?.id;
  if (!providerId) throw new PostingError(`No provider configured for loan ${loanId}.`);

  const reversalJournal = await tx.journalEntry.create({
    data: {
      providerId,
      loanId,
      date: new Date(),
      description: `Reversal: manual repayment ${paymentId ?? journalEntryId ?? ''} — ${reason}`,
    },
  });

  for (const entry of original?.entries ?? []) {
    const mirrored = entry.type === 'Debit' ? 'Credit' : 'Debit';
    await tx.ledgerEntry.create({
      data: {
        journalEntryId: reversalJournal.id,
        ledgerAccountId: entry.ledgerAccountId,
        type: mirrored,
        amount: entry.amount,
      },
    });
    // A Debit raised the balance when it was posted, so unwinding it lowers it.
    await tx.ledgerAccount.update({
      where: { id: entry.ledgerAccountId },
      data: { balance: { increment: entry.type === 'Debit' ? -entry.amount : entry.amount } },
    });
  }

  // The Payment row has to go: interest accrual reads the payment history, so a
  // repayment left in place would keep suppressing interest it no longer paid.
  if (paymentId) {
    await tx.payment.deleteMany({ where: { id: paymentId } });
  }

  const repaidAfter = roundCurrency(Math.max(0, Number(loan.repaidAmount ?? 0) - amount));
  await tx.loan.update({
    where: { id: loanId },
    data: {
      repaidAmount: repaidAfter,
      repaymentStatus: 'Unpaid',
      repaymentBehavior: null,
    },
  });

  // Re-open the schedule: the money that closed these installments is gone. Only
  // the penalty + principal share ever reached it; service fee, interest and tax
  // are loan-level and were never written to an installment's paidAmount.
  await reopenInstallments(tx, loanId, installmentAmount);

  const taxConfigs = await tx.tax.findMany({ where: { status: 'ACTIVE' } });
  const refreshed = await tx.loan.findUnique({
    where: { id: loanId },
    include: {
      product: true,
      installments: { orderBy: { installmentNumber: 'asc' } },
      payments: { orderBy: { date: 'asc' } },
    },
  });
  const balanceAfter = refreshed
    ? loanBalanceSnapshot(refreshed, refreshed.product, taxConfigs, new Date()).total
    : 0;

  return { journalEntryId: reversalJournal.id, balanceAfter, loanStatusAfter: 'Unpaid' };
}

/**
 * Takes `amount` back off the installment schedule, newest-paid first, mirroring
 * the oldest-first order the posting applied it in.
 */
async function reopenInstallments(tx: Prisma.TransactionClient, loanId: string, amount: number) {
  const installments = await tx.loanInstallment.findMany({
    where: { loanId },
    orderBy: { installmentNumber: 'desc' },
  });

  let money = amount;
  let reopenedCount = 0;

  for (const inst of installments) {
    if (money <= 0) break;
    // A merged installment carries no money of its own; re-opening it as PENDING
    // would resurrect a schedule row the rollover had already folded forward.
    if (String(inst.status ?? '').toUpperCase() === 'MERGED') continue;
    const paid = Number(inst.paidAmount ?? 0);
    if (paid <= 0) continue;

    const take = roundCurrency(Math.min(money, paid));
    const newPaid = roundCurrency(paid - take);
    await tx.loanInstallment.update({
      where: { id: inst.id },
      data: {
        paidAmount: newPaid,
        status: 'PENDING',
        isActive: false,
        ...(newPaid <= 0 ? { paidAt: null } : {}),
      },
    });
    money = roundCurrency(money - take);
    reopenedCount += 1;
  }

  // Exactly one installment is active again: the earliest that still owes money.
  const open = await tx.loanInstallment.findFirst({
    where: { loanId, status: { notIn: ['PAID', 'Paid', 'MERGED', 'Merged'] }, amount: { gt: 0 } },
    orderBy: { installmentNumber: 'asc' },
  });
  if (open) {
    await tx.loanInstallment.update({ where: { id: open.id }, data: { isActive: true } });
  }

  return reopenedCount;
}

export { PostingError };
