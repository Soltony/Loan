import type { Prisma } from '@prisma/client';
import type { calculateTotalRepayable } from '../loan-calculator';

type CalculatorLoan = Parameters<typeof calculateTotalRepayable>[0];
type CalculatorProduct = Parameters<typeof calculateTotalRepayable>[1];

/**
 * A loan row (with its payments and installments) as the loan calculator's
 * input. The calculator's types are the app's own (`@/lib/types`), which
 * predate the Prisma client's, so the two do not line up field for field.
 */
export const asCalculatorLoan = (loan: object) => loan as unknown as CalculatorLoan;

/** A product row (PRODUCT_TERMS at least) as the loan calculator's input. */
export const asCalculatorProduct = (product: object) => product as unknown as CalculatorProduct;

/**
 * The product fields a report row reads: the terms the loan calculator prices
 * a loan with, and what the rows show. A product's icon and salary-advance
 * mappings run to hundreds of KB each (the Salary Advance product carries close
 * to 1 MB), and a nested include copies them into every loan row, which ran to
 * gigabytes for the overdue book. Select these instead of including the product.
 */
export const PRODUCT_TERMS = {
  id: true,
  name: true,
  providerId: true,
  duration: true,
  serviceFee: true,
  serviceFeeEnabled: true,
  dailyFee: true,
  dailyFeeEnabled: true,
  penaltyRules: true,
  penaltyRulesEnabled: true,
  penaltyPerInstallment: true,
  isSalaryAdvance: true,
  installments: true,
  repaymentIntervalDays: true,
} satisfies Prisma.LoanProductSelect;

/** The provider fields the rows show (its icon is left out for the same reason). */
export const PROVIDER_NAME = { select: { id: true, name: true } } satisfies Prisma.LoanProviderDefaultArgs;
