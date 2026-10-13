/**
 * Manual Digital Loan Repayment — shared domain rules.
 *
 * A manual repayment is money the customer already handed over at a branch (cash,
 * transfer, cheque, another channel). The Maker keys it in, a Checker approves it,
 * and only the approval posts it against the loan. Nothing here writes to a loan;
 * see `manual-repayment-posting.ts` for the posting and reversal engines.
 */

import type { Prisma } from '@prisma/client';
import { calculateOutstandingBreakdown } from './loan-calculator';
import { roundCurrency } from './interest-accrual';

// --------------------------------------
// Vocabulary
// --------------------------------------

export const PAYMENT_SOURCES = ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'OTHER_CHANNEL'] as const;
export type PaymentSource = (typeof PAYMENT_SOURCES)[number];

export const PAYMENT_SOURCE_LABELS: Record<PaymentSource, string> = {
  CASH: 'Cash',
  BANK_TRANSFER: 'Bank Transfer',
  CHEQUE: 'Cheque',
  OTHER_CHANNEL: 'Other Channel',
};

export const MANUAL_REPAYMENT_STATUSES = [
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'PENDING_REVERSAL',
  'REVERSED',
] as const;
export type ManualRepaymentStatus = (typeof MANUAL_REPAYMENT_STATUSES)[number];

export const MANUAL_REPAYMENT_STATUS_LABELS: Record<ManualRepaymentStatus, string> = {
  PENDING_APPROVAL: 'Pending Approval',
  APPROVED: 'Posted',
  REJECTED: 'Rejected',
  PENDING_REVERSAL: 'Reversal Pending',
  REVERSED: 'Reversed',
};

/** The buckets a repayment settles, in the order the rest of the portal derives them. */
export const ALLOCATION_BUCKETS = ['PENALTY', 'SERVICE_FEE', 'INTEREST', 'TAX', 'PRINCIPAL'] as const;
export type AllocationBucket = (typeof ALLOCATION_BUCKETS)[number];

export const BUCKET_LABELS: Record<AllocationBucket, string> = {
  PENALTY: 'Penalty',
  SERVICE_FEE: 'Service Fee',
  INTEREST: 'Interest',
  TAX: 'Tax',
  PRINCIPAL: 'Principal',
};

/**
 * The order `calculateOutstandingBreakdown` splits `loan.repaidAmount` into buckets.
 * Every screen in the portal derives its outstanding from that split, so this is the
 * order a manual repayment allocates by default — a configured order that differs
 * changes the GL split only, not the balance the portal shows.
 */
export const DEFAULT_ALLOCATION_ORDER: AllocationBucket[] = [
  'PENALTY',
  'SERVICE_FEE',
  'INTEREST',
  'TAX',
  'PRINCIPAL',
];

export const OVERPAYMENT_POLICIES = ['REJECT', 'WARN'] as const;
export type OverpaymentPolicy = (typeof OVERPAYMENT_POLICIES)[number];

/** Attachments are stored base64 on the row; keep them small enough for NVARCHAR(MAX). */
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const ALLOWED_ATTACHMENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

/** Repayments are not accepted against a loan in these states (BRD 3.5). */
export const CLOSED_LOAN_STATUSES = ['Paid', 'PAID', 'Closed', 'CLOSED', 'Reversed', 'REVERSED'];

// --------------------------------------
// Configuration (BRD 3.5 / 3.6 / 3.7)
// --------------------------------------

export interface ManualRepaymentPolicy {
  allocationOrder: AllocationBucket[];
  /** Repayments above this amount are refused at entry; null means no ceiling. */
  makerApprovalLimit: number | null;
  overpaymentPolicy: OverpaymentPolicy;
  requireAttachment: boolean;
  notifyCustomer: boolean;
}

export const DEFAULT_POLICY: ManualRepaymentPolicy = {
  allocationOrder: DEFAULT_ALLOCATION_ORDER,
  makerApprovalLimit: null,
  overpaymentPolicy: 'REJECT',
  requireAttachment: false,
  notifyCustomer: true,
};

/**
 * A stored allocation order is only honoured when it is a permutation of every
 * bucket — a partial order would silently drop a bucket's money on the floor.
 */
export function parseAllocationOrder(raw: unknown): AllocationBucket[] {
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return DEFAULT_ALLOCATION_ORDER;
    }
  }
  if (!Array.isArray(parsed)) return DEFAULT_ALLOCATION_ORDER;

  const order = parsed.map((b) => String(b).toUpperCase()) as AllocationBucket[];
  const isPermutation =
    order.length === ALLOCATION_BUCKETS.length &&
    new Set(order).size === ALLOCATION_BUCKETS.length &&
    order.every((b) => (ALLOCATION_BUCKETS as readonly string[]).includes(b));

  return isPermutation ? order : DEFAULT_ALLOCATION_ORDER;
}

type ConfigRow = {
  allocationOrder: string;
  makerApprovalLimit: number | null;
  overpaymentPolicy: string;
  requireAttachment: boolean;
  notifyCustomer: boolean;
} | null;

export function toPolicy(row: ConfigRow): ManualRepaymentPolicy {
  if (!row) return DEFAULT_POLICY;
  const limit = Number(row.makerApprovalLimit);
  return {
    allocationOrder: parseAllocationOrder(row.allocationOrder),
    makerApprovalLimit: Number.isFinite(limit) && limit > 0 ? limit : null,
    overpaymentPolicy: (OVERPAYMENT_POLICIES as readonly string[]).includes(row.overpaymentPolicy)
      ? (row.overpaymentPolicy as OverpaymentPolicy)
      : 'REJECT',
    requireAttachment: !!row.requireAttachment,
    notifyCustomer: !!row.notifyCustomer,
  };
}

/** Reads the single-row policy, falling back to defaults when it has not been set up. */
export async function getManualRepaymentPolicy(
  db: Pick<Prisma.TransactionClient, 'manualRepaymentConfig'>,
): Promise<ManualRepaymentPolicy> {
  const row = await db.manualRepaymentConfig.findUnique({ where: { id: 'global' } });
  return toPolicy(row as ConfigRow);
}

// --------------------------------------
// Reference numbers (BRD 3.5)
// --------------------------------------

/**
 * The unique key behind "a reference number is unique within each payment source".
 *
 * Live rows (pending, posted, awaiting reversal) key on source + reference, so a
 * second entry of the same slip collides at the database. A rejected or reversed
 * row is re-keyed with its own id appended: the money never reached the loan, and
 * the branch must be able to re-submit the same genuine bank reference.
 */
export function activeReferenceKey(paymentSource: string, referenceNumber: string) {
  return `${paymentSource.toUpperCase()}|${normalizeReference(referenceNumber)}`;
}

export function retiredReferenceKey(paymentSource: string, referenceNumber: string, id: string) {
  return `${activeReferenceKey(paymentSource, referenceNumber)}|${id}`;
}

/** References are compared case- and whitespace-insensitively; "ft 123" is "FT123". */
export function normalizeReference(input: string | null | undefined) {
  return String(input ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

export function isValidPaymentSource(value: unknown): value is PaymentSource {
  return (PAYMENT_SOURCES as readonly string[]).includes(String(value));
}

// --------------------------------------
// Outstanding balance (BRD 3.3)
// --------------------------------------

export interface LoanBalanceSnapshot {
  principal: number;
  interest: number;
  serviceFee: number;
  penalty: number;
  tax: number;
  total: number;
}

/**
 * What the loan still owes, split the way every other screen splits it. Used both
 * to show the Maker a balance and to re-check the amount at approval time — the
 * balance moves between entry and approval whenever interest or a penalty accrues.
 */
export function loanBalanceSnapshot(
  loan: unknown,
  product: unknown,
  taxConfigs: unknown,
  asOfDate: Date,
): LoanBalanceSnapshot {
  const breakdown = calculateOutstandingBreakdown(
    loan as never,
    product as never,
    taxConfigs as never,
    asOfDate,
  );
  return {
    principal: breakdown.principal,
    interest: breakdown.interest,
    serviceFee: breakdown.serviceFee,
    penalty: breakdown.penalty,
    tax: breakdown.tax,
    total: breakdown.total,
  };
}

// --------------------------------------
// Entry validation (BRD 3.5)
// --------------------------------------

export interface RepaymentEntryInput {
  amount: number;
  paymentSource: string;
  referenceNumber: string;
  paymentDate: Date;
  hasAttachment: boolean;
}

export interface ValidationContext {
  policy: ManualRepaymentPolicy;
  outstanding: number;
  loanRepaymentStatus: string;
  loanDisbursedDate: Date;
  /** Start of the day the entry is being made; a payment cannot be dated after it. */
  today: Date;
}

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

/** Floating-point slack, in birr, used wherever an amount is compared to a balance. */
const TOLERANCE = 0.01;

export function validateRepaymentEntry(
  input: RepaymentEntryInput,
  context: ValidationContext,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { policy, outstanding } = context;

  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    errors.push('Repayment amount must be greater than zero.');
  }

  if (!isValidPaymentSource(input.paymentSource)) {
    errors.push('Select a valid payment source.');
  }

  if (!normalizeReference(input.referenceNumber)) {
    errors.push('A transaction / reference number is required.');
  }

  if (CLOSED_LOAN_STATUSES.includes(context.loanRepaymentStatus)) {
    errors.push('This loan is already closed and cannot accept further repayments.');
  } else if (outstanding <= TOLERANCE) {
    errors.push('This loan has no outstanding balance.');
  }

  if (!(input.paymentDate instanceof Date) || Number.isNaN(input.paymentDate.getTime())) {
    errors.push('Enter a valid payment date.');
  } else {
    if (input.paymentDate.getTime() > context.today.getTime()) {
      errors.push('The payment date cannot be in the future.');
    }
    if (input.paymentDate.getTime() < new Date(context.loanDisbursedDate).setHours(0, 0, 0, 0)) {
      errors.push('The payment date cannot be before the loan was disbursed.');
    }
  }

  if (Number.isFinite(input.amount) && input.amount > outstanding + TOLERANCE) {
    const message =
      `The amount (${formatBirr(input.amount)}) is more than the outstanding balance ` +
      `(${formatBirr(outstanding)}).`;
    if (policy.overpaymentPolicy === 'REJECT') {
      errors.push(message);
    } else {
      warnings.push(`${message} It will be posted up to the balance and the rest left unapplied.`);
    }
  }

  if (
    policy.makerApprovalLimit != null &&
    Number.isFinite(input.amount) &&
    input.amount > policy.makerApprovalLimit + TOLERANCE
  ) {
    errors.push(
      `The amount exceeds your approval limit of ${formatBirr(policy.makerApprovalLimit)}. ` +
        'Split the repayment or escalate it.',
    );
  }

  if (policy.requireAttachment && !input.hasAttachment) {
    errors.push('A receipt or bank slip must be attached.');
  }

  return { errors, warnings };
}

export function formatBirr(amount: number) {
  return `${roundCurrency(Number(amount) || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ETB`;
}

/** Status a loan lands in once a repayment settles (BRD 3.7). */
export function repaymentStatusLabel(outstandingAfter: number, repaidAnything: boolean) {
  if (outstandingAfter <= TOLERANCE) return 'Fully Paid';
  return repaidAnything ? 'Partially Paid' : 'Unpaid';
}

export { TOLERANCE as MANUAL_REPAYMENT_TOLERANCE };
