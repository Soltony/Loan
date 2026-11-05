import type { Prisma, PrismaClient } from '@prisma/client';
import { calculateOutstandingBreakdown } from './loan-calculator';
import { addAmounts, zeroAmounts, type ReconciledAmounts } from './repayment-reconciliation';
import { reconcileRepaymentsForLoans } from './repayment-reconciliation-data';
import { scopeChunks } from './reports/scope';

/**
 * The loans a dashboard view covers. Every query below filters through the
 * loan relation (a join) instead of passing loan ids: an `IN` list of a few
 * thousand ids is a statement SQL Server takes about a second to run, and the
 * old id-batched reads made the dashboard take ~14 s to appear after sign-in.
 * Borrower scopes (Branch/District) still go in `IN`-sized chunks.
 */
export interface DashboardLoanScope {
  providerId?: string;
  /** null/undefined = no borrower restriction; [] = no borrowers in scope. */
  borrowerIds?: string[] | null;
  /** Only loans disbursed inside this window. */
  disbursedRange?: { gte: Date; lte: Date } | null;
}

/** Non-reversed loans of the scope, for one chunk of its borrowers. */
function liveLoanWhere(scope: DashboardLoanScope, borrowerIds: string[] | null): Prisma.LoanWhereInput {
  return {
    repaymentStatus: { not: 'REVERSED' },
    ...(scope.providerId ? { product: { providerId: scope.providerId } } : {}),
    ...(borrowerIds ? { borrowerId: { in: borrowerIds } } : {}),
    ...(scope.disbursedRange ? { disbursedDate: scope.disbursedRange } : {}),
  };
}

const CATEGORIES = ['Principal', 'Interest', 'ServiceFee', 'Penalty', 'Tax'] as const;
type Category = (typeof CATEGORIES)[number];

type CategoryAmounts = Record<Lowercase<Category>, number>;

function emptyCategoryAmounts(): CategoryAmounts {
  return {
    principal: 0,
    interest: 0,
    servicefee: 0,
    penalty: 0,
    tax: 0,
  };
}

function categoryKey(category: string): keyof CategoryAmounts {
  return category.toLowerCase() as keyof CategoryAmounts;
}

/**
 * Portfolio metrics scoped to non-REVERSED loans so dashboard totals match loan reports.
 * Ledger account balances include residue from reversed loans; entry-level sums do not.
 */
export async function getPortfolioLedgerMetrics(
  prisma: PrismaClient,
  providerId?: string,
  // When provided, scope all metrics to these borrowers (Branch/District users).
  // An empty array means "no borrowers in scope" and yields all-zero metrics.
  borrowerIds?: string[] | null,
  // When provided, only loans disbursed inside this window are counted.
  disbursedRange?: { gte: Date; lte: Date } | null,
): Promise<{
  totalDisbursed: number;
  receivables: {
    principal: number;
    interest: number;
    serviceFee: number;
    penalty: number;
    tax: number;
  };
  collections: {
    principal: number;
    interest: number;
    serviceFee: number;
    penalty: number;
    tax: number;
  };
}> {
  const scope: DashboardLoanScope = { providerId, borrowerIds, disbursedRange };
  const accounts = await prisma.ledgerAccount.findMany({
    where: {
      category: { in: [...CATEGORIES] },
      type: { in: ['Receivable', 'Received'] },
      ...(providerId ? { providerId } : {}),
    },
    select: { id: true, type: true, category: true, name: true, balance: true },
  });
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const accountIds = accounts.map((a) => a.id);

  // Loans and their ledger entries summed in the database, one statement each
  // per borrower chunk: per account and Debit/Credit, not entry by entry.
  let totalDisbursed = 0;
  let loanCount = 0;
  const receivableNet = emptyCategoryAmounts();
  const receivedNet = emptyCategoryAmounts();
  for (const chunk of scopeChunks(borrowerIds ?? null)) {
    const where = liveLoanWhere(scope, chunk);
    const [loans, grouped] = await Promise.all([
      prisma.loan.aggregate({ _sum: { loanAmount: true }, _count: { _all: true }, where }),
      accountIds.length > 0
        ? prisma.ledgerEntry.groupBy({
            by: ['ledgerAccountId', 'type'],
            where: { ledgerAccountId: { in: accountIds }, journalEntry: { loan: { is: where } } },
            _sum: { amount: true },
          })
        : Promise.resolve([]),
    ]);
    totalDisbursed += loans._sum.loanAmount ?? 0;
    loanCount += loans._count._all;
    for (const group of grouped) {
      const account = accountById.get(group.ledgerAccountId);
      if (!account) continue;
      const amount = group._sum.amount ?? 0;
      const signed = group.type === 'Debit' ? amount : -amount;
      const key = categoryKey(account.category);
      if (account.type === 'Receivable') {
        receivableNet[key] += signed;
      } else {
        receivedNet[key] += signed;
      }
    }
  }

  if (loanCount === 0) {
    return {
      totalDisbursed: 0,
      receivables: {
        principal: 0,
        interest: 0,
        serviceFee: 0,
        penalty: 0,
        tax: 0,
      },
      collections: {
        principal: 0,
        interest: 0,
        serviceFee: 0,
        penalty: 0,
        tax: 0,
      },
    };
  }

  if (accounts.length === 0) {
    return {
      totalDisbursed,
      receivables: {
        principal: 0,
        interest: 0,
        serviceFee: 0,
        penalty: 0,
        tax: 0,
      },
      collections: {
        principal: 0,
        interest: 0,
        serviceFee: 0,
        penalty: 0,
        tax: 0,
      },
    };
  }

  const clampReceivable = (value: number) => Math.max(0, value);

  // Manual tax transfers post provider-level journal entries (no loanId) that move
  // collected tax from the Tax Receivable holding to a "Tax Destination:" (Received)
  // account. Those postings are excluded from the loan-scoped sums above, so reflect
  // them here: the destination accounts are only ever touched by transfers/reversals,
  // so their balance is the net amount transferred out.
  //   - "Tax Paid"    += amount moved to the real destination account(s)
  //   - "Tax Payable" -= the same amount (gross collected minus what was transferred out)
  const transferredTax = accounts.reduce((sum, a) => {
    const isDestination =
      a.category === 'Tax' &&
      a.type === 'Received' &&
      String(a.name || '').startsWith('Tax Destination:');
    return isDestination ? sum + (a.balance || 0) : sum;
  }, 0);

  return {
    totalDisbursed,
    receivables: {
      principal: receivableNet.principal,
      interest: clampReceivable(receivableNet.interest),
      serviceFee: clampReceivable(receivableNet.servicefee),
      penalty: clampReceivable(receivableNet.penalty),
      tax: clampReceivable(receivableNet.tax - transferredTax),
    },
    collections: {
      principal: receivedNet.principal,
      interest: receivedNet.interest,
      serviceFee: receivedNet.servicefee,
      penalty: receivedNet.penalty,
      tax: receivedNet.tax + transferredTax,
    },
  };
}

export interface OpenLoan {
  id: string;
  productId: string;
  providerId: string;
  dueDate: Date;
  /** What the loan still owes in all. */
  outstanding: number;
  principal: number;
  interest: number;
  serviceFee: number;
  penalty: number;
}

export interface OpenLoanOutstanding {
  /** Loans that still owe something (outstanding > 0.01), in scope. */
  loans: OpenLoan[];
  receivables: {
    principal: number;
    interest: number;
    serviceFee: number;
    penalty: number;
  };
  total: number;
}

function sumOpenLoans(loans: OpenLoan[]): OpenLoanOutstanding {
  const result: OpenLoanOutstanding = {
    loans,
    receivables: { principal: 0, interest: 0, serviceFee: 0, penalty: 0 },
    total: 0,
  };
  for (const loan of loans) {
    result.receivables.principal += loan.principal;
    result.receivables.interest += loan.interest;
    result.receivables.serviceFee += loan.serviceFee;
    result.receivables.penalty += loan.penalty;
    result.total += loan.outstanding;
  }
  return result;
}

/** One provider's share of an all-provider result, without asking the database again. */
export function narrowOpenLoans(open: OpenLoanOutstanding, providerId: string): OpenLoanOutstanding {
  return sumOpenLoans(open.loans.filter((loan) => loan.providerId === providerId));
}

/** The product terms the loan calculator reads. */
const PRODUCT_TERMS = {
  id: true,
  providerId: true,
  duration: true,
  serviceFee: true,
  serviceFeeEnabled: true,
  dailyFee: true,
  dailyFeeEnabled: true,
  penaltyRules: true,
  penaltyRulesEnabled: true,
  penaltyPerInstallment: true,
} as const;

function groupByLoan<T extends { loanId: string }>(rows: T[]): Map<string, T[]> {
  const byLoan = new Map<string, T[]>();
  for (const row of rows) {
    const list = byLoan.get(row.loanId);
    if (list) list.push(row);
    else byLoan.set(row.loanId, [row]);
  }
  return byLoan;
}

/**
 * What open loans still owe, computed per loan exactly as the loans report does
 * (calculateOutstandingBreakdown), so the dashboard and the report agree.
 *
 * Ledger balances cannot give this figure. Interest and penalty accruals are not
 * debited to their Receivable accounts, so those nets run negative (and were
 * clamped to 0), and principal over-credited on settled loans nets against the
 * balance of open ones. A loan flagged Unpaid that has in fact been repaid in
 * full is not counted as open.
 */
export async function getOpenLoanOutstanding(
  prisma: PrismaClient,
  scope: DashboardLoanScope,
  asOf: Date = new Date(),
): Promise<OpenLoanOutstanding> {
  const [taxConfigs, products] = await Promise.all([
    // Same tax set the loans report uses.
    prisma.tax.findMany(),
    // Once per product, not copied into every loan row.
    prisma.loanProduct.findMany({ select: PRODUCT_TERMS }),
  ]);
  const productById = new Map(products.map((p) => [p.id, p]));

  const open: OpenLoan[] = [];
  for (const chunk of scopeChunks(scope.borrowerIds ?? null)) {
    const where: Prisma.LoanWhereInput = {
      repaymentStatus: 'Unpaid',
      ...(scope.providerId ? { product: { providerId: scope.providerId } } : {}),
      ...(chunk ? { borrowerId: { in: chunk } } : {}),
      ...(scope.disbursedRange ? { disbursedDate: scope.disbursedRange } : {}),
    };
    // Three flat reads joined through the loan relation. An `include` would
    // fetch payments and installments with `loanId IN (…)` lists of up to
    // ~2,000 ids per statement: about 3 s for the open book, against 0.2 s.
    const [loans, payments, installments] = await Promise.all([
      prisma.loan.findMany({ where }),
      prisma.payment.findMany({ where: { loan: where }, select: { loanId: true, amount: true, date: true } }),
      prisma.loanInstallment.findMany({ where: { loan: where } }),
    ]);
    const paymentsOf = groupByLoan(payments);
    const installmentsOf = groupByLoan(installments);

    for (const loan of loans) {
      const product = productById.get(loan.productId);
      if (!product) continue;
      const owed = calculateOutstandingBreakdown(
        {
          ...loan,
          payments: paymentsOf.get(loan.id) ?? [],
          installments: installmentsOf.get(loan.id) ?? [],
        } as unknown as Parameters<typeof calculateOutstandingBreakdown>[0],
        product as unknown as Parameters<typeof calculateOutstandingBreakdown>[1],
        taxConfigs as unknown as Parameters<typeof calculateOutstandingBreakdown>[2],
        asOf,
      );
      if (owed.total <= 0.01) continue;
      open.push({
        id: loan.id,
        productId: loan.productId,
        providerId: product.providerId,
        dueDate: loan.dueDate,
        outstanding: owed.total,
        principal: owed.principal,
        interest: owed.interest,
        serviceFee: owed.serviceFee,
        penalty: owed.penalty,
      });
    }
  }
  return sumOpenLoans(open);
}

/**
 * Repayments on these loans split into principal, charges and unapplied cash,
 * restated per loan (see reconcileLoanRepayments) — the figures the Repayments
 * and Collections tabs report. Principal received plus the principal open loans
 * still owe equals what was disbursed.
 *
 * `cache` holds each loan's split for the rest of the request, so a dashboard
 * showing several views of the same loans reconciles each loan once.
 */
export async function sumReconciledCollections(
  prisma: PrismaClient,
  loanIds: string[],
  cache: Map<string, ReconciledAmounts>,
): Promise<ReconciledAmounts> {
  const missing = loanIds.filter((id) => !cache.has(id));
  if (missing.length > 0) {
    const { byLoan } = await reconcileRepaymentsForLoans(prisma, missing);
    for (const id of missing) cache.set(id, byLoan.get(id) ?? zeroAmounts());
  }
  return loanIds.reduce((sum, id) => addAmounts(sum, cache.get(id)!), zeroAmounts());
}

/**
 * Accrued income (Interest / ServiceFee / Penalty) attributable to the loans of
 * a scope, summed from `Income`-type ledger entries — the loan-scoped
 * equivalent of the dashboard's account-balance income card. Used for
 * Branch/District and date-scoped dashboards. No loans in scope gives zeros.
 */
export async function getIncomeForLoanScope(
  prisma: PrismaClient,
  scope: DashboardLoanScope,
): Promise<{ interest: number; serviceFee: number; penalty: number }> {
  const zero = { interest: 0, serviceFee: 0, penalty: 0 };

  const accounts = await prisma.ledgerAccount.findMany({
    where: { type: 'Income', category: { in: ['Interest', 'ServiceFee', 'Penalty'] } },
    select: { id: true, category: true },
  });
  if (accounts.length === 0) return zero;

  const categoryByAccount = new Map(accounts.map((a) => [a.id, a.category]));
  const accountIds = accounts.map((a) => a.id);
  const sums = { interest: 0, serviceFee: 0, penalty: 0 };

  for (const chunk of scopeChunks(scope.borrowerIds ?? null)) {
    const grouped = await prisma.ledgerEntry.groupBy({
      by: ['ledgerAccountId'],
      where: {
        ledgerAccountId: { in: accountIds },
        journalEntry: { loan: { is: liveLoanWhere(scope, chunk) } },
      },
      _sum: { amount: true },
    });
    for (const g of grouped) {
      const category = categoryByAccount.get(g.ledgerAccountId);
      const amount = g._sum.amount || 0;
      if (category === 'Interest') sums.interest += amount;
      else if (category === 'ServiceFee') sums.serviceFee += amount;
      else if (category === 'Penalty') sums.penalty += amount;
    }
  }

  return sums;
}
