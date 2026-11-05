import type { Prisma, PrismaClient } from '@prisma/client';
import { calculateTotalRepayable } from '../loan-calculator';
import { manualResolutionIds, parseRepaymentReference, referenceFor } from '../repayment-reference';
import { reconcileRepaymentsForLoans } from '../repayment-reconciliation-data';
import { borrowerIdentities, phonesMatching } from './borrowers';
import {
  chunked,
  compareBy,
  periodFilter,
  reportPage,
  skipOf,
  type Paging,
  type ReportPage,
  type ReportPeriod,
  type ReportSort,
} from './params';
import { asCalculatorLoan, asCalculatorProduct, PRODUCT_TERMS } from './product';
import { pageWithinScope } from './scope';

/**
 * Description prefixes of the journal posted when a loan is paid out
 * (api/loans, api/admin/applications, the Lersha farmer integration). Daily
 * accrual, reversal and correction journals carry no Payment either; without
 * this a loan would be listed as disbursed once per such journal.
 */
export const DISBURSEMENT_JOURNAL_PREFIXES = ['Loan disbursement for', 'Farmer loan disbursement for'];

/** How far apart a disbursement transaction and its journal may be to match by account and amount. */
const DISBURSEMENT_MATCH_MS = 3 * 60 * 1000;

export const TRANSACTION_TYPES = [
  'disbursement',
  'repayment',
  // Repayments on loans whose external disbursement failed.
  'failed-disbursement-with-repayment',
  // Repayments on loans posted internally, with no external disbursement record.
  'posted-disbursement-with-repayment',
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export function transactionType(value: string | null): TransactionType | null {
  return (TRANSACTION_TYPES as readonly string[]).includes(value ?? '') ? (value as TransactionType) : null;
}

export const TRANSACTION_SORT_COLUMNS = ['transactionDate', 'loanId', 'principalDisbursed'] as const;
export type TransactionSortColumn = (typeof TRANSACTION_SORT_COLUMNS)[number];
export const DEFAULT_TRANSACTION_SORT: ReportSort<TransactionSortColumn> = {
  by: 'transactionDate',
  dir: 'desc',
};

function transactionOrder(sort: ReportSort<TransactionSortColumn>): Prisma.JournalEntryOrderByWithRelationInput {
  switch (sort.by) {
    case 'loanId':
      return { loanId: sort.dir };
    case 'principalDisbursed':
      return { loan: { loanAmount: sort.dir } };
    default:
      return { date: sort.dir };
  }
}

interface JournalKey {
  id: string;
  date: Date;
  loanId: string | null;
  loan: { loanAmount: number } | null;
}

function compareJournalKeys(sort: ReportSort<TransactionSortColumn>) {
  const primary = compareBy<JournalKey>((k) => {
    switch (sort.by) {
      case 'loanId':
        return k.loanId;
      case 'principalDisbursed':
        return k.loan?.loanAmount;
      default:
        return k.date.getTime();
    }
  }, sort.dir);
  const tiebreak = compareBy<JournalKey>((k) => k.id, 'desc');
  return (a: JournalKey, b: JournalKey) => primary(a, b) || tiebreak(a, b);
}

export interface TransactionReportFilter {
  /** null = every provider. */
  providerId: string | null;
  /** Journal date. */
  period: ReportPeriod;
  /** Phone, bank account, name, loan id or journal id. */
  search?: string;
  type?: TransactionType | null;
  /** Borrowers in the user's branch scope; null = no restriction. */
  scope: string[] | null;
}

const JOURNAL_INCLUDE = {
  loan: {
    include: {
      product: {
        select: {
          ...PRODUCT_TERMS,
          provider: {
            select: {
              id: true,
              name: true,
              accountNumber: true,
              ledgerAccounts: { select: { name: true, type: true, category: true } },
            },
          },
        },
      },
    },
  },
  entries: { include: { ledgerAccount: { select: { name: true, type: true, category: true } } } },
  payment: { select: { id: true } },
} satisfies Prisma.JournalEntryInclude;
type JournalRow = Prisma.JournalEntryGetPayload<{ include: typeof JOURNAL_INCLUDE }>;

// rawResponse and responsePayload are left out: they are large strings.
const DISBURSEMENT_SELECT = {
  id: true,
  transactionId: true,
  loanId: true,
  providerId: true,
  originalProviderId: true,
  creditAccount: true,
  amount: true,
  statusCode: true,
  disbursementStatus: true,
  createdAt: true,
} satisfies Prisma.DisbursementTransactionSelect;
type DisbursementTx = Prisma.DisbursementTransactionGetPayload<{ select: typeof DISBURSEMENT_SELECT }>;

interface ReceivedEntry {
  date: Date;
  category: string;
  amount: number;
}

const unique = <T>(items: Array<T | null | undefined>): T[] =>
  [...new Set(items)].filter((item): item is T => item !== null && item !== undefined);

/** An account number compared on its digits, leading zeros dropped. */
const accountKey = (account: string | null | undefined) =>
  String(account || '')
    .replace(/\D/g, '')
    .replace(/^0+/, '');

/** The journal filters of a request, every one ANDed (the branch scope is added per query). */
async function journalConditions(
  prisma: PrismaClient,
  filter: TransactionReportFilter,
): Promise<Prisma.JournalEntryWhereInput[]> {
  const conditions: Prisma.JournalEntryWhereInput[] = [
    { loanId: { not: null } },
    { loan: { repaymentStatus: { not: 'REVERSED' } } },
  ];
  if (filter.providerId) conditions.push({ providerId: filter.providerId });
  const dates = periodFilter(filter.period);
  if (dates) conditions.push({ date: dates });

  switch (filter.type) {
    case 'repayment':
      conditions.push({ payment: { isNot: null } });
      break;
    case 'disbursement':
      conditions.push(
        { payment: { is: null } },
        { OR: DISBURSEMENT_JOURNAL_PREFIXES.map((prefix) => ({ description: { startsWith: prefix } })) },
      );
      break;
    case 'failed-disbursement-with-repayment':
      conditions.push(
        { payment: { isNot: null } },
        {
          loan: {
            disbursementTransactions: {
              some: {
                disbursementStatus: 'FAILED',
                ...(filter.providerId ? { providerId: filter.providerId } : {}),
              },
            },
          },
        },
      );
      break;
    case 'posted-disbursement-with-repayment':
      // "POSTED" (as on the Reversals page): a loan posted internally, with no
      // DisbursementTransaction, whose disbursement journal is on the ledger.
      conditions.push(
        { payment: { isNot: null } },
        {
          loan: {
            disbursementTransactions: { none: {} },
            journalEntries: { some: { payment: { is: null } } },
          },
        },
      );
      break;
  }

  if (filter.search) {
    // loan.borrowerId is the borrower's phone number; account numbers and
    // names map to it through PhoneAccount. Loan and journal ids match on any
    // part (the screen shows their last 8 characters).
    const phones = await phonesMatching(prisma, filter.search);
    conditions.push({
      OR: [
        { id: { contains: filter.search } },
        { loanId: { contains: filter.search } },
        { loan: { borrowerId: { contains: filter.search } } },
        ...(phones.length ? [{ loan: { borrowerId: { in: phones } } }] : []),
      ],
    });
  }
  return conditions;
}

/** Received ledger entries of the loans, for the collected-to-date amounts (one read per chunk, not per row). */
async function receivedByLoan(prisma: PrismaClient, loanIds: string[]): Promise<Map<string, ReceivedEntry[]>> {
  const byLoan = new Map<string, ReceivedEntry[]>();
  for (const chunk of chunked(loanIds)) {
    const entries = await prisma.ledgerEntry.findMany({
      where: { journalEntry: { loanId: { in: chunk } }, ledgerAccount: { type: 'Received' } },
      select: {
        amount: true,
        journalEntry: { select: { loanId: true, date: true } },
        ledgerAccount: { select: { category: true } },
      },
    });
    for (const entry of entries) {
      const loanId = entry.journalEntry.loanId;
      if (!loanId) continue;
      const list = byLoan.get(loanId) ?? [];
      list.push({ date: entry.journalEntry.date, category: entry.ledgerAccount.category, amount: entry.amount || 0 });
      byLoan.set(loanId, list);
    }
  }
  return byLoan;
}

/**
 * The CBS reference (FT) of each repayment journal, by journal id: read from
 * the journal's own description (see parseRepaymentReference), with one lookup
 * per channel for the ones that keep it elsewhere.
 */
async function repaymentReferences(prisma: PrismaClient, journals: JournalRow[]): Promise<Map<string, string>> {
  const parsed = journals
    .filter((je) => je.payment)
    .map((je) => ({ id: je.id, reference: parseRepaymentReference(je.description) }));
  const txnRefs = unique(parsed.map((p) => (p.reference.kind === 'superapp' ? p.reference.txnRef : null)));
  const pendingIds = manualResolutionIds(parsed.map((p) => p.reference));

  const ftByTxnRef = new Map<string, string>();
  for (const chunk of chunked(txnRefs)) {
    const rows = await prisma.paymentTransaction.findMany({
      where: { txnRef: { in: chunk } },
      select: { txnRef: true, transactionId: true },
    });
    for (const row of rows) {
      if (row.txnRef && /^FT/i.test(row.transactionId)) ftByTxnRef.set(row.txnRef, row.transactionId);
    }
  }
  const ftByPendingPayment = new Map<string, string>();
  for (const chunk of chunked(pendingIds)) {
    const rows = await prisma.pendingPayment.findMany({
      where: { id: { in: chunk } },
      select: { id: true, transactionId: true },
    });
    for (const row of rows) if (/^FT/i.test(row.transactionId)) ftByPendingPayment.set(row.id, row.transactionId);
  }

  const references = new Map<string, string>();
  for (const { id, reference } of parsed) {
    const ft = referenceFor(reference, { ftByTxnRef, ftByPendingPayment });
    if (ft) references.set(id, ft);
  }
  return references;
}

/** Disbursement transactions of the loans, then — for journals without one — of the providers within minutes of each journal. */
async function disbursementCandidates(
  prisma: PrismaClient,
  journals: JournalRow[],
): Promise<{ byLoan: DisbursementTx[]; nearby: DisbursementTx[] }> {
  const loanIds = unique(journals.map((je) => je.loanId));
  const byLoan: DisbursementTx[] = [];
  for (const chunk of chunked(loanIds)) {
    byLoan.push(
      ...(await prisma.disbursementTransaction.findMany({
        where: { loanId: { in: chunk } },
        select: DISBURSEMENT_SELECT,
        orderBy: { createdAt: 'desc' },
      })),
    );
  }

  const linked = new Set(unique(byLoan.map((d) => d.loanId)));
  const unmatched = journals.filter((je) => je.loanId && !linked.has(je.loanId));
  const providerIds = unique(journals.map((je) => je.providerId));
  if (!unmatched.length || !providerIds.length) return { byLoan, nearby: [] };

  // One window per journal (at most a page of them), not one span from the
  // earliest to the latest: a page sorted by loan id can cover months.
  const nearby = await prisma.disbursementTransaction.findMany({
    where: {
      AND: [
        { OR: [{ providerId: { in: providerIds } }, { originalProviderId: { in: providerIds } }] },
        {
          OR: unmatched.map((je) => ({
            createdAt: {
              gte: new Date(je.date.getTime() - DISBURSEMENT_MATCH_MS),
              lte: new Date(je.date.getTime() + DISBURSEMENT_MATCH_MS),
            },
          })),
        },
      ],
    },
    select: DISBURSEMENT_SELECT,
  });
  return { byLoan, nearby };
}

/** The best disbursement transaction of each loan: SUCCESS first, then one with a credit account, then the latest. */
function bestDisbursementByLoan(transactions: DisbursementTx[]): Map<string, DisbursementTx> {
  const best = new Map<string, DisbursementTx>();
  for (const d of transactions) {
    if (!d.loanId) continue;
    const existing = best.get(d.loanId);
    if (!existing) {
      best.set(d.loanId, d);
      continue;
    }
    const success = d.disbursementStatus === 'SUCCESS';
    const existingSuccess = existing.disbursementStatus === 'SUCCESS';
    if (success !== existingSuccess) {
      if (success) best.set(d.loanId, d);
      continue;
    }
    const hasAccount = Boolean(d.creditAccount);
    const existingHasAccount = Boolean(existing.creditAccount);
    if (hasAccount !== existingHasAccount) {
      if (hasAccount) best.set(d.loanId, d);
      continue;
    }
    if (d.createdAt.getTime() > existing.createdAt.getTime()) best.set(d.loanId, d);
  }
  return best;
}

export type TransactionReportRow = Awaited<ReturnType<typeof transactionsReport>>['data'][number];

/** Ledger transactions of loans: disbursements, repayments, or both. */
export async function transactionsReport(
  prisma: PrismaClient,
  filter: TransactionReportFilter,
  paging: Paging,
  sort: ReportSort<TransactionSortColumn> = DEFAULT_TRANSACTION_SORT,
) {
  const conditions = await journalConditions(prisma, filter);
  const where = (borrowerIds: string[] | null): Prisma.JournalEntryWhereInput => ({
    AND: borrowerIds ? [...conditions, { loan: { borrowerId: { in: borrowerIds } } }] : conditions,
  });
  // Unique id tiebreaker: SQL Server returns tied dates in any order, which
  // duplicated and skipped rows as an export walked through the pages.
  const orderBy = [transactionOrder(sort), { id: 'desc' as const }];

  const [{ total, rows: journals }, taxConfig] = await Promise.all([
    pageWithinScope({
      scope: filter.scope,
      paging,
      direct: async (borrowerIds) => {
        const [count, rows] = await Promise.all([
          prisma.journalEntry.count({ where: where(borrowerIds) }),
          prisma.journalEntry.findMany({
            where: where(borrowerIds),
            include: JOURNAL_INCLUDE,
            orderBy,
            skip: skipOf(paging),
            take: paging.pageSize,
          }),
        ]);
        return { total: count, rows };
      },
      keysIn: (borrowerIds) =>
        prisma.journalEntry.findMany({
          where: where(borrowerIds),
          select: { id: true, date: true, loanId: true, loan: { select: { loanAmount: true } } },
        }),
      compare: compareJournalKeys(sort),
      rowsById: (ids) => prisma.journalEntry.findMany({ where: { id: { in: ids } }, include: JOURNAL_INCLUDE }),
      idOf: (je) => je.id,
    }),
    prisma.tax.findMany(),
  ]);

  const loanIds = unique(journals.map((je) => je.loanId));
  const [identities, received, candidates, references, reconciled] = await Promise.all([
    borrowerIdentities(
      prisma,
      journals.map((je) => je.loan?.borrowerId),
    ),
    receivedByLoan(prisma, loanIds),
    disbursementCandidates(prisma, journals),
    repaymentReferences(prisma, journals),
    // Each repayment's split restated across ALL of its loan's repayments (not
    // just this page's), so page rows and the dashboard come from one figure.
    reconcileRepaymentsForLoans(prisma, unique(journals.filter((je) => je.payment).map((je) => je.loanId))),
  ]);

  // 1) Strong match: the loan's own disbursement transaction (no date limit).
  const disbursementOfLoan = bestDisbursementByLoan(candidates.byLoan);
  // 2) Fallback: account + amount within minutes of the journal.
  const byAccount = new Map<string, DisbursementTx[]>();
  const seen = new Set<string>();
  for (const d of [...candidates.byLoan, ...candidates.nearby]) {
    if (seen.has(d.id)) continue;
    seen.add(d.id);
    const raw = String(d.creditAccount || '').trim();
    for (const key of new Set([raw, accountKey(raw)])) {
      if (key) byAccount.set(key, [...(byAccount.get(key) ?? []), d]);
    }
  }

  const rows = journals.map((je) => {
    const loan = je.loan;
    const provider = loan?.product?.provider;
    const totals = loan
      ? calculateTotalRepayable(asCalculatorLoan(loan), asCalculatorProduct(loan.product), taxConfig, je.date, true)
      : { total: 0, principal: 0, interest: 0, serviceFee: 0, penalty: 0, tax: 0 };

    // Collected up to the journal's date.
    const collected: Record<string, number> = { Principal: 0, Interest: 0, ServiceFee: 0, Penalty: 0, Tax: 0 };
    for (const entry of (loan && received.get(loan.id)) || []) {
      if (entry.date <= je.date) collected[entry.category] = (collected[entry.category] || 0) + entry.amount;
    }

    const principalDisbursed = loan?.loanAmount || 0;
    const principalOutstanding = Math.max(0, (totals.principal || 0) - (collected.Principal || 0));
    const interestOutstanding = Math.max(0, (totals.interest || 0) - (collected.Interest || 0));
    const serviceFeeOutstanding = Math.max(0, (totals.serviceFee || 0) - (collected.ServiceFee || 0));
    const penaltyOutstanding = Math.max(0, (totals.penalty || 0) - (collected.Penalty || 0));
    const totalOutstanding = principalOutstanding + interestOutstanding + serviceFeeOutstanding + penaltyOutstanding;

    // A repayment: what THIS repayment paid (not cumulative), restated per loan
    // so the columns add up to the dashboard's collections.
    let principalPaid = 0;
    let interestPaid = 0;
    let serviceFeePaid = 0;
    let penaltyPaid = 0;
    let unappliedPaid = 0;
    const restated = je.payment ? reconciled.byEntry.get(je.id) : undefined;
    if (restated) {
      principalPaid = restated.principal;
      interestPaid = restated.interest;
      serviceFeePaid = restated.serviceFee;
      penaltyPaid = restated.penalty;
      unappliedPaid = restated.unapplied;
    } else if (je.payment) {
      for (const entry of je.entries) {
        if (entry.ledgerAccount?.type !== 'Received') continue;
        const amount = entry.amount || 0;
        switch (entry.ledgerAccount.category) {
          case 'Principal':
            principalPaid += amount;
            break;
          case 'Interest':
            interestPaid += amount;
            break;
          case 'ServiceFee':
            serviceFeePaid += amount;
            break;
          case 'Penalty':
            penaltyPaid += amount;
            break;
        }
      }
    } else {
      principalPaid = collected.Principal || 0;
      interestPaid = collected.Interest || 0;
      serviceFeePaid = collected.ServiceFee || 0;
      penaltyPaid = collected.Penalty || 0;
    }
    const totalPaid = principalPaid + interestPaid + serviceFeePaid + penaltyPaid + unappliedPaid;

    const debitAccounts = provider?.accountNumber
      ? [provider.accountNumber]
      : je.entries.filter((e) => e.type === 'Debit').flatMap((e) => (e.ledgerAccount?.name ? [e.ledgerAccount.name] : []));
    let creditAccounts = je.entries
      .filter((e) => e.type === 'Credit')
      .flatMap((e) => (e.ledgerAccount?.name ? [e.ledgerAccount.name] : []));
    const ledgerAccounts = provider?.ledgerAccounts ?? [];
    const disbursementAccount =
      ledgerAccounts.find((a) => a.category === 'Principal' && a.type !== 'Receivable') ||
      ledgerAccounts.find((a) => /fund|cash|disburse/i.test(a.name)) ||
      ledgerAccounts.find((a) => a.type === 'Received') ||
      ledgerAccounts.find((a) => a.type === 'Income') ||
      null;
    const isDisbursement = filter.type === 'disbursement' || (!je.payment && !filter.type);
    if (isDisbursement && disbursementAccount) creditAccounts = [disbursementAccount.name];

    const identity = loan ? identities.get(loan.borrowerId) : undefined;

    // A booked repayment succeeded — the money is on the loan. "POSTED" is the
    // disbursement default, replaced below by whatever CBS reported for it.
    let transactionStatus = je.payment ? 'SUCCESS' : 'POSTED';
    const reference = (je.payment && references.get(je.id)) || je.id;

    let cbsReference: string | null = null;
    let cbsCreditAmount: number | null = null;
    let disbursementCreatedAt: Date | null = null;
    let disbursementStatusCode: number | null = null;
    let disbursementStatusText: string | null = null;
    let disbursementOutcome: string | null = null;
    let borrowerAccount: string | null = identity?.account || null;

    if (loan) {
      let match: DisbursementTx | null = disbursementOfLoan.get(loan.id) ?? null;
      if (!match) {
        // Every account the borrower has held, not only today's active one: a
        // loan paid to an old account would otherwise lose its match.
        const keys = new Set<string>();
        for (const account of [borrowerAccount, ...(identity?.accounts ?? [])]) {
          const raw = String(account || '').trim();
          if (!raw) continue;
          keys.add(raw);
          keys.add(accountKey(raw));
        }
        const jeTime = je.date.getTime();
        let bestDiff = Infinity;
        for (const key of keys) {
          for (const c of byAccount.get(key) ?? []) {
            // A transaction linked to another loan paid that loan, not this one.
            if (c.loanId && c.loanId !== loan.id) continue;
            if (Math.abs((c.amount || 0) - principalDisbursed) >= 0.01) continue;
            const diff = Math.abs(c.createdAt.getTime() - jeTime);
            if (diff <= DISBURSEMENT_MATCH_MS && diff < bestDiff) {
              bestDiff = diff;
              match = c;
            }
          }
        }
      }

      if (match) {
        disbursementCreatedAt = match.createdAt;
        disbursementStatusCode = match.statusCode ?? null;
        // Shown even for failures, so the report matches the Reversals page.
        cbsReference = match.transactionId ?? null;
        // The account that actually received the money: borrowers can hold
        // several (salary advance), and this is the one that was paid.
        if (match.creditAccount) borrowerAccount = match.creditAccount;
        // The disbursement's outcome speaks for the disbursement row only: a
        // repayment is matched just to borrow the customer's credit account.
        const ownsStatus = !je.payment;
        const code = disbursementStatusCode;
        if (match.disbursementStatus === 'SUCCESS' || (code !== null && code >= 200 && code < 300)) {
          disbursementStatusText = 'Success';
          disbursementOutcome = 'Success';
          cbsCreditAmount = match.amount ?? null;
          if (ownsStatus) transactionStatus = 'SUCCESS';
        } else if (match.disbursementStatus === 'FAILED' || (code !== null && (code < 200 || code >= 300))) {
          disbursementStatusText = code !== null ? `Status ${code}` : 'Failed';
          disbursementOutcome = 'Failure';
          cbsCreditAmount = 0;
          if (ownsStatus) transactionStatus = 'FAILED';
        } else if (match.disbursementStatus === 'PENDING' || match.disbursementStatus === 'SENT') {
          disbursementStatusText = match.disbursementStatus;
          disbursementOutcome = 'Pending';
          if (ownsStatus) transactionStatus = 'PENDING';
        }
      }
    }

    return {
      provider: provider?.name || null,
      providerId: provider?.id || null,
      loanId: loan?.id || null,
      customerName: identity?.name || null,
      borrowerPhone: identity?.phone ?? loan?.borrowerId ?? null,
      transactionDate: je.date,
      dueDate: loan?.dueDate || null,
      debitAccount: debitAccounts.join(', '),
      creditAccount: creditAccounts.join(', '),
      transactionStatus,
      reference,
      productType: loan?.product?.name || null,
      borrowerId: loan?.borrowerId || null,
      borrowerAccount,
      principalDisbursed,
      netDisbursed: loan?.netDisbursedAmount != null ? loan.netDisbursedAmount : principalDisbursed,
      principalOutstanding,
      interestOutstanding,
      serviceFeeOutstanding,
      penaltyOutstanding,
      totalOutstanding,
      principalPaid,
      interestPaid,
      serviceFeePaid,
      penaltyPaid,
      // Cash beyond what the loan owed in principal and charges (overpaid).
      unappliedPaid,
      totalPaid,
      status: loan?.repaymentStatus || null,
      cbsReference,
      cbsCreditAmount,
      disbursementCreatedAt,
      disbursementStatusCode,
      disbursementStatusText,
      disbursementOutcome,
    };
  });

  return reportPage(rows, total, paging);
}

export type TransactionsReport = ReportPage<TransactionReportRow>;
