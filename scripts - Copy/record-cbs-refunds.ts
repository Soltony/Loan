/**
 * One-off data fix: take out of the portal the transactions NIB's reconciliation
 * team refunded to borrowers in the CBS, so their overpayments disappear while
 * every repayment that stays keeps its CBS amount.
 *
 *   HAMID HADI MOHAMMED  7000008186737  FT261739MJF8 448.06 + FT26173553QQ 400.00 + FT26173B1T2S 21.60 = 869.66
 *   ERMIYAS TADESSE      7000013486528  FT261908Y8VV 500.26 + FT26180N17C8 109.81                    = 610.07
 *   TIGIST ERKO LATA     7000107677424  FT26198YH98D 800.76
 *   DEBORA MEKONNEN      7000103189182  FT26111VKG2J 6,000.00 (resolved onto a loan already repaid)
 *   MIKIYAS ASFAW ABEBE  7000027829843  FT26171Z5HDB 132.00  (paid after the loan was settled)
 *
 * Each refunded transaction is removed whole: its payment, its journal entry and the
 * ledger balances it moved, as if the CBS had reversed it. The CBS notification that
 * posted it keeps its record but no longer points at a payment. A manual
 * resolution's pending payment is marked REFUNDED. The audit log keeps everything
 * removed.
 *
 * For HAMID, ERMIYAS and TIGIST that leaves the SuperApp repayment at its CBS amount
 * and the loan 9.00 short of its terms. The portal reports the 9.00 as waived
 * penalty. TIGIST's penalty is only 5.00, so hers is 5.00 penalty and 4.00 interest.
 *
 * An earlier version of this script reduced the SuperApp repayments instead (the
 * bank's amendment of 12 Oct: portal 9,160.34 against CBS 10,030.00 for
 * FT26180HHS8Q, and so on). Where it ran, those repayments are first put back to
 * their CBS amounts from its audit entries. The two repayments it deleted (DEBORA,
 * MIKIYAS) are already in the state this version leaves them.
 *
 * TILAHUN DEDACHO GENTAMO, ADDISE MATHEWOS and TAGAY YANU BELEKU are not here: their
 * money never reached the portal.
 *
 * Dry run by default. --rehearse runs every write in one transaction, reads the
 * result back and rolls it all back; --apply commits.
 *
 *   npx tsx -r tsconfig-paths/register scripts/record-cbs-refunds.ts [--rehearse | --apply]
 */
import type { Prisma } from '@prisma/client';
import prisma from '../src/lib/prisma';
import { parseRepaymentReference, referenceFor } from '../src/lib/repayment-reference';
import { reconcileRepaymentsForLoans } from '../src/lib/repayment-reconciliation-data';

interface Case {
  customer: string;
  account: string;
  loanId: string;
  /** The transactions the bank refunded, by CBS reference. */
  refunded: string[];
  /** What the bank refunded in total. */
  refundTotal: number;
  /** The SuperApp repayment that stays, at its CBS amount, and its installment counter. */
  keep?: { paymentId: string; cbsAmount: number; installmentPaidAmount: number };
  pendingPaymentId?: string;
}

const CASES: Case[] = [
  {
    customer: 'HAMID HADI MOHAMMED',
    account: '7000008186737',
    loanId: 'cmkdome5h0017i03cqyjck0fu',
    refunded: ['FT261739MJF8', 'FT26173553QQ', 'FT26173B1T2S'],
    refundTotal: 869.66,
    keep: { paymentId: 'cmqyxpdjy07us8ardy8uhoi9t', cbsAmount: 10030, installmentPaidAmount: 10030 },
  },
  {
    customer: 'ERMIYAS TADESSE HAILEMARIAM',
    account: '7000013486528',
    loanId: 'cmn7jw9vm104jzr6pxoq8sh5w',
    refunded: ['FT261908Y8VV', 'FT26180N17C8'],
    refundTotal: 610.07,
    keep: { paymentId: 'cmrucbc6805m1zlvtdr11tee0', cbsAmount: 10027, installmentPaidAmount: 10027 },
  },
  {
    customer: 'TIGIST ERKO LATA',
    account: '7000107677424',
    loanId: 'cmo30wjjq12bjz7egicb0f0jo',
    refunded: ['FT26198YH98D'],
    refundTotal: 800.76,
    keep: { paymentId: 'cmrubf7ir056wzlvt3ccv3h0x', cbsAmount: 10005, installmentPaidAmount: 10005 },
  },
  {
    customer: 'DEBORA MEKONNEN ABTEW',
    account: '7000103189182',
    loanId: 'cmkv5wt3q0d91np50ps4ycn0w',
    refunded: ['FT26111VKG2J'],
    refundTotal: 6000,
    pendingPaymentId: 'cmo89g1c600ir137ul6pdlob7',
  },
  {
    customer: 'MIKIYAS ASFAW ABEBE',
    account: '7000027829843',
    loanId: 'cmm3d380p06h7e1gzf6i14jrk',
    refunded: ['FT26171Z5HDB'],
    refundTotal: 132,
  },
];

/** Left by the earlier version of this script, which reduced or deleted the overpaid repayment. */
const EARLIER = 'OVERPAYMENT_REFUNDED_IN_CBS';
const ACTION = 'REFUNDED_TRANSACTIONS_REMOVED';
const SCRIPT = 'scripts/record-cbs-refunds.ts';
const TOLERANCE = 0.005;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const money = (n: number) => r2(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** How posting an entry moved its account's balance (as the repayment flows post them). */
function postedDelta(accountType: string, entryType: string, amount: number): number {
  if (accountType === 'Receivable' || accountType === 'Received') return entryType === 'Debit' ? amount : -amount;
  if (accountType === 'Income') return entryType === 'Credit' ? amount : -amount;
  throw new Error(`Unexpected ${accountType} account on a repayment entry`);
}

interface EarlierRun {
  refund: number;
  paymentAmountBefore: number;
  paymentDeleted: boolean;
  journalEntry: { id: string; entries: { ledgerAccountId: string; type: string; amount: number }[] };
}

class Rehearsal extends Error {}

async function run() {
  const apply = process.argv.includes('--apply');
  const rehearse = process.argv.includes('--rehearse');

  const payments = await prisma.payment.findMany({
    where: { loanId: { in: CASES.map((c) => c.loanId) } },
    include: { journalEntry: { include: { entries: { include: { ledgerAccount: { select: { type: true } } } } } } },
  });
  const [gateway, pending, audits, loans] = await Promise.all([
    prisma.paymentTransaction.findMany({
      where: { txnRef: { in: payments.flatMap((p) => { const r = parseRepaymentReference(p.journalEntry?.description); return r.kind === 'superapp' ? [r.txnRef] : []; }) } },
      select: { txnRef: true, transactionId: true },
    }),
    prisma.pendingPayment.findMany({ where: { loanId: { in: CASES.map((c) => c.loanId) } }, select: { id: true, transactionId: true, status: true } }),
    // A handful of rows: the earlier version wrote one per refunded repayment.
    prisma.auditLog.findMany({ where: { action: EARLIER }, select: { action: true, entityId: true, details: true } }),
    prisma.loan.findMany({ where: { id: { in: CASES.map((c) => c.loanId) } }, select: { id: true, repaymentStatus: true } }),
  ]);
  const ftByTxnRef = new Map(gateway.filter((g) => g.txnRef).map((g) => [g.txnRef!, g.transactionId]));
  const ftByPendingPayment = new Map(pending.map((p) => [p.id, p.transactionId]));
  const ftOf = (p: (typeof payments)[number]) =>
    (referenceFor(parseRepaymentReference(p.journalEntry?.description), { ftByTxnRef, ftByPendingPayment }) ?? '').toUpperCase();

  const problems: string[] = [];
  const plan = CASES.map((c) => {
    const loan = loans.find((l) => l.id === c.loanId);
    if (loan?.repaymentStatus !== 'Paid') problems.push(`${c.customer}: loan is ${loan?.repaymentStatus ?? 'missing'}, expected Paid`);
    const remove = payments.filter((p) => p.loanId === c.loanId && c.refunded.includes(ftOf(p)));
    const earlierOnLoan = audits.some((a) => a.action === EARLIER && JSON.parse(a.details ?? '{}').loanId === c.loanId);
    const missing = c.refunded.filter((ft) => !remove.some((p) => ftOf(p) === ft));
    // The earlier version deleted DEBORA's and MIKIYAS's refunded repayment outright.
    if (missing.length && !(earlierOnLoan && !c.keep)) problems.push(`${c.customer}: ${missing.join(', ')} not found on the loan`);
    const removedTotal = r2(remove.reduce((s, p) => s + p.amount, 0));
    if (remove.length && Math.abs(removedTotal - c.refundTotal) > TOLERANCE) {
      problems.push(`${c.customer}: the refunded transactions add up to ${money(removedTotal)}, expected ${money(c.refundTotal)}`);
    }
    const keepAudit = c.keep ? audits.find((a) => a.action === EARLIER && a.entityId === c.keep!.paymentId) : undefined;
    const keepPayment = c.keep ? payments.find((p) => p.id === c.keep!.paymentId) : undefined;
    if (c.keep && !keepPayment) problems.push(`${c.customer}: the SuperApp repayment ${c.keep.paymentId} is missing`);
    const restore =
      keepAudit && keepPayment && Math.abs(keepPayment.amount - c.keep!.cbsAmount) > TOLERANCE ? (JSON.parse(keepAudit.details!) as EarlierRun) : null;
    if (keepPayment && !restore && Math.abs(keepPayment.amount - c.keep!.cbsAmount) > TOLERANCE) {
      problems.push(`${c.customer}: repayment is ${money(keepPayment.amount)}, not its CBS amount ${money(c.keep!.cbsAmount)}, and no earlier run explains it`);
    }
    return { c, remove, restore, keepPayment };
  });
  if (problems.length) {
    console.error('Refusing to run:\n  ' + problems.join('\n  '));
    process.exit(1);
  }

  console.log('\nTransactions refunded by the bank:');
  for (const { c, remove, restore } of plan) {
    const steps: string[] = [];
    if (restore) steps.push(`put the SuperApp repayment back to ${money(c.keep!.cbsAmount)}`);
    if (remove.length) steps.push(`remove ${remove.map((p) => `${ftOf(p)} ${money(p.amount)}`).join(' + ')}`);
    console.log(`  ${c.customer}: ${steps.join('; ') || 'already done'}`);
  }
  const work = plan.filter((p) => p.restore || p.remove.length);
  if (work.length === 0) {
    console.log('\nNothing to do.');
    return;
  }
  if (!apply && !rehearse) {
    console.log('\nDRY RUN — no changes written. Re-run with --rehearse to test the writes, or --apply to commit.');
    return;
  }

  const accountTypes = new Map((await prisma.ledgerAccount.findMany({ select: { id: true, type: true } })).map((a) => [a.id, a.type]));

  const handle = async (tx: Prisma.TransactionClient, { c, remove, restore, keepPayment }: (typeof plan)[number]) => {
    if (restore && keepPayment) {
      const current = await tx.ledgerEntry.findMany({ where: { journalEntryId: restore.journalEntry.id } });
      for (const e of restore.journalEntry.entries) {
        const now = current.find((x) => x.ledgerAccountId === e.ledgerAccountId && x.type === e.type);
        if (!now) throw new Error(`${c.customer}: journal entry ${restore.journalEntry.id} lost an entry since the earlier run`);
        const back = r2(e.amount - now.amount);
        if (Math.abs(back) < TOLERANCE) continue;
        await tx.ledgerEntry.update({ where: { id: now.id }, data: { amount: e.amount } });
        await tx.ledgerAccount.update({
          where: { id: e.ledgerAccountId },
          data: { balance: { increment: postedDelta(accountTypes.get(e.ledgerAccountId)!, e.type, back) } },
        });
      }
      await tx.payment.update({ where: { id: keepPayment.id }, data: { amount: c.keep!.cbsAmount } });
      await tx.loan.update({ where: { id: c.loanId }, data: { repaidAmount: { increment: restore.refund } } });
    }
    if (c.keep && keepPayment?.installmentId) {
      await tx.loanInstallment.update({ where: { id: keepPayment.installmentId }, data: { paidAmount: c.keep.installmentPaidAmount } });
    }

    for (const p of remove) {
      const je = p.journalEntry;
      if (je) {
        for (const e of je.entries) {
          await tx.ledgerAccount.update({
            where: { id: e.ledgerAccountId },
            data: { balance: { increment: -postedDelta(e.ledgerAccount.type, e.type, e.amount) } },
          });
        }
      }
      await tx.payment.delete({ where: { id: p.id } });
      if (je) {
        await tx.ledgerEntry.deleteMany({ where: { journalEntryId: je.id } });
        await tx.journalEntry.delete({ where: { id: je.id } });
      }
      const notifications = await tx.nplCreditNotification.findMany({ where: { paymentId: p.id }, select: { id: true, resultMessage: true } });
      for (const n of notifications) {
        await tx.nplCreditNotification.update({
          where: { id: n.id },
          data: {
            paymentId: null,
            resultMessage: `${n.resultMessage ?? ''} | Refunded to the borrower by NIB; the posting was removed by ${SCRIPT}.`.trim(),
          },
        });
      }
      await tx.loan.update({ where: { id: c.loanId }, data: { repaidAmount: { decrement: p.amount } } });
      if (p.installmentId && p.installmentId !== keepPayment?.installmentId) {
        const inst = await tx.loanInstallment.findUniqueOrThrow({ where: { id: p.installmentId } });
        await tx.loanInstallment.update({ where: { id: inst.id }, data: { paidAmount: r2(Math.max(inst.amount, (inst.paidAmount ?? 0) - p.amount)) } });
      }
    }
    if (c.pendingPaymentId) {
      await tx.pendingPayment.updateMany({ where: { id: c.pendingPaymentId, status: 'COMPLETED' }, data: { status: 'REFUNDED' } });
    }
    await tx.auditLog.create({
      data: {
        actorId: 'system',
        action: ACTION,
        entity: 'Loan',
        entityId: c.loanId,
        details: JSON.stringify({
          customer: c.customer,
          refundedTo: c.account,
          refundTotal: c.refundTotal,
          restoredRepayment: restore ? { paymentId: keepPayment!.id, amount: c.keep!.cbsAmount } : null,
          removed: remove.map((p) => ({
            paymentId: p.id,
            reference: ftOf(p),
            amount: p.amount,
            date: p.date,
            installmentId: p.installmentId,
            outstandingBalanceBeforePayment: p.outstandingBalanceBeforePayment,
            journalEntry: p.journalEntry && {
              id: p.journalEntry.id,
              providerId: p.journalEntry.providerId,
              date: p.journalEntry.date,
              description: p.journalEntry.description,
              entries: p.journalEntry.entries.map((e) => ({ ledgerAccountId: e.ledgerAccountId, type: e.type, amount: e.amount })),
            },
          })),
          reason: `Refunded to the borrower by NIB's reconciliation team in the CBS; the refunded transactions are removed. ${SCRIPT}.`,
        }),
      },
    });
  };

  const report = async (db: Prisma.TransactionClient | typeof prisma, header: string) => {
    console.log(`\n${header}`);
    const split = await reconcileRepaymentsForLoans(db as any, work.map((p) => p.c.loanId));
    for (const { c } of work) {
      const loan = await db.loan.findUniqueOrThrow({ where: { id: c.loanId }, select: { repaidAmount: true } });
      const left = await db.payment.findMany({ where: { loanId: c.loanId }, orderBy: { date: 'asc' }, select: { amount: true } });
      const a = split.byLoan.get(c.loanId);
      console.log(
        `  ${c.customer}: repayments ${left.map((p) => money(p.amount)).join(' + ')} = ${money(loan.repaidAmount ?? 0)} | ` +
          `interest ${money(a?.interest ?? 0)}, penalty ${money(a?.penalty ?? 0)}, overpaid ${money(a?.unapplied ?? 0)}`,
      );
    }
  };

  try {
    await prisma.$transaction(
      async (tx) => {
        for (const step of work) await handle(tx, step);
        if (rehearse) {
          await report(tx, 'REHEARSAL — state inside the transaction:');
          throw new Rehearsal();
        }
      },
      { maxWait: 15_000, timeout: 120_000 },
    );
  } catch (e) {
    if (!(e instanceof Rehearsal)) throw e;
    console.log('\nREHEARSAL — every write ran and was rolled back. Nothing changed.');
    return;
  }
  await report(prisma, 'Done:');
}

run()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
