import { beforeEach, describe, expect, test, vi } from 'vitest';

// The rollover is exercised by its own suite; here it must not touch the fake client.
vi.mock('./installment-rollover', () => ({
  ensureInstallmentRollover: vi.fn(async () => ({
    updated: false,
    mergedCount: 0,
    activeInstallmentId: null,
  })),
}));

import { postManualRepayment, reverseManualRepaymentPosting } from './manual-repayment-posting';
import type { AllocationBucket } from './manual-repayment';

/**
 * A loan that owes 1,000 principal + 100 service fee + 50 penalty = 1,150, with no
 * interest and no tax so each bucket is a round number and the waterfall is legible.
 */
const DISBURSED = new Date(2026, 0, 1);
const DUE = new Date(2026, 1, 1);
const PAYMENT_DATE = new Date(2026, 2, 1);

const PRODUCT = {
  id: 'prod1',
  name: 'Branch Loan',
  duration: 31,
  serviceFeeEnabled: true,
  serviceFee: JSON.stringify({ type: 'fixed', value: 100 }),
  dailyFeeEnabled: false,
  dailyFee: null,
  penaltyRulesEnabled: true,
  penaltyPerInstallment: false,
  penaltyRules: JSON.stringify([
    { id: 'p1', fromDay: 1, toDay: null, type: 'fixed', value: 50, frequency: 'one-time' },
  ]),
  provider: {
    id: 'prov1',
    name: 'Nib',
    ledgerAccounts: ledgerAccounts(),
  },
};

function ledgerAccounts() {
  const categories = ['Principal', 'Interest', 'Penalty', 'ServiceFee', 'Tax'];
  const types = ['Receivable', 'Received', 'Income'];
  return categories.flatMap((category) =>
    types.map((type) => ({ id: `${category}:${type}`, category, type, balance: 0 })),
  );
}

type State = ReturnType<typeof freshState>;

function freshState(options?: { installments?: boolean; repaidAmount?: number }) {
  const installments = options?.installments
    ? [
        {
          id: 'inst1',
          loanId: 'loan1',
          installmentNumber: 1,
          amount: 500,
          paidAmount: 0,
          dueDate: DUE,
          status: 'PENDING',
          isActive: true,
          penaltyAmount: 0,
        },
        {
          id: 'inst2',
          loanId: 'loan1',
          installmentNumber: 2,
          amount: 500,
          paidAmount: 0,
          dueDate: new Date(2026, 2, 1),
          status: 'PENDING',
          isActive: false,
          penaltyAmount: 0,
        },
      ]
    : [];

  return {
    loan: {
      id: 'loan1',
      borrowerId: '0912345678',
      loanAmount: 1_000,
      serviceFee: 100,
      penaltyAmount: 0,
      taxDeducted: 0,
      disbursedDate: DISBURSED,
      dueDate: DUE,
      repaymentStatus: 'Unpaid',
      repaymentBehavior: null as string | null,
      repaidAmount: options?.repaidAmount ?? 0,
      product: PRODUCT,
      installments,
      payments: [] as { id: string; amount: number; date: Date }[],
    },
    accounts: new Map(PRODUCT.provider.ledgerAccounts.map((a) => [a.id, { ...a }])),
    journalEntries: [] as { id: string; description: string }[],
    ledgerEntries: [] as { ledgerAccountId: string; type: string; amount: number }[],
    payments: [] as { id: string; loanId: string; amount: number; installmentId?: string }[],
    installments,
  };
}

/** Enough of a Prisma transaction client for the posting engine to run against. */
function fakeTx(state: State) {
  let sequence = 0;
  const nextId = (prefix: string) => `${prefix}${++sequence}`;

  const applyNumeric = (current: number, instruction: unknown) => {
    if (instruction && typeof instruction === 'object') {
      const op = instruction as { increment?: number; decrement?: number; set?: number };
      if (op.increment !== undefined) return current + op.increment;
      if (op.decrement !== undefined) return current - op.decrement;
      if (op.set !== undefined) return op.set;
    }
    return instruction as number;
  };

  const matches = (row: Record<string, unknown>, where: Record<string, unknown>) =>
    Object.entries(where).every(([key, condition]) => {
      if (condition && typeof condition === 'object') {
        const c = condition as { in?: unknown[]; notIn?: unknown[]; gt?: number; not?: unknown };
        if (c.in) return c.in.includes(row[key]);
        if (c.notIn) return !c.notIn.includes(row[key]);
        if (c.gt !== undefined) return Number(row[key]) > c.gt;
        if (c.not !== undefined) return row[key] !== c.not;
      }
      return row[key] === condition;
    });

  return {
    loan: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === state.loan.id ? state.loan : null,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        if (where.id !== state.loan.id) throw new Error('unknown loan');
        for (const [key, value] of Object.entries(data)) {
          (state.loan as Record<string, unknown>)[key] =
            typeof (state.loan as Record<string, unknown>)[key] === 'number'
              ? applyNumeric(Number((state.loan as Record<string, unknown>)[key]), value)
              : value;
        }
        return state.loan;
      },
    },
    tax: { findMany: async () => [] },
    journalEntry: {
      create: async ({ data }: { data: { description: string } }) => {
        const entry = { id: nextId('je'), ...data };
        state.journalEntries.push(entry);
        return entry;
      },
      findUnique: async ({ where }: { where: { id: string } }) => {
        const je = state.journalEntries.find((j) => j.id === where.id);
        return je
          ? { ...je, entries: state.ledgerEntries.filter(() => true) }
          : null;
      },
    },
    ledgerAccount: {
      update: async ({ where, data }: { where: { id: string }; data: { balance: unknown } }) => {
        const account = state.accounts.get(where.id);
        if (!account) throw new Error(`unknown ledger account ${where.id}`);
        account.balance = applyNumeric(account.balance, data.balance);
        return account;
      },
    },
    ledgerEntry: {
      create: async ({ data }: { data: { ledgerAccountId: string; type: string; amount: number } }) => {
        state.ledgerEntries.push(data);
        return data;
      },
      createMany: async ({ data }: { data: { ledgerAccountId: string; type: string; amount: number }[] }) => {
        state.ledgerEntries.push(...data);
        return { count: data.length };
      },
    },
    loanInstallment: {
      findMany: async ({ orderBy }: { orderBy?: { installmentNumber?: 'asc' | 'desc' } }) => {
        const rows = [...state.installments];
        if (orderBy?.installmentNumber === 'desc') rows.reverse();
        return rows;
      },
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        state.installments.find((i) => matches(i as never, where)) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = state.installments.find((i) => i.id === where.id);
        if (!row) throw new Error(`unknown installment ${where.id}`);
        Object.assign(row, data);
        return row;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        const rows = state.installments.filter((i) => matches(i as never, where));
        rows.forEach((row) => Object.assign(row, data));
        return { count: rows.length };
      },
    },
    payment: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const payment = { id: nextId('pay'), ...data } as never;
        state.payments.push(payment);
        return payment;
      },
      deleteMany: async ({ where }: { where: { id: string } }) => {
        const before = state.payments.length;
        state.payments = state.payments.filter((p) => p.id !== where.id);
        return { count: before - state.payments.length };
      },
    },
  } as never;
}

const ledgerBalances = (state: State) => {
  const debits = state.ledgerEntries
    .filter((e) => e.type === 'Debit')
    .reduce((sum, e) => sum + e.amount, 0);
  const credits = state.ledgerEntries
    .filter((e) => e.type === 'Credit')
    .reduce((sum, e) => sum + e.amount, 0);
  return { debits, credits };
};

describe('postManualRepayment', () => {
  let state: State;

  beforeEach(() => {
    state = freshState();
  });

  test('settles penalty, then service fee, then principal in the default order', async () => {
    const result = await postManualRepayment(fakeTx(state), {
      loanId: 'loan1',
      amount: 200,
      paymentDate: PAYMENT_DATE,
      description: 'test',
    });

    expect(result.balanceBefore.total).toBe(1_150);
    expect(result.allocation).toEqual({
      PENALTY: 50,
      SERVICE_FEE: 100,
      INTEREST: 0,
      TAX: 0,
      PRINCIPAL: 50,
    });
    expect(result.applied).toBe(200);
    expect(result.unapplied).toBe(0);
    expect(result.balanceAfter).toBe(950);
    expect(state.loan.repaidAmount).toBe(200);
    expect(state.loan.repaymentStatus).toBe('Unpaid');
  });

  test('honours a configured allocation order (BRD 3.7)', async () => {
    const order: AllocationBucket[] = ['PRINCIPAL', 'INTEREST', 'TAX', 'SERVICE_FEE', 'PENALTY'];
    const result = await postManualRepayment(fakeTx(state), {
      loanId: 'loan1',
      amount: 200,
      paymentDate: PAYMENT_DATE,
      allocationOrder: order,
      description: 'test',
    });

    expect(result.allocation.PRINCIPAL).toBe(200);
    expect(result.allocation.PENALTY).toBe(0);
    expect(result.allocation.SERVICE_FEE).toBe(0);
  });

  test('falls back to the default order when the configured one is incomplete', async () => {
    const result = await postManualRepayment(fakeTx(state), {
      loanId: 'loan1',
      amount: 200,
      paymentDate: PAYMENT_DATE,
      allocationOrder: ['PRINCIPAL'] as AllocationBucket[],
      description: 'test',
    });

    expect(result.allocation.PENALTY).toBe(50);
    expect(result.allocation.PRINCIPAL).toBe(50);
  });

  test('a full settlement closes the loan and records the repayment behaviour', async () => {
    const result = await postManualRepayment(fakeTx(state), {
      loanId: 'loan1',
      amount: 1_150,
      paymentDate: PAYMENT_DATE,
      description: 'test',
    });

    expect(result.fullyPaid).toBe(true);
    expect(result.balanceAfter).toBe(0);
    expect(state.loan.repaymentStatus).toBe('Paid');
    // Paid after the due date.
    expect(state.loan.repaymentBehavior).toBe('LATE');
  });

  test('caps an overpayment at the balance and reports the excess rather than crediting it', async () => {
    const result = await postManualRepayment(fakeTx(state), {
      loanId: 'loan1',
      amount: 1_500,
      paymentDate: PAYMENT_DATE,
      description: 'test',
    });

    expect(result.applied).toBe(1_150);
    expect(result.unapplied).toBe(350);
    // The excess must never inflate repaidAmount — that is what turns into a
    // phantom credit the reports cannot explain.
    expect(state.loan.repaidAmount).toBe(1_150);
  });

  test('every posting is a balanced journal', async () => {
    await postManualRepayment(fakeTx(state), {
      loanId: 'loan1',
      amount: 400,
      paymentDate: PAYMENT_DATE,
      description: 'test',
    });

    const { debits, credits } = ledgerBalances(state);
    // Receivable credit + Received debit for every bucket, plus an Income credit
    // for penalty and service fee, which is how the Super App callback books them.
    expect(debits).toBe(400);
    expect(credits).toBe(400 + 50 + 100);
  });

  test('a repayment against a settled loan is refused rather than posted', async () => {
    const settled = freshState({ repaidAmount: 1_150 });
    await expect(
      postManualRepayment(fakeTx(settled), {
        loanId: 'loan1',
        amount: 100,
        paymentDate: PAYMENT_DATE,
        description: 'test',
      }),
    ).rejects.toThrow(/no outstanding balance/);
  });

  test('a non-positive amount never reaches the ledger', async () => {
    await expect(
      postManualRepayment(fakeTx(state), {
        loanId: 'loan1',
        amount: 0,
        paymentDate: PAYMENT_DATE,
        description: 'test',
      }),
    ).rejects.toThrow(/greater than zero/);
    expect(state.journalEntries).toHaveLength(0);
  });
});

describe('postManualRepayment with an installment schedule', () => {
  test('cascades across installments instead of stopping at the active one', async () => {
    const state = freshState({ installments: true });

    // 1,150 settles the whole loan, which must close both installments — the bug
    // this guards against closed only the active one and left the loan looking open.
    const result = await postManualRepayment(fakeTx(state), {
      loanId: 'loan1',
      amount: 1_150,
      paymentDate: PAYMENT_DATE,
      description: 'test',
    });

    expect(result.fullyPaid).toBe(true);
    expect(state.installments.every((i) => i.status === 'PAID')).toBe(true);
    expect(state.installments.every((i) => i.isActive === false)).toBe(true);
    expect(state.payments[0]?.installmentId).toBe('inst1');
  });

  test('a part payment leaves exactly one installment active', async () => {
    const state = freshState({ installments: true });

    await postManualRepayment(fakeTx(state), {
      loanId: 'loan1',
      amount: 200,
      paymentDate: PAYMENT_DATE,
      description: 'test',
    });

    expect(state.installments.filter((i) => i.isActive)).toHaveLength(1);
    expect(state.installments[0].isActive).toBe(true);
    // Only penalty + principal land on the installment; the service fee is loan level.
    expect(state.installments[0].paidAmount).toBe(100);
  });

  test('a payment that exactly fills one installment hands the active flag to the next', async () => {
    const state = freshState({ installments: true });

    // Installment 1 holds 500 principal + 50 penalty; 650 settles it exactly once
    // the 100 service fee is taken off the top, leaving nothing for installment 2.
    await postManualRepayment(fakeTx(state), {
      loanId: 'loan1',
      amount: 650,
      paymentDate: PAYMENT_DATE,
      description: 'test',
    });

    expect(state.installments[0].status).toBe('PAID');
    expect(state.installments[0].isActive).toBe(false);
    expect(state.installments[1].isActive).toBe(true);
    expect(state.installments.filter((i) => i.isActive)).toHaveLength(1);
  });
});

describe('reverseManualRepaymentPosting', () => {
  test('winds the loan back and mirrors the original journal', async () => {
    const state = freshState();
    const tx = fakeTx(state);

    const posted = await postManualRepayment(tx, {
      loanId: 'loan1',
      amount: 400,
      paymentDate: PAYMENT_DATE,
      description: 'test',
    });
    expect(state.loan.repaidAmount).toBe(400);

    const before = ledgerBalances(state);
    await reverseManualRepaymentPosting(tx, {
      loanId: 'loan1',
      paymentId: posted.paymentId,
      journalEntryId: posted.journalEntryId,
      appliedAmount: posted.applied,
      installmentAmount: posted.allocation.PENALTY + posted.allocation.PRINCIPAL,
      reason: 'keyed against the wrong loan',
      reversedBy: 'user1',
    });

    expect(state.loan.repaidAmount).toBe(0);
    expect(state.loan.repaymentStatus).toBe('Unpaid');
    expect(state.payments).toHaveLength(0);

    // Each original entry is mirrored, so debits and credits now net out.
    const after = ledgerBalances(state);
    expect(after.debits - before.debits).toBe(before.credits);
    expect(after.credits - before.credits).toBe(before.debits);
  });

  test('a capped overpayment winds back only what was booked', async () => {
    const state = freshState();
    const tx = fakeTx(state);

    // 1,500 recorded against a 1,150 balance: 350 was never posted, so reversing
    // the recorded figure would push repaidAmount below zero and take other
    // repayments' money with it.
    const posted = await postManualRepayment(tx, {
      loanId: 'loan1',
      amount: 1_500,
      paymentDate: PAYMENT_DATE,
      description: 'test',
    });
    expect(posted.applied).toBe(1_150);

    await reverseManualRepaymentPosting(tx, {
      loanId: 'loan1',
      paymentId: posted.paymentId,
      journalEntryId: posted.journalEntryId,
      appliedAmount: posted.applied,
      installmentAmount: posted.allocation.PENALTY + posted.allocation.PRINCIPAL,
      reason: 'duplicate deposit',
      reversedBy: 'user1',
    });

    expect(state.loan.repaidAmount).toBe(0);
  });

  test('only the penalty and principal share comes back off the schedule', async () => {
    const state = freshState({ installments: true });
    const tx = fakeTx(state);

    const posted = await postManualRepayment(tx, {
      loanId: 'loan1',
      amount: 300,
      paymentDate: PAYMENT_DATE,
      description: 'test',
    });
    // 50 penalty + 100 service fee + 150 principal; the schedule saw 200 of it.
    expect(state.installments[0].paidAmount).toBe(200);

    await reverseManualRepaymentPosting(tx, {
      loanId: 'loan1',
      paymentId: posted.paymentId,
      journalEntryId: posted.journalEntryId,
      appliedAmount: posted.applied,
      installmentAmount: posted.allocation.PENALTY + posted.allocation.PRINCIPAL,
      reason: 'wrong customer',
      reversedBy: 'user1',
    });

    expect(state.installments[0].paidAmount).toBe(0);
    expect(state.installments[0].isActive).toBe(true);
    expect(state.loan.repaidAmount).toBe(0);
  });
});
