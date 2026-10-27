/**
 * One-off data fix: clear the overpayments of the 190 customers in 5.3.3 of the Salary
 * Advance GL reconciliation by taking out of the portal the repayments that make up
 * each overpayment. NIB then refunds those repayments by their FT, so every repayment
 * left in the portal still matches its CBS amount.
 *
 * For each loan the portal reports as overpaid, the repayments whose amounts add up to
 * the overpayment exactly are removed; if none do, the set closest to it.
 *  - Closest above the overpayment: the loan is left short by the difference, and the
 *    portal reports it as waived charges, penalty first (as for TIGIST ERKO LATA in
 *    record-cbs-refunds.ts). It never waives more than the loan's charges, so the
 *    principal stays repaid.
 *  - Closest below: the rest stays overpaid.
 *  - Nothing closer than leaving the loan alone (mostly 9.00 inside a full repayment):
 *    the loan is not touched.
 *
 * Two steps:
 *   plan <detail.xlsx>   Reads the customers from the "5.3.3 Customers" sheet of the detail
 *                        sent to NIB and chooses the repayments. Writes the plan (JSON, for
 *                        run) and a workbook (to review, and the list NIB refunds by FT) to
 *                        scripts/output/.
 *   run <plan.json>      Checks each loan still matches the plan, then removes. A loan that
 *                        changed since the plan is skipped. Dry run by default. --rehearse
 *                        runs each loan's writes and rolls them back; --apply commits. Each
 *                        loan is its own transaction. It is rolled back if its principal is
 *                        no longer repaid, or a different overpayment is left than planned.
 *
 *   npx tsx -r tsconfig-paths/register scripts/remove-overpaid-repayments.ts plan "scripts/output/nib-detail-5.3.1-5.3.3-20261023.xlsx"
 *   npx tsx -r tsconfig-paths/register scripts/remove-overpaid-repayments.ts run "scripts/output/overpaid-removal-plan-<stamp>.json" [--rehearse | --apply]
 *
 * Make the plan on the database it will run on, after record-cbs-refunds.ts.
 *
 * A repayment is removed as in record-cbs-refunds.ts: its payment, its journal entry and
 * the ledger balances it moved. Its pending payment is marked REFUNDED, and the CBS
 * notification that posted it no longer points at a payment. The audit log keeps
 * everything removed.
 */
import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { format } from 'date-fns';
import type { Prisma } from '@prisma/client';
import prisma from '../src/lib/prisma';
import { parseRepaymentReference, referenceFor, type RepaymentReference } from '../src/lib/repayment-reference';
import { reconcileRepaymentsForLoans } from '../src/lib/repayment-reconciliation-data';

const ACTION = 'OVERPAID_REPAYMENTS_REMOVED';
const SCRIPT = 'scripts/remove-overpaid-repayments.ts';
const TOLERANCE = 0.005;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const toCents = (n: number) => Math.round(n * 100);
const money = (n: number) => r2(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const eatDay = (d: Date) => new Date(d.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);

interface PlannedRepayment {
  paymentId: string;
  reference: string;
  channel: RepaymentReference['kind'];
  amount: number;
  date: string;
}

interface PlannedLoan {
  no: number;
  customer: string;
  phone: string;
  account: string;
  loanId: string;
  loanAmount: number;
  overpaid: number;
  /** Charges the loan paid on its terms: the most that can be waived. */
  charges: number;
  remove: PlannedRepayment[];
  removedTotal: number;
  waived: number;
  left: number;
  result: string;
}

// --- plan ------------------------------------------------------------------------------

/**
 * The repayments whose amounts come closest to the overpayment, never more than it plus
 * the loan's charges. Ties go to the set that clears the overpayment, then to fewer
 * repayments, then to later ones. Empty when nothing comes closer than removing nothing.
 */
function closestSet(rows: { amount: number; date: Date }[], overpaid: number, charges: number): number[] {
  const target = toCents(overpaid);
  const cap = target + toCents(charges);
  const order = rows.map((_, i) => i).sort((a, b) => rows[b].date.getTime() - rows[a].date.getTime());
  let reach = new Map<number, number[]>([[0, []]]);
  for (const i of order) {
    const next = new Map(reach);
    for (const [sum, set] of reach) {
      const s = sum + toCents(rows[i].amount);
      if (s > cap) continue;
      const held = next.get(s);
      if (!held || set.length + 1 < held.length) next.set(s, [...set, i]);
    }
    reach = next;
  }
  let best: [number, number[]] = [0, []];
  for (const [sum, set] of reach) {
    const d = Math.abs(sum - target);
    const bd = Math.abs(best[0] - target);
    if (d < bd || (d === bd && sum >= target && best[0] < target) || (d === bd && (sum >= target) === (best[0] >= target) && set.length < best[1].length)) {
      best = [sum, set];
    }
  }
  return best[1];
}

async function readCustomers(file: string) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.getWorksheet('5.3.3 Customers');
  if (!ws) throw new Error(`${file} has no "5.3.3 Customers" sheet`);
  const customers: { no: number; name: string; phones: string[]; accounts: string[] }[] = [];
  ws.eachRow((row) => {
    const v = row.values as unknown[];
    if (typeof v[1] !== 'number') return;
    const list = (x: unknown) => String(x ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    customers.push({ no: v[1], name: String(v[2] ?? ''), phones: list(v[3]), accounts: list(v[4]) });
  });
  return customers;
}

async function plan(detailFile: string) {
  const customers = await readCustomers(detailFile);
  const links = await prisma.phoneAccount.findMany({
    where: { accountNumber: { in: customers.flatMap((c) => c.accounts) } },
    select: { phoneNumber: true, accountNumber: true },
  });
  const phonesOf = (c: (typeof customers)[number]) =>
    Array.from(new Set([...c.phones, ...links.filter((l) => c.accounts.includes(l.accountNumber)).map((l) => l.phoneNumber)]));
  const loans = await prisma.loan.findMany({
    where: { borrowerId: { in: customers.flatMap(phonesOf) }, repaymentStatus: { not: 'REVERSED' } },
    select: {
      id: true,
      borrowerId: true,
      loanAmount: true,
      repaymentStatus: true,
      payments: { select: { id: true, amount: true, date: true, journalEntryId: true, journalEntry: { select: { description: true } } } },
    },
  });
  const split = await reconcileRepaymentsForLoans(prisma, loans.map((l) => l.id));
  const references = loans.flatMap((l) => l.payments.map((p) => parseRepaymentReference(p.journalEntry?.description)));
  const [gateway, pending] = await Promise.all([
    prisma.paymentTransaction.findMany({
      where: { txnRef: { in: references.flatMap((r) => (r.kind === 'superapp' ? [r.txnRef] : [])) } },
      select: { txnRef: true, transactionId: true },
    }),
    prisma.pendingPayment.findMany({
      where: { id: { in: references.flatMap((r) => (r.kind === 'manual' && r.pendingPaymentId ? [r.pendingPaymentId] : [])) } },
      select: { id: true, transactionId: true },
    }),
  ]);
  const lookups = {
    ftByTxnRef: new Map(gateway.filter((g) => g.txnRef).map((g) => [g.txnRef!, g.transactionId])),
    ftByPendingPayment: new Map(pending.map((p) => [p.id, p.transactionId])),
  };

  const planned: PlannedLoan[] = [];
  for (const c of customers) {
    const phones = phonesOf(c);
    for (const loan of loans.filter((l) => phones.includes(l.borrowerId))) {
      const restated = split.byLoan.get(loan.id);
      const overpaid = r2(restated?.unapplied ?? 0);
      if (overpaid < TOLERANCE) continue;
      const charges = r2((restated?.interest ?? 0) + (restated?.penalty ?? 0) + (restated?.serviceFee ?? 0) + (restated?.tax ?? 0));
      const rows = loan.payments.filter((p) => p.amount > 0 && p.journalEntryId);
      const pick = loan.repaymentStatus === 'Paid' ? closestSet(rows, overpaid, charges) : [];
      const remove = pick
        .map((i) => rows[i])
        .sort((a, b) => a.date.getTime() - b.date.getTime())
        .map((p) => {
          const ref = parseRepaymentReference(p.journalEntry?.description);
          return { paymentId: p.id, reference: referenceFor(ref, lookups) ?? '(none)', channel: ref.kind, amount: r2(p.amount), date: eatDay(p.date) };
        });
      const removedTotal = r2(remove.reduce((s, p) => s + p.amount, 0));
      const waived = r2(Math.max(0, removedTotal - overpaid));
      const left = r2(Math.max(0, overpaid - removedTotal));
      const result =
        loan.repaymentStatus !== 'Paid'
          ? `Not changed: the loan is ${loan.repaymentStatus}`
          : remove.length === 0
            ? 'Not changed: no repayment comes closer than leaving the loan as it is'
            : waived > 0
              ? `Closest: ${money(waived)} waived`
              : left > 0
                ? `Closest: ${money(left)} stays overpaid`
                : 'Exact';
      planned.push({
        no: c.no,
        customer: c.name,
        phone: c.phones.join(', '),
        account: c.accounts.join(', '),
        loanId: loan.id,
        loanAmount: loan.loanAmount,
        overpaid,
        charges,
        remove,
        removedTotal,
        waived,
        left,
        result,
      });
    }
  }

  const outDir = path.join(__dirname, 'output');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = format(new Date(), 'yyyyMMdd-HHmm');
  const jsonFile = path.join(outDir, `overpaid-removal-plan-${stamp}.json`);
  fs.writeFileSync(jsonFile, JSON.stringify({ madeAt: new Date().toISOString(), detailFile, loans: planned }, null, 2));
  const xlsxFile = path.join(outDir, `overpaid-removal-plan-${stamp}.xlsx`);
  await writePlanWorkbook(planned, xlsxFile);

  const acted = planned.filter((p) => p.remove.length);
  const count = (re: RegExp) => planned.filter((p) => re.test(p.result)).length;
  const sum = (k: 'overpaid' | 'removedTotal' | 'waived' | 'left', list = planned) => money(list.reduce((s, p) => s + p[k], 0));
  console.log(`\nCustomers in the detail: ${customers.length}; overpaid loans: ${planned.length}, overpaid ${sum('overpaid')}`);
  console.log(`  Exact match:                     ${count(/^Exact/)}`);
  console.log(`  Closest, difference waived:      ${count(/waived/)} (waived ${sum('waived')})`);
  console.log(`  Closest, part stays overpaid:    ${count(/stays overpaid/)} (left ${sum('left', acted)})`);
  console.log(`  Not changed:                     ${count(/^Not changed/)} (overpaid ${sum('overpaid', planned.filter((p) => !p.remove.length))})`);
  console.log(`  Repayments to remove: ${acted.reduce((n, p) => n + p.remove.length, 0)}, total ${sum('removedTotal')} (NIB refunds these by FT)`);
  const channels = acted.flatMap((p) => p.remove.map((r) => r.channel));
  console.log(`  By channel: ${Array.from(new Set(channels)).map((k) => `${k} ${channels.filter((c) => c === k).length}`).join(', ')}`);
  console.log(`\nPlan:     ${jsonFile}\nWorkbook: ${xlsxFile}`);
  console.log(`\nNext: npx tsx -r tsconfig-paths/register ${SCRIPT} run "${path.relative(process.cwd(), jsonFile)}" [--rehearse | --apply]`);
}

async function writePlanWorkbook(planned: PlannedLoan[], file: string) {
  const wb = new ExcelJS.Workbook();
  const font = { name: 'Arial', size: 10 };
  const num = '#,##0.00;-#,##0.00;-';
  const style = (ws: ExcelJS.Worksheet, money: string[]) => {
    ws.eachRow((row) => row.eachCell((cell) => (cell.font = { ...font, bold: row.number === 1 || cell.font?.bold })));
    ws.getRow(1).alignment = { wrapText: true, vertical: 'top' };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    for (const col of money) ws.getColumn(col).numFmt = num;
  };

  const loansSheet = wb.addWorksheet('Loans');
  loansSheet.columns = [
    { header: 'No. in 5.3.3', width: 8 },
    { header: 'Customer', width: 32 },
    { header: 'Phone', width: 15 },
    { header: 'Account', width: 16 },
    { header: 'Loan', width: 27 },
    { header: 'Overpaid in the portal', width: 13 },
    { header: 'Repayments removed (NIB refunds by FT)', width: 60 },
    { header: 'Removed', width: 12 },
    { header: 'Waived', width: 10 },
    { header: 'Still overpaid', width: 11 },
    { header: 'Result', width: 58 },
  ];
  for (const p of planned) {
    loansSheet.addRow([p.no, p.customer, p.phone, p.account, p.loanId, p.overpaid, p.remove.map((r) => `${r.reference} ${money(r.amount)}`).join(', '), p.removedTotal, p.waived, p.left || (p.remove.length ? 0 : p.overpaid), p.result]);
  }
  const lastLoan = planned.length + 1;
  const loanTotal = loansSheet.addRow(['', 'Total', '', '', '', ...['F', 'G', 'H', 'I', 'J'].map((c) => (c === 'G' ? '' : { formula: `SUM(${c}2:${c}${lastLoan})` })), '']);
  loanTotal.font = { ...font, bold: true };
  style(loansSheet, ['F', 'H', 'I', 'J']);

  const refundSheet = wb.addWorksheet('Repayments removed');
  refundSheet.columns = [
    { header: 'No. in 5.3.3', width: 8 },
    { header: 'Customer', width: 32 },
    { header: 'Account', width: 16 },
    { header: 'Date', width: 12 },
    { header: 'Reference', width: 16 },
    { header: 'Channel', width: 12 },
    { header: 'Amount to refund', width: 14 },
  ];
  const channelName: Record<string, string> = { cbs: 'CBS auto-debit', superapp: 'SuperApp', manual: 'Manual resolution', manualRepayment: 'Manual repayment', unknown: '' };
  for (const p of planned) {
    for (const r of p.remove) refundSheet.addRow([p.no, p.customer, p.account, r.date, r.reference, channelName[r.channel] ?? r.channel, r.amount]);
  }
  const lastRefund = refundSheet.rowCount;
  const refundTotal = refundSheet.addRow(['', 'Total', '', '', '', '', { formula: `SUM(G2:G${lastRefund})` }]);
  refundTotal.font = { ...font, bold: true };
  style(refundSheet, ['G']);
  await wb.xlsx.writeFile(file);
}

// --- run -------------------------------------------------------------------------------

/** How posting an entry moved its account's balance (as the repayment flows post them). */
function postedDelta(accountType: string, entryType: string, amount: number): number {
  if (accountType === 'Receivable' || accountType === 'Received') return entryType === 'Debit' ? amount : -amount;
  if (accountType === 'Income') return entryType === 'Credit' ? amount : -amount;
  throw new Error(`Unexpected ${accountType} account on a repayment entry`);
}

class Rehearsal extends Error {}
class Mismatch extends Error {}

async function runPlan(planFile: string) {
  const apply = process.argv.includes('--apply');
  const rehearse = process.argv.includes('--rehearse');
  const { loans: planned } = JSON.parse(fs.readFileSync(planFile, 'utf8')) as { loans: PlannedLoan[] };
  const work = planned.filter((p) => p.remove.length);

  const [done, loans] = await Promise.all([
    prisma.auditLog.findMany({ where: { action: ACTION, entityId: { in: work.map((p) => p.loanId) } }, select: { entityId: true } }),
    prisma.loan.findMany({
      where: { id: { in: work.map((p) => p.loanId) } },
      select: { id: true, repaymentStatus: true, payments: { select: { id: true, amount: true, journalEntry: { select: { description: true } } } } },
    }),
  ]);
  const doneLoans = new Set(done.map((a) => a.entityId));
  const split = await reconcileRepaymentsForLoans(prisma, work.filter((p) => !doneLoans.has(p.loanId)).map((p) => p.loanId));

  const skipped: string[] = [];
  const ready = work.filter((p) => {
    if (doneLoans.has(p.loanId)) return false;
    const loan = loans.find((l) => l.id === p.loanId);
    const why = !loan
      ? 'loan not found'
      : loan.repaymentStatus !== 'Paid'
        ? `loan is ${loan.repaymentStatus}`
        : Math.abs((split.byLoan.get(p.loanId)?.unapplied ?? 0) - p.overpaid) > TOLERANCE
          ? `overpaid is now ${money(split.byLoan.get(p.loanId)?.unapplied ?? 0)}, planned ${money(p.overpaid)}`
          : p.remove.find((r) => {
                const pay = loan.payments.find((x) => x.id === r.paymentId);
                return !pay || Math.abs(pay.amount - r.amount) > TOLERANCE || r.channel === 'manualRepayment';
              })
            ? 'a planned repayment is missing, has changed, or is a manual repayment'
            : null;
    if (why) skipped.push(`${p.no} ${p.customer} (${p.loanId}): ${why}`);
    return !why;
  });

  console.log(`\nPlan: ${work.length} loans to change, ${doneLoans.size} already done, ${skipped.length} skipped, ${ready.length} ready.`);
  for (const s of skipped) console.log(`  skipped ${s}`);
  if (!apply && !rehearse) {
    for (const p of ready) console.log(`  ${p.no} ${p.customer}: remove ${p.remove.map((r) => `${r.reference} ${money(r.amount)}`).join(' + ')} | ${p.result}`);
    console.log('\nDRY RUN — no changes written. Re-run with --rehearse to test the writes, or --apply to commit.');
    return;
  }

  const accountTypes = new Map((await prisma.ledgerAccount.findMany({ select: { id: true, type: true } })).map((a) => [a.id, a.type]));
  const ok: string[] = [];
  const failed: string[] = [];
  for (const p of ready) {
    try {
      await prisma.$transaction(
        async (tx) => {
          await removeRepayments(tx, p, accountTypes);
          const after = (await reconcileRepaymentsForLoans(tx as any, [p.loanId])).byLoan.get(p.loanId);
          const principal = r2(after?.principal ?? 0);
          const left = r2(after?.unapplied ?? 0);
          const line = `${p.no} ${p.customer}: removed ${money(p.removedTotal)}; principal ${money(principal)}, interest ${money(after?.interest ?? 0)}, penalty ${money(after?.penalty ?? 0)}, overpaid ${money(left)}`;
          if (principal < p.loanAmount - TOLERANCE || Math.abs(left - p.left) > TOLERANCE) throw new Mismatch(`${line} (planned overpaid ${money(p.left)})`);
          ok.push(line);
          if (rehearse) throw new Rehearsal();
        },
        { maxWait: 15_000, timeout: 60_000 },
      );
    } catch (e) {
      if (e instanceof Rehearsal) continue;
      if (e instanceof Mismatch) {
        failed.push(e.message);
        continue;
      }
      throw e;
    }
  }
  console.log(`\n${rehearse ? 'REHEARSAL — each loan was changed and rolled back' : 'Done'}: ${ok.length} loans`);
  for (const l of ok) console.log(`  ${l}`);
  if (failed.length) {
    console.log(`\nRolled back, the result differs from the plan (${failed.length}):`);
    for (const l of failed) console.log(`  ${l}`);
  }
}

async function removeRepayments(tx: Prisma.TransactionClient, p: PlannedLoan, accountTypes: Map<string, string>) {
  const payments = await tx.payment.findMany({
    where: { id: { in: p.remove.map((r) => r.paymentId) } },
    include: { journalEntry: { include: { entries: true } } },
  });
  for (const pay of payments) {
    const je = pay.journalEntry;
    for (const e of je?.entries ?? []) {
      await tx.ledgerAccount.update({
        where: { id: e.ledgerAccountId },
        data: { balance: { increment: -postedDelta(accountTypes.get(e.ledgerAccountId)!, e.type, e.amount) } },
      });
    }
    await tx.payment.delete({ where: { id: pay.id } });
    if (je) {
      await tx.ledgerEntry.deleteMany({ where: { journalEntryId: je.id } });
      await tx.journalEntry.delete({ where: { id: je.id } });
    }
    const ref = parseRepaymentReference(je?.description);
    if (ref.kind === 'manual' && ref.pendingPaymentId) {
      await tx.pendingPayment.updateMany({ where: { id: ref.pendingPaymentId, status: 'COMPLETED' }, data: { status: 'REFUNDED' } });
    }
    if (ref.kind === 'superapp') {
      await tx.pendingPayment.updateMany({ where: { transactionId: ref.txnRef, status: 'COMPLETED' }, data: { status: 'REFUNDED' } });
    }
    const notifications = await tx.nplCreditNotification.findMany({ where: { paymentId: pay.id }, select: { id: true, resultMessage: true } });
    for (const n of notifications) {
      await tx.nplCreditNotification.update({
        where: { id: n.id },
        data: {
          paymentId: null,
          resultMessage: `${n.resultMessage ?? ''} | Overpayment to be refunded by NIB; the posting was removed by ${SCRIPT}.`.trim(),
        },
      });
    }
    await tx.loan.update({ where: { id: p.loanId }, data: { repaidAmount: { decrement: pay.amount } } });
    if (pay.installmentId) {
      const inst = await tx.loanInstallment.findUniqueOrThrow({ where: { id: pay.installmentId } });
      await tx.loanInstallment.update({ where: { id: inst.id }, data: { paidAmount: r2(Math.max(inst.amount, (inst.paidAmount ?? 0) - pay.amount)) } });
    }
  }
  await tx.auditLog.create({
    data: {
      actorId: 'system',
      action: ACTION,
      entity: 'Loan',
      entityId: p.loanId,
      details: JSON.stringify({
        customer: p.customer,
        account: p.account,
        overpaid: p.overpaid,
        waived: p.waived,
        left: p.left,
        removed: payments.map((pay) => ({
          paymentId: pay.id,
          reference: p.remove.find((r) => r.paymentId === pay.id)?.reference,
          amount: pay.amount,
          date: pay.date,
          installmentId: pay.installmentId,
          outstandingBalanceBeforePayment: pay.outstandingBalanceBeforePayment,
          journalEntry: pay.journalEntry && {
            id: pay.journalEntry.id,
            providerId: pay.journalEntry.providerId,
            date: pay.journalEntry.date,
            description: pay.journalEntry.description,
            entries: pay.journalEntry.entries.map((e) => ({ ledgerAccountId: e.ledgerAccountId, type: e.type, amount: e.amount })),
          },
        })),
        reason: `Overpayment in 5.3.3 of the Salary Advance GL reconciliation, to be refunded by NIB by FT; ${SCRIPT}.`,
      }),
    },
  });
}

const [step, file] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
(step === 'plan' && file ? plan(file) : step === 'run' && file ? runPlan(file) : Promise.reject(new Error('Usage: plan <detail.xlsx> | run <plan.json> [--rehearse | --apply]')))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
