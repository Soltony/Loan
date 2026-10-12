/**
 * One-off data fix: put back on the books two Salary Advance payouts the CBS made
 * but the portal holds no loan for, so the borrowers repay them.
 *
 * KUMNEGER ASNAKE MAMO (7000036769241): FT26090B1VY6, 31 Mar 2026, 9,900.00
 *   The disbursement service answered HTTP 503 with no FT, the portal recorded the
 *   disbursement as failed, and the loan was reversed on 1 Apr (requested by
 *   Addisu Genene, approved by Beyenech Worse). The CBS had paid it.
 *   -> Undo the reversal:
 *      - remove its journal entry and move back the ledger balances it moved;
 *      - take the 10,000.00 out of the provider fund again;
 *      - set the loan, installment and application back to unpaid and disbursed;
 *      - recreate the deleted disbursement record with the CBS reference.
 *      The removed journal entry is kept in full in the audit log. A third
 *      "re-post" entry would list the loan's disbursement twice in the
 *      Disbursements tab and be reversed twice if the loan were reversed again.
 *
 * GUTEMA KENSI WAKO (7000107143225): FT26128PFYKD, 8 May 2026, 9,900.00
 *   One disbursement request was paid twice (FT26128PFYKD, then FT26128CRTKL). The
 *   portal has one loan, for FT26128CRTKL, which the customer has repaid.
 *   -> Create a second loan for FT26128PFYKD on the same terms as the first:
 *      application, loan, installment, disbursement journal entry (principal and
 *      disaster commission receivable), provider fund and disbursement record.
 *
 * Both loans keep their original dates (due 29 Jun and 6 Aug), so they are already
 * overdue and owe interest 9.00 plus the capped 30.00 penalty. --due-date YYYY-MM-DD
 * gives both a fresh due date instead: no penalty if repaid by then, with interest
 * accruing up to that date.
 *
 * Once Unpaid, the worker's NPL job flags both borrowers (it sends them an SMS) and
 * the CBS daily upload puts their accounts under auto-collection; they can also
 * pay in the SuperApp. Each loan's 100.00 disaster commission was withheld by the
 * CBS but never remitted, as the portal did not count these loans; it is added to
 * the tax receivable.
 *
 * Dry run by default. Pass --rehearse to run every write in one transaction, read
 * the result back and roll it all back; pass --apply to commit.
 *
 *   npx tsx -r tsconfig-paths/register scripts/reinstate-cbs-paid-loans.ts [--due-date 2026-11-09]
 *   npx tsx -r tsconfig-paths/register scripts/reinstate-cbs-paid-loans.ts [--due-date 2026-11-09] --rehearse
 *   npx tsx -r tsconfig-paths/register scripts/reinstate-cbs-paid-loans.ts [--due-date 2026-11-09] --apply
 */
import type { Prisma } from '@prisma/client';
import prisma from '../src/lib/prisma';
import { calculateOutstandingBreakdown } from '../src/lib/loan-calculator';

const REINSTATE = {
  loanId: 'cmnepaaqn03s7z7egqpymrygz',
  borrowerId: '251967664992',
  creditAccount: '7000036769241',
  cbsTransactionId: 'FT26090B1VY6',
  cbsBookDate: '31 Mar 2026',
};

const DUPLICATE = {
  /** The loan the portal holds for this request, disbursed under FT26128CRTKL. */
  siblingLoanId: 'cmowwybso07gcl1x56zj6xu22',
  siblingTransactionId: 'FT26128CRTKL',
  borrowerId: '251927941408',
  creditAccount: '7000107143225',
  cbsTransactionId: 'FT26128PFYKD',
  cbsBookDate: '8 May 2026',
};

const SCRIPT = 'scripts/reinstate-cbs-paid-loans.ts';
const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (d: Date) => new Date(d.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);

function parseDueDate(): Date | null {
  const at = process.argv.indexOf('--due-date');
  if (at < 0) return null;
  const value = process.argv[at + 1];
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('--due-date needs YYYY-MM-DD');
  // Midday Addis Ababa time, clear of any day boundary.
  const due = new Date(`${value}T09:00:00.000Z`);
  if (due.getTime() <= Date.now()) throw new Error('--due-date must be in the future');
  return due;
}

const productTerms = {
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
} as const;

/** What the borrower will owe today, as the portal will show it. */
async function owedNow(loan: { loanAmount: number; disbursedDate: Date; dueDate: Date; productId: string }) {
  const [product, taxes] = await Promise.all([
    prisma.loanProduct.findUniqueOrThrow({ where: { id: loan.productId }, ...productTerms }),
    prisma.tax.findMany(),
  ]);
  return calculateOutstandingBreakdown(
    {
      ...loan,
      repaymentStatus: 'Unpaid',
      repaidAmount: 0,
      payments: [],
      installments: [{ installmentNumber: 1, dueDate: loan.dueDate, amount: loan.loanAmount, paidAmount: 0, status: 'PENDING', isActive: true }],
    } as any,
    product as any,
    taxes as any,
    new Date(),
  );
}

class Rehearsal extends Error {}

async function run() {
  const apply = process.argv.includes('--apply');
  const rehearse = process.argv.includes('--rehearse');
  const newDue = parseDueDate();

  // ---- KUMNEGER: checks --------------------------------------------------------
  const loan = await prisma.loan.findUniqueOrThrow({
    where: { id: REINSTATE.loanId },
    include: {
      payments: { select: { id: true } },
      installments: true,
      journalEntries: { include: { entries: true } },
      product: { select: { provider: { select: { id: true } } } },
    },
  });
  const reversalJe = loan.journalEntries.find((j) => j.description?.startsWith(`Reversal: failed external disbursement for loan ${loan.id}`));
  const disbursementJe = loan.journalEntries.find((j) => j.description?.startsWith('Loan disbursement'));
  const reversedTxId = reversalJe?.description?.match(/\(tx (\w+)\)/)?.[1];
  const reversalChange = reversedTxId
    ? await prisma.pendingChange.findFirst({ where: { entityType: 'DisbursementReversal', entityId: reversedTxId, status: 'APPROVED' } })
    : null;
  const original = reversalChange ? JSON.parse(reversalChange.payload).created : null;
  const ftTaken = await prisma.disbursementTransaction.findFirst({
    where: { transactionId: { in: [REINSTATE.cbsTransactionId, DUPLICATE.cbsTransactionId] } },
    select: { transactionId: true, loanId: true },
  });
  const problems: string[] = [];
  if (ftTaken) problems.push(`${ftTaken.transactionId} is already recorded (loan ${ftTaken.loanId}); nothing to do.`);
  if (loan.repaymentStatus !== 'REVERSED') problems.push(`KUMNEGER loan is ${loan.repaymentStatus}, expected REVERSED.`);
  if (loan.borrowerId !== REINSTATE.borrowerId) problems.push('KUMNEGER loan belongs to another borrower.');
  if (loan.payments.length > 0) problems.push('KUMNEGER loan has payments; the reversal deleted none, so this is not the expected state.');
  if (!disbursementJe || !reversalJe) problems.push('KUMNEGER loan lacks its disbursement or reversal journal entry.');
  if (!original || original.creditAccount !== REINSTATE.creditAccount) problems.push('Approved reversal request for the KUMNEGER disbursement not found.');
  if (reversedTxId && (await prisma.disbursementTransaction.findUnique({ where: { id: reversedTxId } }))) {
    problems.push(`Disbursement record ${reversedTxId} still exists.`);
  }
  if (loan.installments.length !== 1) problems.push(`KUMNEGER loan has ${loan.installments.length} installments, expected 1.`);

  // ---- GUTEMA: checks ----------------------------------------------------------
  const sibling = await prisma.loan.findUniqueOrThrow({
    where: { id: DUPLICATE.siblingLoanId },
    include: {
      installments: true,
      journalEntries: { include: { entries: true } },
      disbursementTransactions: true,
      product: { select: { provider: { select: { id: true } } } },
    },
  });
  const siblingDisbursementJe = sibling.journalEntries.find((j) => j.description?.startsWith('Loan disbursement'));
  const siblingTx = sibling.disbursementTransactions.find((d) => d.transactionId === DUPLICATE.siblingTransactionId);
  if (sibling.borrowerId !== DUPLICATE.borrowerId) problems.push('GUTEMA sibling loan belongs to another borrower.');
  if (!siblingDisbursementJe || !siblingTx || siblingTx.creditAccount !== DUPLICATE.creditAccount) {
    problems.push('GUTEMA sibling loan lacks its disbursement journal entry or its FT26128CRTKL record.');
  }
  if (sibling.installments.length !== 1) problems.push(`GUTEMA sibling loan has ${sibling.installments.length} installments, expected 1.`);

  if (problems.length) {
    console.error('Refusing to run:\n  ' + problems.join('\n  '));
    process.exit(1);
  }

  const kumnegerDue = newDue ?? loan.dueDate;
  const gutemaDue = newDue ?? sibling.dueDate;
  const kumnegerOwes = await owedNow({ ...loan, dueDate: kumnegerDue });
  const gutemaOwes = await owedNow({ ...sibling, dueDate: gutemaDue });
  const show = (o: Awaited<ReturnType<typeof owedNow>>) =>
    `${money(o.total)} (principal ${money(o.principal)}, interest ${money(o.interest)}, penalty ${money(o.penalty)})`;

  console.log('\n--- KUMNEGER ASNAKE MAMO: reinstate reversed loan ---');
  console.log(`  loan ${loan.id}, ${money(loan.loanAmount)} disbursed ${day(loan.disbursedDate)} under ${REINSTATE.cbsTransactionId}`);
  console.log(`  remove reversal journal entry ${reversalJe!.id}: ${reversalJe!.entries.map((e) => `${e.type} ${money(e.amount)}`).join(', ')}`);
  console.log(`  recreate disbursement record ${reversedTxId} (${money(original.amount)} to ${original.creditAccount}) as SUCCESS ${REINSTATE.cbsTransactionId}`);
  console.log(`  due ${day(kumnegerDue)}${newDue ? ` (was ${day(loan.dueDate)})` : ''}; owes today ${show(kumnegerOwes)}`);

  console.log('\n--- GUTEMA KENSI WAKO: new loan for the second payout ---');
  console.log(`  copy of loan ${sibling.id}: ${money(sibling.loanAmount)} disbursed ${day(sibling.disbursedDate)}, net ${money(sibling.netDisbursedAmount ?? 0)}, commission ${money(sibling.taxDeducted)}`);
  console.log(`  disbursement journal entry: ${siblingDisbursementJe!.entries.map((e) => `${e.type} ${money(e.amount)}`).join(', ')}`);
  console.log(`  disbursement record SUCCESS ${DUPLICATE.cbsTransactionId} to ${DUPLICATE.creditAccount}`);
  console.log(`  due ${day(gutemaDue)}${newDue ? ` (sibling was ${day(sibling.dueDate)})` : ''}; owes today ${show(gutemaOwes)}`);

  console.log('\n  Both borrowers will be flagged NPL by the next worker run (SMS sent) and put under CBS auto-collection.');
  if (!apply && !rehearse) {
    console.log('\nDRY RUN — no changes written. Re-run with --rehearse to test the writes, or --apply to commit.');
    return;
  }

  // ---- KUMNEGER: apply ------------------------------------------------------------
  const reinstate = async (tx: Prisma.TransactionClient) => {
    // reverseAllLoanJournalEntries moved each balance by -amount for a Credit and
    // +amount for a Debit it posted; move them back.
    for (const e of reversalJe!.entries) {
      await tx.ledgerAccount.update({
        where: { id: e.ledgerAccountId },
        data: { balance: { increment: e.type === 'Credit' ? e.amount : -e.amount } },
      });
    }
    await tx.ledgerEntry.deleteMany({ where: { journalEntryId: reversalJe!.id } });
    await tx.journalEntry.delete({ where: { id: reversalJe!.id } });
    await tx.loanProvider.update({ where: { id: loan.product.provider.id }, data: { initialBalance: { decrement: loan.loanAmount } } });
    await tx.loan.update({
      where: { id: loan.id },
      data: { repaymentStatus: 'Unpaid', repaymentBehavior: null, repaidAmount: 0, dueDate: kumnegerDue },
    });
    await tx.loanInstallment.update({
      where: { id: loan.installments[0].id },
      data: { status: 'PENDING', paidAmount: 0, paidAt: null, isActive: true, dueDate: kumnegerDue },
    });
    await tx.loanApplication.update({ where: { id: loan.loanApplicationId }, data: { status: 'DISBURSED' } });
    await tx.disbursementTransaction.create({
      data: {
        id: reversedTxId!,
        transactionId: REINSTATE.cbsTransactionId,
        loanId: loan.id,
        providerId: original.providerId,
        originalProviderId: original.originalProviderId,
        creditAccount: original.creditAccount,
        amount: original.amount,
        disbursementStatus: 'SUCCESS',
        statusCode: 200,
        createdAt: new Date(original.createdAt),
        requestPayload: JSON.stringify({ creditAccount: original.creditAccount, providerId: original.providerId, amount: original.amount, loanId: loan.id }),
        responsePayload: JSON.stringify({
          reinstated: true,
          cbsTransactionId: REINSTATE.cbsTransactionId,
          note: `Recreated by ${SCRIPT}: the CBS paid this disbursement (statement ${REINSTATE.cbsBookDate}) although the service answered HTTP 503.`,
        }),
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: 'system',
        action: 'LOAN_REINSTATED',
        entity: 'Loan',
        entityId: loan.id,
        details: JSON.stringify({
          cbsTransactionId: REINSTATE.cbsTransactionId,
          disbursementTransactionId: reversedTxId,
          reversalChangeId: reversalChange!.id,
          removedReversalJournalEntry: {
            id: reversalJe!.id,
            date: reversalJe!.date,
            description: reversalJe!.description,
            entries: reversalJe!.entries.map((e) => ({ ledgerAccountId: e.ledgerAccountId, type: e.type, amount: e.amount })),
          },
          dueDate: kumnegerDue,
          previousDueDate: loan.dueDate,
          reason: `The CBS paid ${REINSTATE.cbsTransactionId} although the disbursement was recorded as failed (HTTP 503); the loan was reversed in error. Reinstated by ${SCRIPT}.`,
        }),
      },
    });
  };

  // ---- GUTEMA: apply --------------------------------------------------------------
  const bookDuplicate = async (tx: Prisma.TransactionClient) => {
    const application = await tx.loanApplication.create({
      data: { borrowerId: sibling.borrowerId, productId: sibling.productId, loanAmount: sibling.loanAmount, status: 'DISBURSED' },
    });
    const newLoan = await tx.loan.create({
      data: {
        borrowerId: sibling.borrowerId,
        productId: sibling.productId,
        loanApplicationId: application.id,
        loanAmount: sibling.loanAmount,
        disbursedDate: sibling.disbursedDate,
        dueDate: gutemaDue,
        serviceFee: sibling.serviceFee,
        penaltyAmount: 0,
        taxDeducted: sibling.taxDeducted,
        netDisbursedAmount: sibling.netDisbursedAmount,
        repaymentStatus: 'Unpaid',
        repaidAmount: 0,
      },
    });
    const je = await tx.journalEntry.create({
      data: {
        providerId: sibling.product.provider.id,
        loanId: newLoan.id,
        date: sibling.disbursedDate,
        description: siblingDisbursementJe!.description,
      },
    });
    for (const e of siblingDisbursementJe!.entries) {
      await tx.ledgerEntry.create({ data: { journalEntryId: je.id, ledgerAccountId: e.ledgerAccountId, type: e.type, amount: e.amount } });
      await tx.ledgerAccount.update({
        where: { id: e.ledgerAccountId },
        data: { balance: { increment: e.type === 'Debit' ? e.amount : -e.amount } },
      });
    }
    await tx.loanProvider.update({ where: { id: sibling.product.provider.id }, data: { initialBalance: { decrement: sibling.loanAmount } } });
    await tx.loanInstallment.create({
      data: { loanId: newLoan.id, installmentNumber: 1, dueDate: gutemaDue, amount: sibling.installments[0].amount, isActive: true },
    });
    const record = await tx.disbursementTransaction.create({
      data: {
        transactionId: DUPLICATE.cbsTransactionId,
        loanId: newLoan.id,
        providerId: siblingTx!.providerId,
        originalProviderId: siblingTx!.originalProviderId,
        creditAccount: DUPLICATE.creditAccount,
        amount: siblingTx!.amount,
        disbursementStatus: 'SUCCESS',
        statusCode: 200,
        createdAt: siblingTx!.createdAt,
        requestPayload: JSON.stringify({ creditAccount: DUPLICATE.creditAccount, providerId: siblingTx!.providerId, amount: siblingTx!.amount, loanId: newLoan.id }),
        responsePayload: JSON.stringify({
          recordedAfterTheFact: true,
          cbsTransactionId: DUPLICATE.cbsTransactionId,
          note: `Recorded by ${SCRIPT}: the CBS paid the ${DUPLICATE.cbsBookDate} request of loan ${sibling.id} twice; this is the second payout.`,
        }),
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: 'system',
        action: 'LOAN_CREATED_FOR_DUPLICATE_PAYOUT',
        entity: 'Loan',
        entityId: newLoan.id,
        details: JSON.stringify({
          cbsTransactionId: DUPLICATE.cbsTransactionId,
          siblingLoanId: sibling.id,
          siblingTransactionId: DUPLICATE.siblingTransactionId,
          disbursementTransactionId: record.id,
          dueDate: gutemaDue,
          reason: `One disbursement request was paid twice by the CBS (${DUPLICATE.cbsTransactionId}, ${DUPLICATE.siblingTransactionId}); the second payout is booked as its own loan so it can be repaid. Created by ${SCRIPT}.`,
        }),
      },
    });
    return newLoan;
  };

  // Both fixes commit together or not at all.
  try {
    const created = await prisma.$transaction(
      async (tx) => {
        await reinstate(tx);
        const newLoan = await bookDuplicate(tx);
        if (rehearse) {
          const [back, made, records, jes] = await Promise.all([
            tx.loan.findUniqueOrThrow({ where: { id: loan.id }, select: { repaymentStatus: true, dueDate: true } }),
            tx.loan.findUniqueOrThrow({ where: { id: newLoan.id }, select: { repaymentStatus: true, loanAmount: true, dueDate: true } }),
            tx.disbursementTransaction.findMany({
              where: { transactionId: { in: [REINSTATE.cbsTransactionId, DUPLICATE.cbsTransactionId] } },
              select: { transactionId: true, loanId: true, disbursementStatus: true },
            }),
            tx.journalEntry.findMany({ where: { loanId: { in: [loan.id, newLoan.id] } }, select: { loanId: true, description: true } }),
          ]);
          console.log('\nREHEARSAL — state inside the transaction:');
          console.log(`  KUMNEGER loan ${loan.id}: ${back.repaymentStatus}, due ${day(back.dueDate)}`);
          console.log(`  GUTEMA new loan ${newLoan.id}: ${made.repaymentStatus}, ${money(made.loanAmount)}, due ${day(made.dueDate)}`);
          for (const r of records) console.log(`  disbursement ${r.transactionId} -> loan ${r.loanId} (${r.disbursementStatus})`);
          for (const j of jes) console.log(`  journal entry on ${j.loanId}: ${j.description}`);
          throw new Rehearsal();
        }
        return newLoan;
      },
      { maxWait: 15_000, timeout: 60_000 },
    );
    console.log(`\nReinstated loan ${loan.id}.\nCreated loan ${created.id} for ${DUPLICATE.cbsTransactionId}.`);
  } catch (e) {
    if (!(e instanceof Rehearsal)) throw e;
    console.log('\nREHEARSAL — every write ran and was rolled back. Nothing changed.');
  }
}

run()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
