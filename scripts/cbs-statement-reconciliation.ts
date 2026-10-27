/**
 * Bridge a CBS statement of the Salary Advance GL to the portal.
 *
 * The bank reads the GL balance — plus the income still parked on it and the
 * portal's interest/penalty receivable — as the outstanding loan book. But the GL
 * also carries money that is not loan principal: customer payments the portal
 * never applied, the refunds of those payments, bank adjustments and recoveries,
 * disbursements that never became portal loans. This ties every statement line
 * to the portal by its FT reference, classifies the rest, and itemises how they
 * add up to the difference between the bank's figure and the portal's.
 *
 * Every item is signed by its effect on (bank figure − portal figure):
 *   a debit the portal has no record of       +amount   money out that no loan accounts for
 *   a credit the portal never applied         −amount   money in that repaid no loan
 *   a portal loan / its disbursement debit    −gross / +debit
 *   a portal payment / its statement credit   +amount / −credit
 *   portal unapplied (overpaid) cash          −amount
 *
 * Items are grouped per customer (phones and accounts linked through the portal),
 * so a refund nets against the payment it returned. What is left for a customer is
 * money the GL still holds for them (refund or apply it) or money paid out beyond
 * what they paid in (recover or explain). Equal and opposite amounts under another
 * phone/account, or in a bank adjustment line, are suggested as offsets — never
 * netted silently.
 *
 * Read-only. The workbook names customers and accounts, so it is written to
 * scripts/output/ (gitignored).
 *
 *   npx tsx -r tsconfig-paths/register scripts/cbs-statement-reconciliation.ts "<statement.xlsx>" [--confirmed <file.json>]
 *
 * --confirmed takes what the bank has confirmed about individual statement lines,
 * so its answers carry into the next run: a JSON array of
 *   { "ref": "DC260576001018001", "customer": "A:7000017849258", "note": "SR 0030 paid to …" }
 * A confirmed line is attributed to that customer ("A:<account>" or "P:<phone>";
 * omit it to leave the line with the bank) and keeps the note. These files name
 * customers, so keep them in scripts/output/ too.
 */
import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { format } from 'date-fns';
import prisma from '../src/lib/prisma';
import { getOpenLoanOutstanding } from '../src/lib/dashboard-metrics';
import { reconcileRepaymentsForLoans } from '../src/lib/repayment-reconciliation-data';
import { parseRepaymentReference, referenceFor } from '../src/lib/repayment-reference';

const TOLERANCE = 0.005;

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const money = (n: number) => r2(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const norm = (s: unknown) => String(s ?? '').trim().toUpperCase();
/** The CBS books in Addis Ababa time. */
const eatDay = (d: Date) => new Date(d.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);
const daysApart = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;

const accountIn = (s: string) => s.match(/Acc\.No\.-\s*(\d{10,16})\b/)?.[1];
const glIn = (s: string) => s.match(/Acc\.No\.-\s*(ETB\d+)/)?.[1];
const phoneIn = (s: string) => s.match(/\b(251\d{9})\b/)?.[1];
const quotedFt = (s: string) => s.match(/\bFT[0-9A-Z]{8,10}\b/i)?.[0].toUpperCase();
const ADJUSTMENT = /ADJ|ADUST|\bSR[\s/]*\d{3,4}/i;

// ---- Statement ---------------------------------------------------------------

interface StatementLine {
  row: number;
  bookDate: string;
  ref: string;
  /** First description row, e.g. "Internet Credit -", "Nibtera Lending", "Transfer". */
  description: string;
  /** Continuation rows: the phone, "To Acc.No.- …", "DISBURSEMENT", "PRO0001", … */
  narrative: string;
  debit: number;
  credit: number;
}

interface Statement {
  account: string;
  opening: number;
  closing: number;
  lines: StatementLine[];
  /** Rows the bank adds under the period-end balance (income still on the GL, receivables). */
  adjustments: { label: string; amount: number }[];
}

function cellValue(v: ExcelJS.CellValue): unknown {
  if (v === null || v === undefined || v instanceof Date || typeof v !== 'object') return v ?? null;
  if ('richText' in v) return v.richText.map((t) => t.text).join('');
  if ('result' in v) return v.result ?? null;
  if ('text' in v) return v.text;
  return null;
}

const amountOf = (v: unknown) => {
  const n = Number(String(v ?? '').replace(/[^0-9.-]/g, ''));
  return v === null || v === '' || !Number.isFinite(n) ? 0 : n;
};

async function readStatement(file: string): Promise<Statement> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const statement: Statement = { account: '', opening: 0, closing: 0, lines: [], adjustments: [] };
  let afterEnd = false;
  let last: StatementLine | null = null;
  wb.worksheets[0].eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const [date, ref, desc, , debit, credit, balance] = (row.values as ExcelJS.CellValue[]).slice(1, 8).map(cellValue);
    const label = String(desc ?? '').trim();
    if (/^Account\s*:/i.test(String(date ?? ''))) statement.account = String(ref ?? '').trim();
    else if (/Balance at Period Start/i.test(String(ref ?? ''))) statement.opening = amountOf(balance);
    else if (/Balance at Period End/i.test(String(ref ?? ''))) {
      statement.closing = amountOf(balance);
      afterEnd = true;
    } else if (afterEnd) {
      if (label && balance !== null) statement.adjustments.push({ label, amount: amountOf(balance) });
    } else if (date instanceof Date && ref) {
      last = {
        row: rowNumber,
        bookDate: date.toISOString().slice(0, 10),
        ref: String(ref).trim(),
        description: label,
        narrative: '',
        debit: amountOf(debit),
        credit: amountOf(credit),
      };
      statement.lines.push(last);
    } else if (last && label && !date && !ref) {
      last.narrative = `${last.narrative} ${label}`.trim();
    }
  });
  return statement;
}

// ---- Bridge items --------------------------------------------------------------

const KIND = {
  taxWithheld: 'Disaster commission withheld at disbursement (portal principal is gross)',
  taxRemitted: 'Disaster commission remitted from the GL',
  disbursementDiff: 'Disbursement debit differs from the portal net amount',
  duplicateDisbursement: 'Duplicate disbursement (portal loan paid out twice)',
  unlinkedRecord: 'Disbursement whose portal record lost its loan link',
  loanWithoutLine: 'Portal loan with no linked disbursement line',
  reversedLoanDisbursement: 'Disbursement of a loan the portal reversed',
  bnplDisbursement: 'BNPL disbursement misposted to this GL',
  bnplCorrection: 'Correction of misposted BNPL disbursement',
  unknownDisbursement: 'Disbursement the portal has no record of',
  roundTrip: 'Transfer booked as both debit and credit',
  refund: 'Refund / transfer to a customer',
  appNoCallback: 'SuperApp payment the portal never received',
  appNotApplied: 'SuperApp payment the portal received but did not apply',
  cbsNotApplied: 'CBS auto-debit the portal did not apply',
  cbsNoReference: 'CBS auto-debit the portal never got a reference for (request timed out)',
  creditNoCustomer: 'Credit the portal never received (no customer in the narrative)',
  amountDiff: 'Repayment posted with a different amount',
  reversedLoanRepayment: 'Repayment on a loan the portal reversed',
  portalOnly: 'Portal payment with no statement line',
  unapplied: 'Portal unapplied (overpaid) cash',
  manualCredit: 'Manual credit / transfer into the GL',
  manualDebit: 'Manual debit / transfer out of the GL',
} as const;

const GROUP_OF: Record<string, string> = {
  [KIND.taxWithheld]: 'Disbursements',
  [KIND.taxRemitted]: 'Disbursements',
  [KIND.disbursementDiff]: 'Disbursements',
  [KIND.duplicateDisbursement]: 'Disbursements',
  [KIND.unlinkedRecord]: 'Disbursements',
  [KIND.loanWithoutLine]: 'Disbursements',
  [KIND.reversedLoanDisbursement]: 'Disbursements',
  [KIND.bnplDisbursement]: 'Disbursements',
  [KIND.bnplCorrection]: 'Disbursements',
  [KIND.unknownDisbursement]: 'Disbursements',
  [KIND.manualCredit]: 'Bank adjustments',
  [KIND.manualDebit]: 'Bank adjustments',
  [KIND.roundTrip]: 'Bank adjustments',
};
const groupOf = (kind: string) => GROUP_OF[kind] ?? 'Customer money';

/** Statement-side items a person can tie to a customer or explain (not structural pairs). */
const LOOSE_KINDS = new Set<string>([
  KIND.unknownDisbursement,
  KIND.manualCredit,
  KIND.manualDebit,
  KIND.refund,
  KIND.cbsNoReference,
  KIND.creditNoCustomer,
]);

interface BridgeItem {
  kind: string;
  /** Effect on (bank figure − portal figure). */
  amount: number;
  /** Identity node: "P:<phone>" or "A:<account>". */
  customer: string | null;
  line?: StatementLine;
  portalRef?: string;
  note?: string;
}

class Identities {
  private parent = new Map<string, string>();
  find(x: string): string {
    const p = this.parent.get(x);
    if (p === undefined) {
      this.parent.set(x, x);
      return x;
    }
    if (p === x) return x;
    const root = this.find(p);
    this.parent.set(x, root);
    return root;
  }
  link(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

/** Does a bank narrative name this customer ("… FOR TIRUNESH JEGNE" vs "TIRUNESH JEGNIE DESSIE")? */
function namesCustomer(narrative: string, name: string): boolean {
  const [first, second] = norm(name).split(/[^A-Z]+/).filter((t) => t.length >= 3);
  if (!first) return false;
  const words = norm(narrative).split(/[^A-Z]+/);
  return words.includes(first) && (!second || words.some((w) => w.startsWith(second.slice(0, 4))));
}

interface Confirmation {
  ref: string;
  customer?: string;
  note: string;
}

function readConfirmations(file: string | undefined): Map<string, Confirmation> {
  if (!file) return new Map();
  const list = JSON.parse(fs.readFileSync(file, 'utf8')) as Confirmation[];
  for (const c of list) {
    if (!c.ref || !c.note || (c.customer && !/^[AP]:\S+$/.test(c.customer))) throw new Error(`Bad confirmation: ${JSON.stringify(c)}`);
  }
  return new Map(list.map((c) => [norm(c.ref), c]));
}

async function run() {
  const args = process.argv.slice(2);
  const confirmedAt = args.indexOf('--confirmed');
  const confirmedFile = confirmedAt >= 0 ? args[confirmedAt + 1] : undefined;
  const file = args.find((a, i) => !a.startsWith('--') && !(confirmedAt >= 0 && i === confirmedAt + 1));
  if (!file || !fs.existsSync(file) || (confirmedAt >= 0 && (!confirmedFile || !fs.existsSync(confirmedFile)))) {
    console.error('Usage: npx tsx -r tsconfig-paths/register scripts/cbs-statement-reconciliation.ts "<statement.xlsx>" [--confirmed <file.json>]');
    process.exit(1);
  }
  const confirmed = readConfirmations(confirmedFile);
  const statement = await readStatement(file);
  const { lines } = statement;
  if (lines.length === 0) throw new Error('No transactions found in the statement.');
  const now = new Date();

  // ---- Portal ------------------------------------------------------------------
  const [loans, disbursements, notifications, gatewayTxns, pendingPayments, payments, phoneAccounts, open] = await Promise.all([
    prisma.loan.findMany({
      select: { id: true, borrowerId: true, loanAmount: true, netDisbursedAmount: true, repaymentStatus: true },
    }),
    prisma.disbursementTransaction.findMany({
      where: { transactionId: { not: null } },
      select: { transactionId: true, creditAccount: true, loanId: true },
    }),
    // Debits the CBS confirmed, plus failed requests that named an amount (a timed-out
    // /repay may still have debited the customer).
    prisma.nplCreditNotification.findMany({
      where: { OR: [{ repayTransactionId: { not: null } }, { processStatus: 'FAILED', repayDebitAmount: { gt: 0 } }] },
      select: {
        repayTransactionId: true,
        accountNumber: true,
        borrowerId: true,
        processStatus: true,
        resultMessage: true,
        repayDebitAmount: true,
        receivedAt: true,
      },
    }),
    prisma.paymentTransaction.findMany({ select: { txnRef: true, transactionId: true } }),
    prisma.pendingPayment.findMany({ select: { id: true, transactionId: true, status: true, borrowerId: true } }),
    prisma.payment.findMany({
      select: { id: true, amount: true, date: true, loanId: true, journalEntry: { select: { description: true } } },
    }),
    prisma.phoneAccount.findMany({ select: { phoneNumber: true, accountNumber: true, customerName: true } }),
    getOpenLoanOutstanding(prisma, {}, now),
  ]);

  const loanById = new Map(loans.map((l) => [l.id, l]));
  const isBook = (loanId: string) => loanById.get(loanId)?.repaymentStatus !== 'REVERSED';
  const bookLoans = loans.filter((l) => isBook(l.id));
  const net = (l: (typeof loans)[number]) => l.netDisbursedAmount ?? l.loanAmount;

  const ids = new Identities();
  const names = new Map<string, string>();
  for (const pa of phoneAccounts) {
    ids.link(`P:${pa.phoneNumber}`, `A:${pa.accountNumber}`);
    if (pa.customerName) {
      names.set(`P:${pa.phoneNumber}`, pa.customerName.trim());
      names.set(`A:${pa.accountNumber}`, pa.customerName.trim());
    }
  }
  const disbursementByFt = new Map<string, (typeof disbursements)[number]>();
  for (const d of disbursements) {
    disbursementByFt.set(norm(d.transactionId), d);
    const loan = d.loanId ? loanById.get(d.loanId) : undefined;
    if (loan) ids.link(`A:${d.creditAccount}`, `P:${loan.borrowerId}`);
  }
  const notificationByFt = new Map<string, (typeof notifications)[number]>();
  for (const n of notifications) {
    if (n.borrowerId) ids.link(`A:${n.accountNumber}`, `P:${n.borrowerId}`);
    if (n.repayTransactionId) notificationByFt.set(norm(n.repayTransactionId), n);
  }
  const unreferencedRequests = notifications.filter((n) => !n.repayTransactionId);

  const ftByTxnRef = new Map<string, string>();
  const gatewayByFt = new Map<string, (typeof gatewayTxns)[number]>();
  for (const g of gatewayTxns) {
    if (!g.transactionId || !/^FT/i.test(g.transactionId)) continue;
    gatewayByFt.set(norm(g.transactionId), g);
    if (g.txnRef) ftByTxnRef.set(g.txnRef, g.transactionId);
  }
  const pendingByTxnRef = new Map(pendingPayments.map((p) => [p.transactionId, p]));
  const ftByPendingPayment = new Map<string, string>();
  for (const p of pendingPayments) {
    if (p.status === 'COMPLETED' && /^FT/i.test(p.transactionId)) ftByPendingPayment.set(p.id, p.transactionId);
  }
  const paymentsByFt = new Map<string, typeof payments>();
  for (const p of payments) {
    const ft = referenceFor(parseRepaymentReference(p.journalEntry?.description), { ftByTxnRef, ftByPendingPayment });
    const key = ft ? norm(ft) : `NO-REFERENCE:${p.id}`;
    paymentsByFt.set(key, [...(paymentsByFt.get(key) ?? []), p]);
  }

  // ---- Statement lines -----------------------------------------------------------
  const linesByFt = new Map<string, StatementLine[]>();
  for (const t of lines) linesByFt.set(norm(t.ref), [...(linesByFt.get(norm(t.ref)) ?? []), t]);
  // A refund quoting an earlier FT tells us whose money that FT was. Several refunds
  // can quote the same FT; the one for the same amount is the one that returned it.
  const refundsQuoting = new Map<string, { account: string; amount: number }[]>();
  const refundDates = new Map<string, string[]>();
  for (const t of lines) {
    if (!t.debit) continue;
    const account = accountIn(t.narrative);
    if (!account) continue;
    refundDates.set(account, [...(refundDates.get(account) ?? []), t.bookDate]);
    const q = quotedFt(t.narrative);
    if (q) refundsQuoting.set(q, [...(refundsQuoting.get(q) ?? []), { account, amount: t.debit }]);
  }
  const refundOf = (ft: string, amount: number) => {
    const refunds = refundsQuoting.get(ft) ?? [];
    const exact = refunds.find((r) => Math.abs(r.amount - amount) < TOLERANCE);
    return { exact: exact?.account, any: (exact ?? refunds[0])?.account };
  };
  const bnplQuoted = new Set(lines.filter((t) => /BNPL/i.test(t.narrative)).map((t) => quotedFt(t.narrative)));
  const disasterGls = new Set(lines.filter((t) => /DISA?S?TER/i.test(t.narrative)).map((t) => glIn(t.narrative)));

  const items: BridgeItem[] = [];
  let confirmedUsed = 0;
  const add = (kind: string, amount: number, customer: string | null, extra: Partial<BridgeItem> = {}) => {
    const c = extra.line ? confirmed.get(norm(extra.line.ref)) : undefined;
    if (c) {
      confirmedUsed += 1;
      if (c.customer) customer = c.customer;
      extra = { ...extra, note: [`bank: ${c.note}`, extra.note].filter(Boolean).join('; ') };
    }
    items.push({ kind, amount: r2(amount), customer, ...extra });
  };

  const disbursedLoans = new Map<string, number>();
  const creditedFts = new Set<string>();
  const usedRequests = new Set<(typeof notifications)[number]>();
  let incomeSwept = 0;

  for (const t of lines) {
    const ft = norm(t.ref);
    const same = linesByFt.get(ft)!;
    const signed = t.debit - t.credit;
    if (
      same.length === 2 &&
      same.some((x) => x.debit) &&
      same.some((x) => x.credit) &&
      Math.abs(same[0].debit + same[0].credit - same[1].debit - same[1].credit) < TOLERANCE
    ) {
      add(KIND.roundTrip, signed, null, { line: t });
      continue;
    }
    if (t.debit && /DISBURSEMENT/i.test(t.narrative)) {
      const record = disbursementByFt.get(ft);
      const loan = record?.loanId ? loanById.get(record.loanId) : undefined;
      if (!record) add(bnplQuoted.has(ft) ? KIND.bnplDisbursement : KIND.unknownDisbursement, t.debit, null, { line: t });
      else if (!loan) add(KIND.unlinkedRecord, t.debit, `A:${record.creditAccount}`, { line: t });
      else if (!isBook(loan.id)) add(KIND.reversedLoanDisbursement, t.debit, `P:${loan.borrowerId}`, { line: t, portalRef: loan.id });
      else {
        const nth = (disbursedLoans.get(loan.id) ?? 0) + 1;
        disbursedLoans.set(loan.id, nth);
        if (nth > 1) add(KIND.duplicateDisbursement, t.debit, `P:${loan.borrowerId}`, { line: t, portalRef: loan.id, note: `portal loan of ${money(loan.loanAmount)}` });
        else if (Math.abs(t.debit - net(loan)) > TOLERANCE) add(KIND.disbursementDiff, t.debit - net(loan), `P:${loan.borrowerId}`, { line: t, portalRef: loan.id, note: `portal net ${money(net(loan))}` });
      }
      continue;
    }
    if (/BNPL/i.test(t.narrative)) {
      add(KIND.bnplCorrection, signed, null, { line: t });
      continue;
    }
    if (disasterGls.has(glIn(t.narrative))) {
      add(KIND.taxRemitted, signed, null, { line: t });
      continue;
    }
    if (/COMMISSION AND PENALTY/i.test(t.narrative)) {
      incomeSwept += signed; // income moved off the GL; part of the bank's own income adjustment
      continue;
    }
    if (t.credit) {
      const posted = paymentsByFt.get(ft);
      const notification = notificationByFt.get(ft);
      const gateway = gatewayByFt.get(ft);
      const phone = phoneIn(t.narrative);
      if (posted && !creditedFts.has(ft)) {
        creditedFts.add(ft);
        const loan = loanById.get(posted[0].loanId)!;
        const portalAmount = posted.filter((p) => isBook(p.loanId)).reduce((s, p) => s + p.amount, 0);
        if (!isBook(loan.id)) add(KIND.reversedLoanRepayment, -t.credit, `P:${loan.borrowerId}`, { line: t, portalRef: loan.id });
        else if (Math.abs(portalAmount - t.credit) > TOLERANCE)
          add(KIND.amountDiff, portalAmount - t.credit, `P:${loan.borrowerId}`, { line: t, portalRef: loan.id, note: `portal posted ${money(portalAmount)}` });
      } else if (notification) {
        add(KIND.cbsNotApplied, -t.credit, `A:${notification.accountNumber}`, {
          line: t,
          note: `${notification.processStatus}: ${(notification.resultMessage ?? '').slice(0, 90)}`,
        });
      } else if (gateway) {
        const pending = gateway.txnRef ? pendingByTxnRef.get(gateway.txnRef) : undefined;
        add(KIND.appNotApplied, -t.credit, phone ? `P:${phone}` : pending ? `P:${pending.borrowerId}` : null, {
          line: t,
          note: `pending payment ${pending?.status ?? 'none'}`,
        });
      } else if (/PRO0001/.test(t.narrative) && /Lending/i.test(t.description)) {
        // The CBS took the money but our request never got its answer. Attribute it to a
        // failed request for the same amount that day, preferring accounts refunded later.
        const score = (n: (typeof notifications)[number]) =>
          (refundDates.get(n.accountNumber)?.some((d) => d >= t.bookDate) ? 0 : 10) + daysApart(t.bookDate, eatDay(n.receivedAt));
        const request = unreferencedRequests
          .filter((n) => !usedRequests.has(n) && Math.abs(Number(n.repayDebitAmount) - t.credit) < TOLERANCE && daysApart(t.bookDate, eatDay(n.receivedAt)) <= 1)
          .sort((a, b) => score(a) - score(b))[0];
        const refund = refundOf(ft, t.credit);
        const byRequest = refund.exact ? undefined : request;
        if (byRequest) usedRequests.add(byRequest);
        const account = refund.exact ?? byRequest?.accountNumber ?? refund.any;
        add(KIND.cbsNoReference, -t.credit, account ? `A:${account}` : null, {
          line: t,
          note: refund.exact
            ? 'a later refund of the same amount quotes this FT'
            : byRequest
              ? `attributed by amount to the ${eatDay(byRequest.receivedAt)} request "${(byRequest.resultMessage ?? '').slice(0, 40)}"`
              : account
                ? 'a later refund quotes this FT'
                : undefined,
        });
      } else if (phone) {
        add(KIND.appNoCallback, -t.credit, `P:${phone}`, { line: t });
      } else if (glIn(t.narrative) === statement.account || ADJUSTMENT.test(t.narrative)) {
        add(KIND.manualCredit, -t.credit, null, { line: t });
      } else {
        const account = refundOf(ft, t.credit).any;
        add(KIND.creditNoCustomer, -t.credit, account ? `A:${account}` : null, { line: t, note: account ? 'a later refund quotes this FT' : undefined });
      }
      continue;
    }
    // A refund the portal records (a negative payment under the refund's FT).
    const refunded = paymentsByFt.get(ft)?.filter((p) => p.amount < 0 && isBook(p.loanId));
    if (refunded?.length && !creditedFts.has(ft)) {
      creditedFts.add(ft);
      const portalAmount = refunded.reduce((s, p) => s + p.amount, 0);
      if (Math.abs(portalAmount + t.debit) > TOLERANCE) {
        const loan = loanById.get(refunded[0].loanId)!;
        add(KIND.amountDiff, t.debit + portalAmount, `P:${loan.borrowerId}`, { line: t, portalRef: loan.id, note: `portal refund ${money(-portalAmount)}` });
      }
      continue;
    }
    const account = accountIn(t.narrative);
    if (!account && (glIn(t.narrative) || ADJUSTMENT.test(t.narrative))) {
      add(KIND.manualDebit, t.debit, null, { line: t });
      continue;
    }
    let customer = account ? `A:${account}` : null;
    const q = quotedFt(t.narrative);
    if (!customer && q) {
      const original = linesByFt.get(q)?.[0];
      const phone = original ? phoneIn(original.narrative) : undefined;
      if (phone) customer = `P:${phone}`;
    }
    add(KIND.refund, t.debit, customer, { line: t, note: q ? `quotes ${q}` : undefined });
  }

  // ---- Portal side ---------------------------------------------------------------------
  const statementEnd = lines[lines.length - 1].bookDate;
  add(KIND.taxWithheld, -bookLoans.reduce((s, l) => s + l.loanAmount - net(l), 0), null, { note: `${bookLoans.length} portal loans` });
  for (const l of bookLoans) {
    if (!disbursedLoans.has(l.id)) add(KIND.loanWithoutLine, -net(l), `P:${l.borrowerId}`, { portalRef: l.id, note: `net ${money(net(l))}` });
  }
  for (const [ft, ps] of paymentsByFt) {
    if (creditedFts.has(ft)) continue;
    for (const p of ps.filter((x) => isBook(x.loanId))) {
      const day = eatDay(p.date);
      add(KIND.portalOnly, p.amount, `P:${loanById.get(p.loanId)!.borrowerId}`, {
        portalRef: p.loanId,
        note: `${day} ${ft.startsWith('NO-REFERENCE') ? 'no FT reference' : `reference "${ft}"`}${day > statementEnd ? ' (after the statement end)' : ''}: ${(p.journalEntry?.description ?? '').slice(0, 90)}`,
      });
    }
  }
  const reconciled = await reconcileRepaymentsForLoans(prisma, bookLoans.map((l) => l.id), now);
  let principalReceived = 0;
  let incomeReceived = 0;
  for (const [loanId, a] of reconciled.byLoan) {
    principalReceived += a.principal;
    incomeReceived += a.interest + a.serviceFee + a.penalty + a.tax;
    if (a.unapplied > TOLERANCE) add(KIND.unapplied, -a.unapplied, `P:${loanById.get(loanId)!.borrowerId}`, { portalRef: loanId });
  }

  // ---- Totals ------------------------------------------------------------------------------
  const sum = (xs: { amount: number }[]) => r2(xs.reduce((s, x) => s + x.amount, 0));
  const itemsTotal = sum(items);
  const isReceivable = (label: string) => /receivable/i.test(label);
  const bankIncome = -statement.adjustments.filter((a) => !isReceivable(a.label)).reduce((s, a) => s + a.amount, 0);
  const bankReceivable = -statement.adjustments.filter((a) => isReceivable(a.label)).reduce((s, a) => s + a.amount, 0);
  const bankOutstanding = r2(-statement.closing + bankIncome + bankReceivable);
  const portalPrincipal = r2(open.receivables.principal);
  const portalReceivable = r2(open.total - open.receivables.principal);
  const portalOutstanding = r2(open.total);
  const difference = r2(bankOutstanding - portalOutstanding);
  const incomeOnGl = r2(incomeReceived - incomeSwept);
  const bookPrincipal = r2(bookLoans.reduce((s, l) => s + l.loanAmount, 0) - principalReceived);
  const bridge: [string, number][] = [
    ['Statement and portal items (sheets "Customers" and "Bank items")', itemsTotal],
    ['Opening balance of the statement', r2(-statement.opening)],
    [`Income still on the GL: bank ${money(bankIncome)} vs portal ${money(incomeOnGl)} (received ${money(incomeReceived)} − swept ${money(incomeSwept)})`, r2(bankIncome - incomeOnGl)],
    [`Interest/penalty receivable: bank ${money(bankReceivable)} vs portal ${money(portalReceivable)}`, r2(bankReceivable - portalReceivable)],
    ['Principal unpaid on loans the portal does not count as open', r2(bookPrincipal - portalPrincipal)],
  ];
  const explained = r2(bridge.reduce((s, [, v]) => s + v, 0));

  // ---- Per customer ---------------------------------------------------------------------------
  interface CustomerRow {
    key: string;
    name: string;
    phones: string[];
    accounts: string[];
    notApplied: number;
    refunded: number;
    unapplied: number;
    other: number;
    net: number;
    /** First and last statement lines that paid money out to / took money in from them. */
    firstOut: string;
    lastOut: string;
    firstIn: string;
    lastIn: string;
    lastDate: string;
    references: string[];
    /** What the bank confirmed about this customer's lines. */
    bankNotes: string[];
    offset: string;
    residual: number;
  }
  const customers = new Map<string, CustomerRow>();
  for (const item of items) {
    if (!item.customer) continue;
    const key = ids.find(item.customer);
    let c = customers.get(key);
    if (!c) {
      c = { key, name: '', phones: [], accounts: [], notApplied: 0, refunded: 0, unapplied: 0, other: 0, net: 0, firstOut: '', lastOut: '', firstIn: '', lastIn: '', lastDate: '', references: [], bankNotes: [], offset: '', residual: 0 };
      customers.set(key, c);
    }
    const [type, id] = [item.customer.slice(0, 1), item.customer.slice(2)];
    const list = type === 'P' ? c.phones : c.accounts;
    if (!list.includes(id)) list.push(id);
    c.name ||= names.get(item.customer) ?? '';
    if (item.kind === KIND.refund) c.refunded += item.amount;
    else if (item.kind === KIND.unapplied) c.unapplied += item.amount;
    else if ([KIND.appNoCallback, KIND.appNotApplied, KIND.cbsNotApplied, KIND.cbsNoReference, KIND.creditNoCustomer].includes(item.kind as never)) c.notApplied += item.amount;
    else c.other += item.amount;
    c.net += item.amount;
    if (item.note?.startsWith('bank: ')) c.bankNotes.push(`${item.line?.ref ?? ''} ${item.note.split(';')[0].slice(6)}`.trim());
    if (item.line) {
      c.references.push(item.line.ref);
      const d = item.line.bookDate;
      if (d > c.lastDate) c.lastDate = d;
      if (item.amount > 0) {
        if (!c.firstOut || d < c.firstOut) c.firstOut = d;
        if (d > c.lastOut) c.lastOut = d;
      } else if (item.amount < 0) {
        if (!c.firstIn || d < c.firstIn) c.firstIn = d;
        if (d > c.lastIn) c.lastIn = d;
      }
    }
  }
  for (const c of customers.values()) {
    for (const k of ['notApplied', 'refunded', 'unapplied', 'other', 'net'] as const) c[k] = r2(c[k]);
    c.residual = c.net;
    c.name ||= c.phones.map((p) => names.get(`P:${p}`)).find(Boolean) ?? c.accounts.map((a) => names.get(`A:${a}`)).find(Boolean) ?? '';
  }

  // Suggested offsets: equal and opposite amounts that are probably the same money —
  // a refund paid to an account the portal never linked to the phone that paid, a
  // timed-out debit attributed to a namesake request, a bank recovery of an over-refund.
  // Money comes back only after it went out: a refund follows the payment it returns,
  // a recovery follows the payout it recovers.
  interface Party {
    label: string;
    value: number;
    /** Value without the customer's portal unapplied cash, which stands on its own. */
    alt: number;
    date: string;
    firstOut: string;
    lastOut: string;
    firstIn: string;
    lastIn: string;
    narrative: string;
    name: string;
    matched?: string;
    customer?: CustomerRow;
    item?: BridgeItem;
  }
  const describe = (c: CustomerRow) => `${c.name || '(no name)'} ${[...c.phones, ...c.accounts].join('/')}`;
  const customerParties: Party[] = [...customers.values()]
    .filter((c) => Math.abs(c.net) >= 0.01)
    .map((c) => ({ label: describe(c), value: c.net, alt: r2(c.net - c.unapplied), date: c.lastDate, firstOut: c.firstOut, lastOut: c.lastOut, firstIn: c.firstIn, lastIn: c.lastIn, narrative: '', name: c.name, customer: c }));
  const looseItems = items.filter((i) => !i.customer && LOOSE_KINDS.has(i.kind) && i.line);
  const lineParties: Party[] = looseItems.map((i) => ({
    label: `${i.kind}: ${i.line!.bookDate} ${i.line!.ref} ${i.line!.narrative}`.slice(0, 160),
    value: i.amount,
    alt: i.amount,
    date: i.line!.bookDate,
    firstOut: i.amount > 0 ? i.line!.bookDate : '',
    lastOut: i.amount > 0 ? i.line!.bookDate : '',
    firstIn: i.amount < 0 ? i.line!.bookDate : '',
    lastIn: i.amount < 0 ? i.line!.bookDate : '',
    narrative: `${i.line!.description} ${i.line!.narrative}`,
    name: '',
    item: i,
  }));
  const pairs: { a: Party; b: Party; amount: number }[] = [];
  /** Which side, if any, matched without its unapplied cash. */
  const offsets = (a: Party, b: Party) =>
    [
      { aAlt: false, bAlt: false },
      { aAlt: true, bAlt: false },
      { aAlt: false, bAlt: true },
    ].find(({ aAlt, bAlt }) => {
      const x = aAlt ? a.alt : a.value;
      return Math.abs(x) >= 0.01 && Math.abs(x + (bAlt ? b.alt : b.value)) < TOLERANCE;
    });
  const inOrder = (a: Party, b: Party) => {
    const [out, back] = a.value > 0 ? [a, b] : [b, a];
    const isRecovery = back.item?.kind === KIND.manualCredit;
    const lent = out.item?.kind === KIND.unknownDisbursement;
    // A recovery, or the repayment of a payout, comes after the payout; a refund after the payment it returns.
    if (isRecovery || lent) return !out.firstOut || !back.lastIn || back.lastIn >= out.firstOut;
    return !out.lastOut || !back.firstIn || out.lastOut >= back.firstIn;
  };
  const settle = (a: Party, pool: Party[]) => {
    if (a.matched) return;
    const nameScore = (b: Party) => (namesCustomer(b.narrative || a.narrative, b.narrative ? a.name : b.name) ? 0 : 1000);
    const b = pool
      .filter((p) => p !== a && !p.matched && offsets(a, p) && inOrder(a, p))
      .sort((x, y) => nameScore(x) - nameScore(y) || daysApart(a.date || x.date, x.date || a.date) - daysApart(a.date || y.date, y.date || a.date))[0];
    if (!b) return;
    const { aAlt, bAlt } = offsets(a, b)!;
    a.matched = b.label;
    b.matched = a.label;
    pairs.push({ a, b, amount: r2(aAlt ? a.alt : a.value) });
    for (const [p, other, usedAlt] of [
      [a, b, aAlt],
      [b, a, bAlt],
    ] as const) {
      if (!p.customer) continue;
      p.customer.offset = other.label;
      // Matched on the amount without unapplied cash: that cash is still the customer's.
      p.customer.residual = usedAlt ? p.customer.unapplied : 0;
    }
  };
  const bySize = (xs: Party[]) => [...xs].sort((x, y) => Math.abs(y.value) - Math.abs(x.value));
  for (const a of bySize(customerParties.filter((p) => p.value > 0))) settle(a, customerParties.filter((p) => p.value < 0));
  for (const a of bySize(customerParties)) settle(a, lineParties);
  for (const a of bySize(lineParties.filter((p) => p.item!.kind === KIND.unknownDisbursement))) {
    settle(a, lineParties.filter((p) => p.item!.kind === KIND.manualCredit));
  }

  const customerRows = [...customers.values()].filter((c) => Math.abs(c.net) >= 0.01);
  const status = (v: number) => (v < -TOLERANCE ? 'GL holds customer money — refund or apply' : v > TOLERANCE ? 'Paid out more than paid in — recover or explain' : 'Balanced');
  const residualLines = lineParties.filter((p) => !p.matched);

  // ---- Report -----------------------------------------------------------------------------------
  const kinds = new Map<string, { group: string; count: number; amount: number; customers: number }>();
  for (const i of items) {
    const k = kinds.get(i.kind) ?? { group: groupOf(i.kind), count: 0, amount: 0, customers: 0 };
    k.count += 1;
    k.amount = r2(k.amount + i.amount);
    if (i.customer) k.customers = r2(k.customers + i.amount);
    kinds.set(i.kind, k);
  }
  const held = customerRows.filter((c) => c.net < -TOLERANCE);
  const paidOut = customerRows.filter((c) => c.net > TOLERANCE);
  const residualHeld = customerRows.filter((c) => c.residual < -TOLERANCE);
  const residualPaidOut = customerRows.filter((c) => c.residual > TOLERANCE);
  const total = (xs: CustomerRow[], k: 'net' | 'residual') => r2(xs.reduce((s, c) => s + c[k], 0));

  const COUNT_ROWS = new Set(['Statement lines', 'Portal open loans', '  Offsetting pairs suggested']);
  const summary: [string, string | number][] = [
    ['Statement account', statement.account],
    ['Statement period', `${lines[0].bookDate} to ${statementEnd}`],
    ['Statement lines', lines.length],
    ...(confirmedFile ? [[`Lines with a bank confirmation (${path.basename(confirmedFile)})`, `${confirmedUsed} of ${confirmed.size}`] as [string, string]] : []),
    ['Opening balance', statement.opening],
    ['Closing balance', statement.closing],
    ...statement.adjustments.map((a): [string, number] => [`Bank adjustment: ${a.label}`, a.amount]),
    ['Bank figure (outstanding per GL)', bankOutstanding],
    ['', ''],
    ['Portal open loans', open.loans.length],
    ['Portal principal outstanding', portalPrincipal],
    ['Portal interest / fee / penalty receivable', portalReceivable],
    ['Portal outstanding', portalOutstanding],
    ['', ''],
    ['DIFFERENCE (bank − portal)', difference],
    ...bridge.map(([k, v]): [string, number] => [`  ${k}`, v]),
    ['  Explained', explained],
    ['  Unexplained', r2(difference - explained)],
    ['', ''],
    ['STATEMENT AND PORTAL ITEMS BY KIND (count / amount)', ''],
    ...[...kinds.entries()]
      .sort((a, b) => a[1].group.localeCompare(b[1].group) || Math.abs(b[1].amount) - Math.abs(a[1].amount))
      .map(([kind, k]): [string, number] => [`  [${k.group}] ${kind} (${k.count})`, k.amount]),
    ['', ''],
    ['PER CUSTOMER', ''],
    [`  Customers where the GL holds their money (${held.length})`, total(held, 'net')],
    [`  Customers paid out more than they paid in (${paidOut.length})`, total(paidOut, 'net')],
    [`  Bank lines with no customer (${looseItems.length})`, sum(looseItems)],
    ['AFTER SUGGESTED OFFSETS', ''],
    ['  Offsetting pairs suggested', pairs.length],
    [`  Customers where the GL holds their money (${residualHeld.length})`, total(residualHeld, 'residual')],
    [`  Customers paid out more than they paid in (${residualPaidOut.length})`, total(residualPaidOut, 'residual')],
    [`  Bank lines with no customer and no offset (${residualLines.length})`, r2(residualLines.reduce((s, p) => s + p.value, 0))],
  ];

  console.log('\n=== CBS STATEMENT ↔ PORTAL BRIDGE ===');
  for (const [label, value] of summary) {
    console.log(`${label.padEnd(110)} ${typeof value === 'number' && !COUNT_ROWS.has(label) ? money(value) : value}`);
  }
  console.log('\nLargest amounts left after suggested offsets:');
  const left = [
    ...customerRows.filter((c) => Math.abs(c.residual) > TOLERANCE).map((c) => ({ amount: c.residual, what: `${status(c.residual)}: ${describe(c)}` })),
    ...residualLines.map((p) => ({ amount: p.value, what: p.label })),
  ].sort((x, y) => Math.abs(y.amount) - Math.abs(x.amount));
  for (const l of left.slice(0, 25)) console.log(`  ${money(l.amount).padStart(12)}  ${l.what}`);

  const outDir = path.join(__dirname, 'output');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `cbs-statement-reconciliation-${format(now, 'yyyyMMdd-HHmm')}.xlsx`);
  const wb = new ExcelJS.Workbook();
  const amountStyle = { numFmt: '#,##0.00' };

  const summarySheet = wb.addWorksheet('Summary');
  summarySheet.columns = [
    { header: 'Item', key: 'item', width: 120 },
    { header: 'Value', key: 'value', width: 20, style: amountStyle },
  ];
  for (const [item, value] of summary) summarySheet.addRow({ item, value });

  const customerSheet = wb.addWorksheet('Customers');
  customerSheet.columns = [
    { header: 'Status', key: 'status', width: 44 },
    { header: 'Customer name', key: 'name', width: 30 },
    { header: 'Phones', key: 'phones', width: 16 },
    { header: 'Accounts', key: 'accounts', width: 18 },
    { header: 'Paid in, never applied by the portal', key: 'notApplied', width: 16, style: amountStyle },
    { header: 'Refunded / transferred back', key: 'refunded', width: 16, style: amountStyle },
    { header: 'Portal unapplied (overpaid)', key: 'unapplied', width: 16, style: amountStyle },
    { header: 'Disbursement / posting differences', key: 'other', width: 16, style: amountStyle },
    { header: 'Net (effect on bank − portal)', key: 'net', width: 16, style: amountStyle },
    { header: 'Suggested offset', key: 'offset', width: 90 },
    { header: 'Left after offset', key: 'residual', width: 16, style: amountStyle },
    { header: 'Bank confirmation', key: 'bankNotes', width: 90 },
    { header: 'Statement references', key: 'references', width: 120 },
  ];
  for (const c of customerRows.sort((a, b) => Math.abs(b.net) - Math.abs(a.net))) {
    customerSheet.addRow({ ...c, status: status(c.net), phones: c.phones.join(', '), accounts: c.accounts.join(', '), bankNotes: c.bankNotes.join(' | '), references: c.references.join(' ') });
  }

  const bankSheet = wb.addWorksheet('Bank items');
  bankSheet.columns = [
    { header: 'Kind', key: 'kind', width: 60 },
    { header: 'Book date', key: 'date', width: 12 },
    { header: 'Reference', key: 'ref', width: 20 },
    { header: 'Narrative', key: 'narrative', width: 70 },
    { header: 'Effect on bank − portal', key: 'amount', width: 16, style: amountStyle },
    { header: 'Suggested offset', key: 'offset', width: 90 },
    { header: 'Note', key: 'note', width: 90 },
  ];
  const offsetOf = new Map(lineParties.map((p) => [p.item!, p.matched ?? '']));
  for (const i of items.filter((x) => !x.customer)) {
    bankSheet.addRow({
      kind: i.kind,
      date: i.line?.bookDate ?? '',
      ref: i.line?.ref ?? '',
      narrative: i.line ? `${i.line.description} ${i.line.narrative}` : i.note,
      amount: i.amount,
      offset: offsetOf.get(i) ?? '',
      note: i.line ? (i.note ?? '') : '',
    });
  }

  const lineSheet = wb.addWorksheet('Statement lines');
  lineSheet.columns = [
    { header: 'Row', key: 'row', width: 8 },
    { header: 'Book date', key: 'date', width: 12 },
    { header: 'Reference', key: 'ref', width: 20 },
    { header: 'Description', key: 'description', width: 22 },
    { header: 'Narrative', key: 'narrative', width: 60 },
    { header: 'Debit', key: 'debit', width: 14, style: amountStyle },
    { header: 'Credit', key: 'credit', width: 14, style: amountStyle },
    { header: 'Portal match / kind', key: 'kind', width: 60 },
    { header: 'Customer', key: 'customer', width: 40 },
    { header: 'Portal loan', key: 'portalRef', width: 28 },
    { header: 'Effect on bank − portal', key: 'amount', width: 16, style: amountStyle },
    { header: 'Note', key: 'note', width: 90 },
  ];
  const itemByRow = new Map(items.filter((i) => i.line).map((i) => [i.line!.row, i]));
  for (const t of lines) {
    const i = itemByRow.get(t.row);
    const c = i?.customer ? customers.get(ids.find(i.customer)) : undefined;
    lineSheet.addRow({
      row: t.row,
      date: t.bookDate,
      ref: t.ref,
      description: t.description,
      narrative: t.narrative,
      debit: t.debit || null,
      credit: t.credit || null,
      kind: i?.kind ?? (/COMMISSION AND PENALTY/i.test(t.narrative) ? 'Income swept off the GL' : t.debit ? 'Disbursement of a portal loan' : 'Repayment posted in the portal'),
      customer: c ? describe(c) : (i?.customer ?? ''),
      portalRef: i?.portalRef ?? '',
      amount: i?.amount ?? 0,
      note: i?.note ?? '',
    });
  }

  for (const sheet of [summarySheet, customerSheet, bankSheet, lineSheet]) {
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
  }
  await wb.xlsx.writeFile(outFile);
  console.log(`\nWorkbook: ${outFile}`);
}

run()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
