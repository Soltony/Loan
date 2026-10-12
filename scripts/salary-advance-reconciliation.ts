/**
 * CBS <-> portal reconciliation for the Salary Advance portfolio.
 *
 * Read-only unless run with --close-repaid --apply. Builds the workbook the
 * reconciliation team needs to settle the portal against the CBS:
 *
 *   Excess debits — money that left a customer's account with nothing owed to
 *   apply it to. Every row is a refund (CBS reversal) candidate:
 *     A. CBS auto-debit larger than its posting: two collections raced and the
 *        ledger caps each posting at what is still owed.
 *     B. CBS auto-debit that never posted: the CBS took the money, our posting
 *        failed. If the loan has been settled since, the debit is surplus.
 *     C. Repayments beyond what the loan owed on the day they were made: a CBS
 *        collection was never booked on the installment, so the app billed the
 *        customer for it again.
 *     D. SuperApp payments the gateway debited but the portal refused as an
 *        overpayment and that no manual resolution ever applied.
 *
 *   Open loans — every loan flagged Unpaid with what it really owes, including
 *   loans repaid in full whose status never closed.
 *
 * "Owed on a date" uses the loan-level penalty (counted from the loan due date).
 * For single-installment products such as Salary Advance that is the same as the
 * per-installment penalty — and the installment counters are exactly what was out
 * of date.
 *
 * The workbook names customers and account numbers, so it is written to
 * scripts/output/ (gitignored).
 *
 *   npx tsx -r tsconfig-paths/register scripts/salary-advance-reconciliation.ts
 *   npx tsx -r tsconfig-paths/register scripts/salary-advance-reconciliation.ts --close-repaid           # dry run
 *   npx tsx -r tsconfig-paths/register scripts/salary-advance-reconciliation.ts --close-repaid --apply   # writes
 *
 * --close-repaid marks loans flagged Unpaid as Paid when they owe nothing, or
 * when their last repayment settled them in full (whatever they show now is
 * penalty that kept accruing after payoff, and is waived). It closes their
 * installments and returns their borrowers from NPL to Active when no other
 * unpaid loan remains. Removing those accounts from CBS monitoring is left to
 * the "stale accounts" tool on the NPL Collection page.
 */
import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { differenceInCalendarDays, format } from 'date-fns';
import prisma from '../src/lib/prisma';
import { calculateOutstandingBreakdown, calculateTotalRepayable } from '../src/lib/loan-calculator';
import { parseRepaymentReference, referenceFor } from '../src/lib/repayment-reference';

const TOLERANCE = 0.01;
const DEBITED_UNPOSTED_PREFIX = 'CBS debited but internal posting failed';
const NOTHING_LEFT = 'Nothing left to collect';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const money = (n: number) => r2(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (d: Date | null | undefined) => (d ? format(d, 'yyyy-MM-dd') : '');

interface ExcessRow {
  category: string;
  customerName: string;
  accountNumber: string;
  phone: string;
  loanId: string;
  ftReference: string;
  transactionDate: Date | null;
  debitedAmount: number;
  excessAmount: number;
  loanStatusNow: string;
  action: string;
  evidence: string;
  /** A later credit to the same account for exactly this amount — likely a reversal already made. */
  possibleReversal?: string;
}

interface OpenLoanRow {
  loanId: string;
  customerName: string;
  accountNumber: string;
  phone: string;
  disbursedDate: Date;
  dueDate: Date;
  daysPastDue: number;
  loanAmount: number;
  repaidAmount: number;
  principalOutstanding: number;
  interestOutstanding: number;
  penaltyOutstanding: number;
  totalOutstanding: number;
  classification: string;
  /** Date of the repayment that settled the loan in full, when it was never closed. */
  settledOn: Date | null;
}

async function run() {
  const closeRepaid = process.argv.includes('--close-repaid');
  const apply = process.argv.includes('--apply');
  const now = new Date();

  // ---- Reference data ------------------------------------------------------
  const [products, taxConfigs, phoneAccounts, paymentTxs, resolvedPayments] = await Promise.all([
    // Selected fields only: the product icon is a large blob.
    prisma.loanProduct.findMany({
      select: {
        id: true,
        name: true,
        duration: true,
        serviceFee: true,
        serviceFeeEnabled: true,
        dailyFee: true,
        dailyFeeEnabled: true,
        penaltyRules: true,
        penaltyRulesEnabled: true,
        penaltyPerInstallment: true,
      },
    }),
    prisma.tax.findMany(),
    prisma.phoneAccount.findMany({
      select: { phoneNumber: true, accountNumber: true, customerName: true },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.paymentTransaction.findMany({ select: { txnRef: true, transactionId: true } }),
    // Manual resolutions hold their FT here, corrected by ops where it was mistyped.
    prisma.pendingPayment.findMany({ where: { status: 'COMPLETED' }, select: { id: true, transactionId: true } }),
  ]);
  const productById = new Map(products.map((p) => [p.id, p]));
  const accountByPhone = new Map<string, { accountNumber: string; customerName: string | null }>();
  const nameByAccount = new Map<string, string | null>();
  for (const pa of phoneAccounts) {
    if (!accountByPhone.has(pa.phoneNumber)) accountByPhone.set(pa.phoneNumber, pa);
    if (!nameByAccount.has(pa.accountNumber)) nameByAccount.set(pa.accountNumber, pa.customerName);
  }
  const ftByTxnRef = new Map<string, string>();
  for (const pt of paymentTxs) {
    if (pt.txnRef && pt.transactionId && /^FT/i.test(pt.transactionId)) ftByTxnRef.set(pt.txnRef, pt.transactionId);
  }
  const ftByPendingPayment = new Map<string, string>();
  for (const pp of resolvedPayments) {
    if (/^FT/i.test(pp.transactionId)) ftByPendingPayment.set(pp.id, pp.transactionId);
  }

  const loans = await prisma.loan.findMany({
    where: { repaymentStatus: { not: 'REVERSED' } },
    select: {
      id: true,
      borrowerId: true,
      productId: true,
      loanAmount: true,
      serviceFee: true,
      penaltyAmount: true,
      disbursedDate: true,
      dueDate: true,
      repaymentStatus: true,
      repaidAmount: true,
      installments: true,
      payments: {
        select: { id: true, amount: true, date: true, journalEntry: { select: { description: true } } },
      },
    },
  });
  const loanById = new Map(loans.map((l) => [l.id, l]));
  const paymentById = new Map(loans.flatMap((l) => l.payments.map((p) => [p.id, p] as const)));

  const customerOf = (phone: string | null | undefined, account?: string | null) => {
    const pa = phone ? accountByPhone.get(phone) : undefined;
    const accountNumber = account || pa?.accountNumber || '';
    return {
      phone: phone ?? '',
      accountNumber,
      customerName: (accountNumber && nameByAccount.get(accountNumber)) || pa?.customerName || '',
    };
  };
  // Same FT the Repayments tab shows.
  const ftOf = (description: string | null | undefined) => {
    const ref = parseRepaymentReference(description);
    return (
      referenceFor(ref, { ftByTxnRef, ftByPendingPayment }) ?? (ref.kind === 'superapp' ? `TxRef ${ref.txnRef}` : '')
    );
  };
  const channelOf = (description: string | null | undefined) => {
    const kind = parseRepaymentReference(description).kind;
    return kind === 'cbs' ? 'CBS auto-debit' : kind === 'manual' ? 'Manual resolution' : kind === 'superapp' ? 'SuperApp' : 'Other';
  };
  const repaymentsOf = (loanId: string) =>
    [...(loanById.get(loanId)?.payments ?? [])]
      .sort((a, b) => a.date.getTime() - b.date.getTime() || a.id.localeCompare(b.id))
      .map((p) => `${day(p.date)} ${channelOf(p.journalEntry?.description)} ${ftOf(p.journalEntry?.description)} ${money(p.amount)}`)
      .join('; ');

  const excess: ExcessRow[] = [];

  // ---- A + B. CBS auto-debits ---------------------------------------------
  const notifications = await prisma.nplCreditNotification.findMany({
    where: { repayTransactionId: { not: null } },
    select: {
      id: true,
      accountNumber: true,
      creditedAmount: true,
      borrowerId: true,
      loanId: true,
      paymentId: true,
      processStatus: true,
      resultMessage: true,
      repayTransactionId: true,
      repayDebitAmount: true,
      receivedAt: true,
      lastAttemptAt: true,
    },
  });
  // Later credits on the same account, to spot debits the bank already reversed by hand.
  const creditsByAccount = new Map<string, { amount: number; at: Date }[]>();
  for (const n of await prisma.nplCreditNotification.findMany({
    where: { creditedAmount: { gt: 0 } },
    select: { accountNumber: true, creditedAmount: true, receivedAt: true },
  })) {
    if (!creditsByAccount.has(n.accountNumber)) creditsByAccount.set(n.accountNumber, []);
    creditsByAccount.get(n.accountNumber)!.push({ amount: n.creditedAmount, at: n.receivedAt });
  }

  for (const n of notifications) {
    const debited = Number(n.repayDebitAmount ?? 0);
    if (!(debited > TOLERANCE)) continue;
    const loan = n.loanId ? loanById.get(n.loanId) : undefined;
    const who = customerOf(n.borrowerId ?? loan?.borrowerId, n.accountNumber);
    const debitedAt = n.lastAttemptAt ?? n.receivedAt;
    const base = {
      ...who,
      loanId: n.loanId ?? '',
      ftReference: n.repayTransactionId ?? '',
      transactionDate: debitedAt,
      debitedAmount: debited,
      loanStatusNow: loan?.repaymentStatus ?? 'not found',
    };

    const posted = n.paymentId ? paymentById.get(n.paymentId) : undefined;
    const isDebitSuccess = n.processStatus === 'REPAID' || n.processStatus === 'PARTIAL_REPAID';
    if (posted && isDebitSuccess && debited - posted.amount > TOLERANCE) {
      excess.push({
        ...base,
        category: 'A. CBS debit larger than its posting',
        excessAmount: r2(debited - posted.amount),
        action: 'Reverse the excess at the CBS (refund the customer).',
        evidence: `CBS debited ${money(debited)} under ${n.repayTransactionId}; the portal posted ${money(posted.amount)} because a concurrent collection on the same loan had already settled the rest. Repayments: ${repaymentsOf(n.loanId!)}`,
      });
      continue;
    }

    const unposted =
      !n.paymentId &&
      (n.resultMessage?.startsWith(DEBITED_UNPOSTED_PREFIX) ||
        (n.processStatus === 'DUPLICATE' && n.resultMessage?.includes('owed back as a refund')));
    if (!unposted) continue;

    const settled = loan?.repaymentStatus === 'Paid' || n.resultMessage?.includes(NOTHING_LEFT);
    excess.push({
      ...base,
      category: 'B. CBS debit never posted to the loan',
      excessAmount: settled ? r2(debited) : 0,
      action: settled
        ? 'Reverse at the CBS (refund the customer) unless already reversed.'
        : 'Loan is still open: post this debit to the loan instead of refunding it.',
      evidence: `CBS debited ${money(debited)} under ${n.repayTransactionId} but the posting failed: "${n.resultMessage}". Repayments: ${loan ? repaymentsOf(loan.id) : 'n/a'}.`,
    });
  }

  // ---- C. Repayments beyond what was owed ---------------------------------
  for (const loan of loans) {
    if (loan.payments.length === 0) continue;
    const product = productById.get(loan.productId);
    if (!product) continue;
    // Loan-level penalty: see the file header.
    const forCalc = { ...loan, installments: undefined, payments: loan.payments };
    const ordered = [...loan.payments].sort((a, b) => a.date.getTime() - b.date.getTime() || a.id.localeCompare(b.id));
    let paidBefore = 0;
    for (const p of ordered) {
      const owedThatDay = calculateTotalRepayable(forCalc as any, product as any, taxConfigs as any, p.date, true).total;
      const stillOwed = Math.max(0, owedThatDay - paidBefore);
      const over = p.amount - stillOwed;
      paidBefore += p.amount;
      if (over <= TOLERANCE) continue;
      excess.push({
        category: 'C. Repaid more than the loan owed',
        ...customerOf(loan.borrowerId),
        loanId: loan.id,
        ftReference: ftOf(p.journalEntry?.description),
        transactionDate: p.date,
        debitedAmount: p.amount,
        excessAmount: r2(over),
        loanStatusNow: loan.repaymentStatus,
        action: 'Refund the excess (reverse at the CBS).',
        evidence: `${channelOf(p.journalEntry?.description)} payment of ${money(p.amount)} on ${day(p.date)} when the loan owed ${money(stillOwed)} (total ${money(owedThatDay)} less ${money(paidBefore - p.amount)} already repaid). Repayments: ${repaymentsOf(loan.id)}`,
      });
    }
  }

  // ---- D. SuperApp debits the portal refused ------------------------------
  const appliedFts = new Set<string>();
  for (const l of loans) {
    for (const p of l.payments) {
      const ft = ftOf(p.journalEntry?.description);
      if (ft) appliedFts.add(ft.toUpperCase());
    }
  }
  const failedPending = await prisma.pendingPayment.findMany({
    where: { status: 'FAILED' },
    select: { transactionId: true, amount: true, loanId: true, borrowerId: true, updatedAt: true },
  });
  for (const f of failedPending) {
    const ft = ftByTxnRef.get(f.transactionId);
    if (!ft || appliedFts.has(ft.toUpperCase())) continue;
    const loan = loanById.get(f.loanId);
    const open = loan
      ? calculateOutstandingBreakdown(loan as any, productById.get(loan.productId) as any, taxConfigs as any, now).total
      : 0;
    const stillOwes = loan?.repaymentStatus === 'Unpaid' && open > TOLERANCE;
    excess.push({
      category: 'D. SuperApp payment debited but refused by the portal',
      ...customerOf(f.borrowerId),
      loanId: f.loanId,
      ftReference: ft,
      transactionDate: f.updatedAt,
      debitedAmount: f.amount,
      excessAmount: stillOwes ? r2(Math.max(0, f.amount - open)) : r2(f.amount),
      loanStatusNow: loan?.repaymentStatus ?? 'not found',
      action: stillOwes
        ? `Loan still owes ${money(open)}: resolve this payment on the Pending Payments page, refund only any excess.`
        : 'Refund the customer (reverse at the CBS).',
      evidence: `Gateway reported ${ft} for ${money(f.amount)}; the callback refused it as an overpayment (pending payment FAILED). Repayments: ${loan ? repaymentsOf(loan.id) : 'n/a'}`,
    });
  }

  // A later credit to the same account for exactly the excess (or the whole
  // debit) is most likely the bank's reversal. Flag it instead of counting it as
  // an open refund; only the CBS can confirm.
  for (const row of excess) {
    if (!row.accountNumber || !row.transactionDate) continue;
    const credit = (creditsByAccount.get(row.accountNumber) ?? []).find(
      (c) =>
        c.at > row.transactionDate! &&
        c.amount >= 1 &&
        (Math.abs(c.amount - row.excessAmount) <= TOLERANCE || Math.abs(c.amount - row.debitedAmount) <= TOLERANCE),
    );
    if (credit) row.possibleReversal = `${money(credit.amount)} credited on ${day(credit.at)}`;
  }

  // ---- Open loans ----------------------------------------------------------
  const openRows: OpenLoanRow[] = [];
  for (const loan of loans.filter((l) => l.repaymentStatus === 'Unpaid')) {
    const product = productById.get(loan.productId);
    const owed = calculateOutstandingBreakdown(loan as any, product as any, taxConfigs as any, now);
    const repaid = loan.repaidAmount ?? 0;
    // Settled by its last repayment (owed that day, loan-level penalty — see the
    // file header)? Then whatever it shows now is penalty that kept accruing
    // after payoff because the loan was never closed.
    const lastPayment = loan.payments.reduce<Date | null>((m, p) => (!m || p.date > m ? p.date : m), null);
    const owedAtLastPayment = lastPayment
      ? calculateTotalRepayable({ ...loan, installments: undefined } as any, product as any, taxConfigs as any, lastPayment, true).total
      : Infinity;
    const settledOn = repaid >= owedAtLastPayment - TOLERANCE ? lastPayment : null;
    openRows.push({
      settledOn,
      loanId: loan.id,
      ...customerOf(loan.borrowerId),
      disbursedDate: loan.disbursedDate,
      dueDate: loan.dueDate,
      daysPastDue: Math.max(0, differenceInCalendarDays(now, loan.dueDate)),
      loanAmount: loan.loanAmount,
      repaidAmount: r2(repaid),
      principalOutstanding: owed.principal,
      interestOutstanding: owed.interest,
      penaltyOutstanding: owed.penalty,
      totalOutstanding: owed.total,
      classification:
        owed.total <= TOLERANCE
          ? 'Repaid in full - status still Unpaid'
          : settledOn
            ? `Repaid in full on ${day(settledOn)} - balance is penalty accrued since`
            : repaid >= loan.loanAmount - TOLERANCE
              ? 'Principal repaid in cash; only interest/penalty remains'
              : 'Open balance',
    });
  }
  openRows.sort((a, b) => b.totalOutstanding - a.totalOutstanding);

  // ---- Report ----------------------------------------------------------------
  const sum = (rows: { excessAmount: number }[]) => r2(rows.reduce((s, r) => s + r.excessAmount, 0));
  const byCategory = new Map<string, ExcessRow[]>();
  for (const row of excess) {
    if (!byCategory.has(row.category)) byCategory.set(row.category, []);
    byCategory.get(row.category)!.push(row);
  }
  const withBalance = openRows.filter((r) => r.totalOutstanding > TOLERANCE);
  const settledAtLastPayment = withBalance.filter((r) => r.settledOn);
  // Owe nothing now, or settled by their last repayment: both are closed by --close-repaid.
  const repaidButOpen = openRows.filter((r) => r.totalOutstanding <= TOLERANCE || r.settledOn);
  const residualOnly = openRows.filter((r) => r.classification.startsWith('Principal repaid'));
  const realOpen = openRows.filter((r) => r.classification === 'Open balance');

  const summary: [string, string | number][] = [
    ['Generated', format(now, 'yyyy-MM-dd HH:mm')],
    ['Loans flagged Unpaid', openRows.length],
    ['  owing a balance', withBalance.length],
    ['  balance owed by them', r2(withBalance.reduce((s, r) => s + r.totalOutstanding, 0))],
    ['    of which open principal balances', realOpen.length],
    ['    open principal balances total', r2(realOpen.reduce((s, r) => s + r.totalOutstanding, 0))],
    ['    of which repaid in full, penalty accrued after payoff', settledAtLastPayment.length],
    ['    penalty accrued after payoff total', r2(settledAtLastPayment.reduce((s, r) => s + r.totalOutstanding, 0))],
    ['    of which only interest/penalty left', residualOnly.length],
    ['    interest/penalty left total', r2(residualOnly.reduce((s, r) => s + r.totalOutstanding, 0))],
    ['  repaid in full, status still Unpaid', openRows.length - withBalance.length],
    ['Loans --close-repaid would close', repaidButOpen.length],
    ['Excess debits (refund candidates)', excess.filter((r) => r.excessAmount > TOLERANCE).length],
    ['  total excess', sum(excess)],
    ['  with no reversal seen', excess.filter((r) => r.excessAmount > TOLERANCE && !r.possibleReversal).length],
    ['  excess with no reversal seen', sum(excess.filter((r) => !r.possibleReversal))],
    ...Array.from(byCategory.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .flatMap(([category, rows]) => [
        [`  ${category}`, rows.length] as [string, number],
        [`    amount`, sum(rows)] as [string, number],
        [`    amount with no reversal seen`, sum(rows.filter((r) => !r.possibleReversal))] as [string, number],
      ]),
  ];

  console.log('\n=== SALARY ADVANCE RECONCILIATION ===');
  for (const [label, value] of summary) {
    console.log(`${label.padEnd(48)} ${typeof value === 'number' && !Number.isInteger(value) ? money(value) : value}`);
  }

  const outDir = path.join(__dirname, 'output');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `salary-advance-reconciliation-${format(now, 'yyyyMMdd-HHmm')}.xlsx`);
  const wb = new ExcelJS.Workbook();

  const summarySheet = wb.addWorksheet('Summary');
  summarySheet.columns = [
    { header: 'Item', key: 'item', width: 52 },
    { header: 'Value', key: 'value', width: 20 },
  ];
  for (const [item, value] of summary) summarySheet.addRow({ item, value });

  const excessSheet = wb.addWorksheet('Excess debits');
  excessSheet.columns = [
    { header: 'Category', key: 'category', width: 44 },
    { header: 'Customer name', key: 'customerName', width: 28 },
    { header: 'Account number', key: 'accountNumber', width: 16 },
    { header: 'Phone', key: 'phone', width: 14 },
    { header: 'Reference (FT)', key: 'ftReference', width: 18 },
    { header: 'Transaction date', key: 'transactionDate', width: 14, style: { numFmt: 'yyyy-mm-dd' } },
    { header: 'Debited (ETB)', key: 'debitedAmount', width: 14, style: { numFmt: '#,##0.00' } },
    { header: 'Excess (ETB)', key: 'excessAmount', width: 14, style: { numFmt: '#,##0.00' } },
    { header: 'Loan status now', key: 'loanStatusNow', width: 14 },
    { header: 'Possible reversal seen', key: 'possibleReversal', width: 30 },
    { header: 'Loan ID', key: 'loanId', width: 28 },
    { header: 'Action', key: 'action', width: 60 },
    { header: 'Evidence', key: 'evidence', width: 120 },
  ];
  for (const row of [...excess].sort((a, b) => a.category.localeCompare(b.category) || b.excessAmount - a.excessAmount)) {
    excessSheet.addRow(row);
  }

  const openSheet = wb.addWorksheet('Unpaid-flagged loans');
  openSheet.columns = [
    { header: 'Classification', key: 'classification', width: 48 },
    { header: 'Customer name', key: 'customerName', width: 28 },
    { header: 'Account number', key: 'accountNumber', width: 16 },
    { header: 'Phone', key: 'phone', width: 14 },
    { header: 'Disbursed', key: 'disbursedDate', width: 12, style: { numFmt: 'yyyy-mm-dd' } },
    { header: 'Due', key: 'dueDate', width: 12, style: { numFmt: 'yyyy-mm-dd' } },
    { header: 'Days past due', key: 'daysPastDue', width: 13 },
    { header: 'Loan amount', key: 'loanAmount', width: 13, style: { numFmt: '#,##0.00' } },
    { header: 'Repaid', key: 'repaidAmount', width: 13, style: { numFmt: '#,##0.00' } },
    { header: 'Principal outstanding', key: 'principalOutstanding', width: 13, style: { numFmt: '#,##0.00' } },
    { header: 'Interest outstanding', key: 'interestOutstanding', width: 13, style: { numFmt: '#,##0.00' } },
    { header: 'Penalty outstanding', key: 'penaltyOutstanding', width: 13, style: { numFmt: '#,##0.00' } },
    { header: 'Total outstanding', key: 'totalOutstanding', width: 13, style: { numFmt: '#,##0.00' } },
    { header: 'Repaid in full on', key: 'settledOn', width: 14, style: { numFmt: 'yyyy-mm-dd' } },
    { header: 'Loan ID', key: 'loanId', width: 28 },
  ];
  for (const row of openRows) openSheet.addRow(row);

  for (const sheet of [summarySheet, excessSheet, openSheet]) {
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
  }
  await wb.xlsx.writeFile(outFile);
  console.log(`\nWorkbook: ${outFile}`);

  // ---- Optional: close loans that are repaid in full ------------------------
  if (!closeRepaid) return;
  console.log(`\n--- ${repaidButOpen.length} loan(s) flagged Unpaid but repaid in full ---`);
  for (const r of repaidButOpen) {
    const note = r.settledOn
      ? `settled ${day(r.settledOn)}; ${money(r.totalOutstanding)} penalty accrued since is waived`
      : 'owes nothing';
    console.log(`  ${r.loanId}  ${r.phone}  ${r.customerName}  repaid=${money(r.repaidAmount)}  (${note})`);
  }
  if (!apply) {
    console.log('\nDRY RUN — no changes written. Re-run with --close-repaid --apply to close them.');
    return;
  }

  let closed = 0;
  for (const r of repaidButOpen) {
    const loan = loanById.get(r.loanId)!;
    const didClose = await prisma.$transaction(async (tx) => {
      // Re-check inside the transaction: a payment may have landed since the scan.
      const current = await tx.loan.findUnique({ where: { id: loan.id }, select: { repaymentStatus: true, repaidAmount: true } });
      if (current?.repaymentStatus !== 'Unpaid' || Math.abs((current.repaidAmount ?? 0) - (loan.repaidAmount ?? 0)) > TOLERANCE) {
        console.warn(`  skipped ${loan.id}: changed since the scan`);
        return false;
      }
      await tx.loan.update({ where: { id: loan.id }, data: { repaymentStatus: 'Paid', penaltyAmount: 0 } });
      await tx.loanInstallment.updateMany({
        where: { loanId: loan.id, status: { notIn: ['PAID', 'Paid', 'MERGED', 'Merged'] } },
        data: { status: 'Paid', isActive: false },
      });
      const otherUnpaid = await tx.loan.count({ where: { borrowerId: loan.borrowerId, repaymentStatus: 'Unpaid' } });
      if (otherUnpaid === 0) {
        await tx.borrower.updateMany({ where: { id: loan.borrowerId, status: 'NPL' }, data: { status: 'Active' } });
      }
      await tx.auditLog.create({
        data: {
          actorId: 'system',
          action: 'CLOSE_REPAID_LOAN',
          entity: 'Loan',
          entityId: loan.id,
          details: JSON.stringify({
            borrowerId: loan.borrowerId,
            repaidAmount: loan.repaidAmount,
            settledOn: r.settledOn,
            penaltyAccruedAfterPayoffWaived: r.settledOn ? r.totalOutstanding : 0,
            reason:
              'Repaid in full but left Unpaid (the installment never read as settled), so penalty kept ' +
              'accruing after payoff. Closed by scripts/salary-advance-reconciliation.ts.',
          }),
        },
      });
      return true;
    });
    if (didClose) closed += 1;
  }
  console.log(`\nClosed ${closed} of ${repaidButOpen.length} loan(s).`);
}

run()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
