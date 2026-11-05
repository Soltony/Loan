import { differenceInDays, startOfDay } from 'date-fns';
import type { PrismaClient } from '@prisma/client';
import { calculateTotalRepayable } from '../loan-calculator';
import { asCalculatorLoan, asCalculatorProduct, PRODUCT_TERMS, PROVIDER_NAME } from './product';
import { rowsOverScope } from './scope';

/** Aging classes by full days past due. */
export const AGING_CLASSES = [
  { key: 'Pass', label: 'Pass (0-29 Days)', min: 0, max: 29 },
  { key: 'Special Mention', label: 'Special Mention (30-89 Days)', min: 30, max: 89 },
  { key: 'Substandard', label: 'Substandard (90-179 Days)', min: 90, max: 179 },
  { key: 'Doubtful', label: 'Doubtful (180-359 Days)', min: 180, max: 359 },
  { key: 'Loss', label: 'Loss (360+ Days)', min: 360, max: Infinity },
] as const;

export type AgingClass = (typeof AGING_CLASSES)[number]['key'];

export function agingClass(days: number): AgingClass | 'Unknown' {
  return AGING_CLASSES.find((c) => days >= c.min && days <= c.max)?.key ?? 'Unknown';
}

export function agingClassFilter(value: string | null): AgingClass | null {
  return AGING_CLASSES.find((c) => c.key === value)?.key ?? null;
}

const emptyBuckets = (): Record<AgingClass, number> => ({
  Pass: 0,
  'Special Mention': 0,
  Substandard: 0,
  Doubtful: 0,
  Loss: 0,
});

export interface OverdueLoan {
  loanId: string;
  borrowerId: string;
  providerId: string;
  provider: string;
  daysOverdue: number;
  classification: AgingClass | 'Unknown';
  principalOutstanding: number;
  interestOutstanding: number;
  serviceFeeOutstanding: number;
  penaltyOutstanding: number;
  /** The four parts above added up: the amount the aging buckets carry. */
  overdueAmount: number;
}

/** A loan's outstanding parts: repayments settle penalty, then service fee, then interest, then principal. */
export function outstandingParts(
  owed: { principal: number; interest: number; serviceFee: number; penalty: number },
  repaid: number,
) {
  const penaltyPaid = Math.min(repaid, owed.penalty);
  const serviceFeePaid = Math.min(Math.max(0, repaid - owed.penalty), owed.serviceFee);
  const interestPaid = Math.min(Math.max(0, repaid - owed.penalty - owed.serviceFee), owed.interest);
  const principalPaid = Math.max(0, repaid - owed.penalty - owed.serviceFee - owed.interest);
  return {
    principalOutstanding: Math.max(0, owed.principal - principalPaid),
    interestOutstanding: Math.max(0, owed.interest - interestPaid),
    serviceFeeOutstanding: Math.max(0, owed.serviceFee - serviceFeePaid),
    penaltyOutstanding: Math.max(0, owed.penalty - penaltyPaid),
  };
}

/**
 * Unpaid loans past their due date as of the start of today, with what each
 * still owes, from the same calculator the loans and NPL reports use. Loans
 * whose repayments already cover what they owe are left out.
 */
export async function overdueLoans(
  prisma: PrismaClient,
  options: { providerId: string | null; scope: string[] | null; today?: Date },
): Promise<OverdueLoan[]> {
  const today = options.today ?? startOfDay(new Date());
  const [loans, taxConfigs] = await Promise.all([
    rowsOverScope(options.scope, (borrowerIds) =>
      prisma.loan.findMany({
        where: {
          repaymentStatus: 'Unpaid',
          dueDate: { lt: today },
          ...(options.providerId ? { product: { providerId: options.providerId } } : {}),
          ...(borrowerIds ? { borrowerId: { in: borrowerIds } } : {}),
        },
        include: {
          product: { select: { ...PRODUCT_TERMS, provider: PROVIDER_NAME } },
          installments: true,
          payments: { select: { amount: true, date: true } },
        },
      }),
    ),
    prisma.tax.findMany(),
  ]);

  return loans.flatMap((loan): OverdueLoan[] => {
    const owed = calculateTotalRepayable(asCalculatorLoan(loan), asCalculatorProduct(loan.product), taxConfigs, today, true);
    const repaid = loan.repaidAmount ?? 0;
    if (Math.max(0, owed.total - repaid) <= 0.01) return [];
    const parts = outstandingParts(owed, repaid);
    const daysOverdue = differenceInDays(today, loan.dueDate);
    return [
      {
        loanId: loan.id,
        borrowerId: loan.borrowerId,
        providerId: loan.product.providerId,
        provider: loan.product.provider.name,
        daysOverdue,
        classification: agingClass(daysOverdue),
        ...parts,
        overdueAmount:
          parts.principalOutstanding +
          parts.interestOutstanding +
          parts.serviceFeeOutstanding +
          parts.penaltyOutstanding,
      },
    ];
  });
}

export interface AgingSummary {
  /** Overdue loans per class. */
  buckets: Record<AgingClass, number>;
  /** Overdue amount per class. */
  bucketAmounts: Record<AgingClass, number>;
  /** Overdue loans. */
  totalOverdue: number;
  totalOverdueAmount: number;
  borrowerCount: number;
}

/** Loans and amounts per aging class (each loan classed by its own days overdue). */
export function agingSummary(loans: OverdueLoan[]): AgingSummary {
  const buckets = emptyBuckets();
  const bucketAmounts = emptyBuckets();
  let totalOverdueAmount = 0;
  for (const loan of loans) {
    if (loan.classification !== 'Unknown') {
      buckets[loan.classification] += 1;
      bucketAmounts[loan.classification] += loan.overdueAmount;
    }
    totalOverdueAmount += loan.overdueAmount;
  }
  return {
    buckets,
    bucketAmounts,
    totalOverdue: loans.length,
    totalOverdueAmount,
    borrowerCount: new Set(loans.map((l) => `${l.providerId}|${l.borrowerId}`)).size,
  };
}

export interface BorrowerAging {
  providerId: string;
  provider: string;
  borrowerId: string;
  loanCount: number;
  /** Days overdue of the borrower's oldest overdue loan. */
  daysOverdue: number;
  /** The class of that loan: the borrower's classification. */
  classification: AgingClass | 'Unknown';
  /** Overdue amount per class of the borrower's loans. */
  buckets: Record<AgingClass, number>;
  /** The overdue amount in the borrower's classification. */
  classificationAmount: number;
  principalOutstanding: number;
  interestOutstanding: number;
  serviceFeeOutstanding: number;
  penaltyOutstanding: number;
  totalOutstanding: number;
}

/** Overdue loans per borrower (and provider), classed by the borrower's oldest overdue loan. */
export function borrowerAging(loans: OverdueLoan[]): BorrowerAging[] {
  const byBorrower = new Map<string, BorrowerAging>();
  for (const loan of loans) {
    const key = `${loan.providerId}|${loan.borrowerId}`;
    let row = byBorrower.get(key);
    if (!row) {
      row = {
        providerId: loan.providerId,
        provider: loan.provider,
        borrowerId: loan.borrowerId,
        loanCount: 0,
        daysOverdue: loan.daysOverdue,
        classification: loan.classification,
        buckets: emptyBuckets(),
        classificationAmount: 0,
        principalOutstanding: 0,
        interestOutstanding: 0,
        serviceFeeOutstanding: 0,
        penaltyOutstanding: 0,
        totalOutstanding: 0,
      };
      byBorrower.set(key, row);
    }
    row.loanCount += 1;
    row.daysOverdue = Math.max(row.daysOverdue, loan.daysOverdue);
    if (loan.classification !== 'Unknown') row.buckets[loan.classification] += loan.overdueAmount;
    row.principalOutstanding += loan.principalOutstanding;
    row.interestOutstanding += loan.interestOutstanding;
    row.serviceFeeOutstanding += loan.serviceFeeOutstanding;
    row.penaltyOutstanding += loan.penaltyOutstanding;
    row.totalOutstanding += loan.overdueAmount;
  }
  for (const row of byBorrower.values()) {
    row.classification = agingClass(row.daysOverdue);
    row.classificationAmount = row.classification === 'Unknown' ? 0 : row.buckets[row.classification];
  }
  return [...byBorrower.values()];
}
