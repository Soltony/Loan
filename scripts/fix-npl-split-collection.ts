/**
 * One-off data fix: consolidate a split CBS NPL collection into the single
 * repayment the CBS actually posted.
 *
 * Background
 * ----------
 * Two credit notifications for account 7000021933568 arrived in the same second
 * (2026-07-21 13:14:56) and were processed concurrently. Both read the loan
 * before either had committed, so both saw the full outstanding of 10,034.00:
 *
 *   FT262022WY3Y  credited   563.76  ->  debited    563.76  (PARTIAL_REPAID)
 *   FT26202FXY5R  credited 10,711.48 ->  debited 10,034.00  (REPAID)
 *
 * Both debits are real, so 10,597.76 left the customer's account against a
 * 10,034.00 debt. `recordCbsRepayment` caps each posting at what is still owed
 * (`paymentAmount = Math.min(amount, totalDue)`), so FT26202FXY5R — which the
 * CBS debited in full — was written down to 9,470.24 on the way in. The ledger
 * shows two payments (563.76 + 9,470.24) that happen to sum to the right total,
 * which hides both the misattributed reference and the 563.76 the customer is
 * owed back.
 *
 * What this script does
 * ---------------------
 *  - Re-points the 563.76 journal entry's ledger entries onto the FT26202FXY5R
 *    journal entry, so the surviving entry carries the full penalty 25.00 /
 *    interest 9.00 / principal 10,000.00 breakdown the CBS actually collected.
 *  - Deletes the 563.76 Payment and its now-empty JournalEntry.
 *  - Raises the surviving Payment to 10,034.00 (outstanding-before = 10,034.00).
 *  - Retires the 563.76 credit notification (marked DUPLICATE, or deleted with
 *    --delete-notification), recording that its debit was real and unapplied.
 *
 * LedgerAccount balances, loan.repaidAmount (10,034.00) and repaymentStatus
 * (Paid) are deliberately left untouched: the loan was and remains settled at
 * 10,034.00. Only the split across records changes.
 *
 * NOT HANDLED — the 563.76 the CBS took under FT262022WY3Y is money we hold and
 * the customer is owed. There is no refund entity in the schema, so this script
 * only records the obligation in the audit log and on the notification; the
 * refund itself has to be raised outside the system.
 *
 * Dry run by default. Pass --apply to commit the changes.
 * Pass --delete-notification to remove the 563.76 notification row entirely
 * instead of marking it DUPLICATE.
 *
 *   npx tsx -r tsconfig-paths/register scripts/fix-npl-split-collection.ts
 *   npx tsx -r tsconfig-paths/register scripts/fix-npl-split-collection.ts --apply
 */
import prisma from '../src/lib/prisma';

// The loan is resolved from the two notifications below rather than hard-coded,
// so a mistyped cuid cannot point the fix at the wrong record.
const ACCOUNT_NUMBER = '7000021933568';

/** The collection that survives — the CBS reference the money really moved on. */
const KEEP_TXN = 'FT26202FXY5R';
/** The collection that gets folded into the one above. */
const STALE_TXN = 'FT262022WY3Y';

const EXPECTED_KEEP_AMOUNT = 9470.24;
const EXPECTED_STALE_AMOUNT = 563.76;
const TARGET_AMOUNT = 10034.0;

const TOLERANCE = 0.01;
const money = (n: number | null | undefined) =>
  Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const near = (a: number | null | undefined, b: number) => Math.abs(Number(a ?? 0) - b) <= TOLERANCE;

async function run() {
  const apply = process.argv.includes('--apply');
  const deleteNotification = process.argv.includes('--delete-notification');

  const notifications = await prisma.nplCreditNotification.findMany({
    where: { repayTransactionId: { in: [KEEP_TXN, STALE_TXN] } },
    orderBy: { receivedAt: 'asc' },
  });
  const keepNotif = notifications.find((n) => n.repayTransactionId === KEEP_TXN);
  const staleNotif = notifications.find((n) => n.repayTransactionId === STALE_TXN);
  if (!keepNotif) throw new Error(`No credit notification found for ${KEEP_TXN}.`);
  if (!staleNotif) throw new Error(`No credit notification found for ${STALE_TXN}.`);
  if (!keepNotif.loanId) throw new Error(`Notification ${KEEP_TXN} is not linked to a loan.`);
  if (keepNotif.loanId !== staleNotif.loanId) {
    throw new Error(
      `${KEEP_TXN} and ${STALE_TXN} point at different loans (${keepNotif.loanId} vs ${staleNotif.loanId}); ` +
        'they are not the same collection.',
    );
  }
  const loanId = keepNotif.loanId;

  const loan = await prisma.loan.findUnique({
    where: { id: loanId },
    select: {
      id: true,
      borrowerId: true,
      loanAmount: true,
      repaidAmount: true,
      repaymentStatus: true,
      payments: { orderBy: { date: 'asc' } },
    },
  });
  if (!loan) throw new Error(`Loan ${loanId} not found.`);

  const keepPayment = loan.payments.find((p) => p.id === keepNotif.paymentId);
  const stalePayment = loan.payments.find((p) => p.id === staleNotif.paymentId);
  if (!keepPayment) throw new Error(`Payment ${keepNotif.paymentId} (${KEEP_TXN}) not found on the loan.`);
  if (!stalePayment) throw new Error(`Payment ${staleNotif.paymentId} (${STALE_TXN}) not found on the loan.`);
  if (!keepPayment.journalEntryId) throw new Error(`Payment ${keepPayment.id} has no journal entry.`);
  if (!stalePayment.journalEntryId) throw new Error(`Payment ${stalePayment.id} has no journal entry.`);

  const journalEntries = await prisma.journalEntry.findMany({
    where: { id: { in: [keepPayment.journalEntryId, stalePayment.journalEntryId] } },
    include: { entries: { include: { ledgerAccount: true } } },
  });
  const keepJe = journalEntries.find((j) => j.id === keepPayment.journalEntryId)!;
  const staleJe = journalEntries.find((j) => j.id === stalePayment.journalEntryId)!;

  // ---- Guard rails: refuse to touch anything that is not the known-bad shape.
  const problems: string[] = [];
  if (!near(stalePayment.amount, EXPECTED_STALE_AMOUNT))
    problems.push(`${STALE_TXN} payment is ${money(stalePayment.amount)}, expected ${money(EXPECTED_STALE_AMOUNT)}.`);
  if (!near(keepPayment.amount, EXPECTED_KEEP_AMOUNT))
    problems.push(`${KEEP_TXN} payment is ${money(keepPayment.amount)}, expected ${money(EXPECTED_KEEP_AMOUNT)}.`);
  if (!near(stalePayment.amount + keepPayment.amount, TARGET_AMOUNT))
    problems.push(
      `The two payments sum to ${money(stalePayment.amount + keepPayment.amount)}, expected ${money(TARGET_AMOUNT)}.`,
    );
  if (!near(loan.repaidAmount, TARGET_AMOUNT))
    problems.push(`loan.repaidAmount is ${money(loan.repaidAmount)}, expected ${money(TARGET_AMOUNT)}.`);
  if (!near(Number(staleNotif.repayDebitAmount), EXPECTED_STALE_AMOUNT))
    problems.push(`${STALE_TXN} debited ${money(staleNotif.repayDebitAmount)}, expected ${money(EXPECTED_STALE_AMOUNT)}.`);
  if (!near(Number(keepNotif.repayDebitAmount), TARGET_AMOUNT))
    problems.push(`${KEEP_TXN} debited ${money(keepNotif.repayDebitAmount)}, expected ${money(TARGET_AMOUNT)}.`);
  if (stalePayment.installmentId || keepPayment.installmentId)
    problems.push('One of the payments is linked to an installment; installment counters would need fixing too.');

  const describeJe = (label: string, je: typeof keepJe, payment: { id: string; amount: number }) => {
    console.log(`\n  ${label}`);
    console.log(`    payment      : ${payment.id}  ${money(payment.amount)}`);
    console.log(`    journalEntry : ${je.id}`);
    console.log(`    description  : ${je.description}`);
    for (const e of je.entries) {
      console.log(
        `      ${e.type.padEnd(6)} ${String(e.ledgerAccount?.category ?? '?').padEnd(11)} ` +
          `${String(e.ledgerAccount?.type ?? '?').padEnd(11)} ${money(e.amount).padStart(12)}`,
      );
    }
  };

  console.log('--- BEFORE ---');
  console.log(`loan            : ${loan.id}  borrower=${loan.borrowerId}  account=${ACCOUNT_NUMBER}`);
  console.log(`loanAmount      : ${money(loan.loanAmount)}`);
  console.log(`repaidAmount    : ${money(loan.repaidAmount)}   status=${loan.repaymentStatus}`);
  console.log(`payments        : ${loan.payments.length}`);
  describeJe(`KEEP  ${KEEP_TXN}`, keepJe, keepPayment);
  describeJe(`STALE ${STALE_TXN}`, staleJe, stalePayment);
  console.log(`\n  notifications`);
  for (const n of [staleNotif, keepNotif]) {
    console.log(
      `    ${n.repayTransactionId}  ${n.processStatus.padEnd(15)} credited=${money(n.creditedAmount).padStart(12)}` +
        `  debited=${money(n.repayDebitAmount).padStart(12)}  payment=${n.paymentId}`,
    );
  }

  if (problems.length > 0) {
    console.warn('\n[!] The data is not in the expected state. Aborting without changes:');
    for (const p of problems) console.warn(`    - ${p}`);
    return;
  }

  const movedEntries = staleJe.entries.length;
  console.log('\n--- PLANNED CHANGES ---');
  console.log(`move ${movedEntries} ledger entr${movedEntries === 1 ? 'y' : 'ies'} from ${staleJe.id} -> ${keepJe.id}`);
  console.log(`payment ${keepPayment.id}: ${money(keepPayment.amount)} -> ${money(TARGET_AMOUNT)}`);
  console.log(
    `payment ${keepPayment.id}: outstandingBefore ${money(keepPayment.outstandingBalanceBeforePayment)} -> ${money(TARGET_AMOUNT)}`,
  );
  console.log(`delete payment ${stalePayment.id} (${money(stalePayment.amount)})`);
  console.log(`delete journalEntry ${staleJe.id}`);
  console.log(
    deleteNotification
      ? `delete notification ${staleNotif.id} (${STALE_TXN})`
      : `notification ${staleNotif.id} (${STALE_TXN}): ${staleNotif.processStatus} -> DUPLICATE, paymentId cleared`,
  );
  console.log(`loan.repaidAmount   : ${money(loan.repaidAmount)} (UNCHANGED)`);
  console.log(`loan.repaymentStatus: ${loan.repaymentStatus} (UNCHANGED)`);
  console.log('LedgerAccount balances: UNCHANGED (total applied to the loan is the same)');

  console.log('\n--- NOT HANDLED BY THIS SCRIPT ---');
  console.log(`CBS debited the customer : ${money(TARGET_AMOUNT + EXPECTED_STALE_AMOUNT)} (${KEEP_TXN} + ${STALE_TXN})`);
  console.log(`Applied to the loan      : ${money(TARGET_AMOUNT)}`);
  console.log(`Owed back to the customer: ${money(EXPECTED_STALE_AMOUNT)}  <-- raise this refund separately`);

  if (!apply) {
    console.log('\nDRY RUN — no changes written. Re-run with --apply to commit.');
    return;
  }

  const consolidationNote =
    `Restated to the ${money(TARGET_AMOUNT)} the CBS actually debited under ${KEEP_TXN}. ` +
    `The concurrent ${money(EXPECTED_STALE_AMOUNT)} collection under ${STALE_TXN} was folded in; ` +
    `that debit was also real, so ${money(EXPECTED_STALE_AMOUNT)} was over-collected and is owed back to the customer.`;

  await prisma.$transaction(async (tx) => {
    // Re-point rather than recreate: the LedgerAccount running balances already
    // reflect these amounts and must not move.
    await tx.ledgerEntry.updateMany({
      where: { journalEntryId: staleJe.id },
      data: { journalEntryId: keepJe.id },
    });

    // Break the Payment -> JournalEntry link before deleting either side.
    await tx.payment.delete({ where: { id: stalePayment.id } });
    await tx.journalEntry.delete({ where: { id: staleJe.id } });

    await tx.payment.update({
      where: { id: keepPayment.id },
      data: { amount: TARGET_AMOUNT, outstandingBalanceBeforePayment: TARGET_AMOUNT },
    });

    await tx.journalEntry.update({
      where: { id: keepJe.id },
      data: { description: `${keepJe.description} — ${consolidationNote}` },
    });

    if (deleteNotification) {
      await tx.nplCreditNotification.delete({ where: { id: staleNotif.id } });
    } else {
      await tx.nplCreditNotification.update({
        where: { id: staleNotif.id },
        data: {
          processStatus: 'DUPLICATE',
          paymentId: null,
          resultMessage:
            `Superseded by ${KEEP_TXN}: both notifications were processed concurrently and each read the ` +
            `full ${money(TARGET_AMOUNT)} outstanding, so the CBS debited the customer twice. The loan is ` +
            `settled once, under ${KEEP_TXN}. This ${money(EXPECTED_STALE_AMOUNT)} debit did leave the ` +
            `customer's account and is NOT applied to any loan — it is owed back as a refund.`,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        actorId: 'system',
        action: 'FIX_NPL_SPLIT_COLLECTION',
        entity: 'Payment',
        entityId: keepPayment.id,
        details: JSON.stringify({
          loanId: loan.id,
          borrowerId: loan.borrowerId,
          accountNumber: ACCOUNT_NUMBER,
          keepTransactionId: KEEP_TXN,
          staleTransactionId: STALE_TXN,
          deletedPaymentId: stalePayment.id,
          deletedPaymentAmount: stalePayment.amount,
          deletedJournalEntryId: staleJe.id,
          movedLedgerEntries: movedEntries,
          paymentAmountBefore: keepPayment.amount,
          paymentAmountAfter: TARGET_AMOUNT,
          staleNotificationId: staleNotif.id,
          staleNotificationAction: deleteNotification ? 'DELETED' : 'MARKED_DUPLICATE',
          totalDebitedByCbs: TARGET_AMOUNT + EXPECTED_STALE_AMOUNT,
          totalAppliedToLoan: TARGET_AMOUNT,
          unappliedSurplusOwedToCustomer: EXPECTED_STALE_AMOUNT,
          note: consolidationNote,
        }),
      },
    });
  });

  const [afterLoan, afterJe] = await Promise.all([
    prisma.loan.findUnique({
      where: { id: loanId },
      select: { repaidAmount: true, repaymentStatus: true, payments: true },
    }),
    prisma.journalEntry.findUnique({
      where: { id: keepJe.id },
      include: { entries: { include: { ledgerAccount: true } }, payment: true },
    }),
  ]);

  console.log('\n--- AFTER ---');
  console.log(`repaidAmount : ${money(afterLoan!.repaidAmount)}   status=${afterLoan!.repaymentStatus}`);
  console.log(`payments     : ${afterLoan!.payments.length}`);
  for (const p of afterLoan!.payments) console.log(`    ${p.id}  ${money(p.amount)}`);
  const received = afterJe!.entries.filter((e) => e.ledgerAccount?.type === 'Received');
  console.log(`\n  ${KEEP_TXN} breakdown (Received entries):`);
  for (const e of received) {
    console.log(`    ${String(e.ledgerAccount?.category).padEnd(11)} ${money(e.amount).padStart(12)}`);
  }
  console.log(`    ${'TOTAL'.padEnd(11)} ${money(received.reduce((s, e) => s + e.amount, 0)).padStart(12)}`);
  console.log('\nDone.');
}

run()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
