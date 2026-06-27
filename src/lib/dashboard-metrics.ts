import type { PrismaClient } from '@prisma/client';

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
  const activeLoans = await prisma.loan.findMany({
    where: {
      repaymentStatus: { not: 'REVERSED' },
      ...(providerId ? { product: { providerId } } : {}),
      ...(borrowerIds ? { borrowerId: { in: borrowerIds } } : {}),
    },
    select: { id: true, loanAmount: true },
  });

  const loanIds = activeLoans.map((l) => l.id);
  const totalDisbursed = activeLoans.reduce((sum, l) => sum + l.loanAmount, 0);

  const receivableNet = emptyCategoryAmounts();
  const receivedNet = emptyCategoryAmounts();

  if (loanIds.length === 0) {
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

  const accounts = await prisma.ledgerAccount.findMany({
    where: {
      category: { in: [...CATEGORIES] },
      type: { in: ['Receivable', 'Received'] },
      ...(providerId ? { providerId } : {}),
    },
    select: { id: true, type: true, category: true, name: true, balance: true },
  });

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

  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const accountIds = accounts.map((a) => a.id);

  // SQL Server caps ~2100 parameters per query; batch loan IDs.
  const LOAN_ID_BATCH = 500;
  const entries: { amount: number; type: string; ledgerAccountId: string }[] = [];
  for (let i = 0; i < loanIds.length; i += LOAN_ID_BATCH) {
    const batch = loanIds.slice(i, i + LOAN_ID_BATCH);
    const batchEntries = await prisma.ledgerEntry.findMany({
      where: {
        ledgerAccountId: { in: accountIds },
        journalEntry: { loanId: { in: batch } },
      },
      select: { amount: true, type: true, ledgerAccountId: true },
    });
    entries.push(...batchEntries);
  }

  for (const entry of entries) {
    const account = accountById.get(entry.ledgerAccountId);
    if (!account) continue;
    const signed = entry.type === 'Debit' ? entry.amount : -entry.amount;
    const key = categoryKey(account.category);
    if (account.type === 'Receivable') {
      receivableNet[key] += signed;
    } else {
      receivedNet[key] += signed;
    }
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

/**
 * Accrued income (Interest / ServiceFee / Penalty) attributable to a set of
 * loans, summed from `Income`-type ledger entries — the loan-scoped equivalent
 * of the dashboard's account-balance income card. Used for Branch/District
 * dashboards. Empty `loanIds` returns zeros.
 */
export async function getIncomeForLoanIds(
  prisma: PrismaClient,
  loanIds: string[],
): Promise<{ interest: number; serviceFee: number; penalty: number }> {
  const zero = { interest: 0, serviceFee: 0, penalty: 0 };
  if (loanIds.length === 0) return zero;

  const accounts = await prisma.ledgerAccount.findMany({
    where: { type: 'Income', category: { in: ['Interest', 'ServiceFee', 'Penalty'] } },
    select: { id: true, category: true },
  });
  if (accounts.length === 0) return zero;

  const categoryByAccount = new Map(accounts.map((a) => [a.id, a.category]));
  const accountIds = accounts.map((a) => a.id);
  const sums = { interest: 0, serviceFee: 0, penalty: 0 };

  const LOAN_ID_BATCH = 500;
  for (let i = 0; i < loanIds.length; i += LOAN_ID_BATCH) {
    const batch = loanIds.slice(i, i + LOAN_ID_BATCH);
    const grouped = await prisma.ledgerEntry.groupBy({
      by: ['ledgerAccountId'],
      where: {
        ledgerAccountId: { in: accountIds },
        journalEntry: { loanId: { in: batch } },
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
