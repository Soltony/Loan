import { differenceInDays, startOfDay } from "date-fns";
import type { LoanDetails, LoanProduct, PenaltyRule, Tax } from "./types";
import {
  calculateInterestWithPayments,
  calculateInterestWithPaymentsDetailed,
  normalizePayments,
  roundCurrency,
} from "./interest-accrual";
import { calculateInstallmentPenalty } from "./installment-penalty";

interface CalculatedRepayment {
  total: number;
  principal: number;
  interest: number;
  penalty: number;
  serviceFee: number;
  tax: number;
}

export interface CalculatedRepaymentDetailed extends CalculatedRepayment {
  interestPaid: number;
  serviceFeePaid: number;
  principalPaidFromInterestCalc: number;
}

export interface InstallmentPaidSplit {
  /** Penalty currently accrued for the installment (given its outstanding principal). */
  penaltyAccrued: number;
  /** Portion of installment.paidAmount that settled penalty. */
  penaltyPaid: number;
  /** Penalty still owed for the installment. */
  penaltyRemaining: number;
  /** Portion of installment.paidAmount that settled principal. */
  principalPaid: number;
  /** Principal still owed for the installment. */
  principalRemaining: number;
}

/**
 * Splits an installment's `paidAmount` into the penalty and principal it settled.
 *
 * `installment.paidAmount` is stored as penalty + principal combined, and payments
 * settle PENALTY first then principal. The penalty itself depends on the remaining
 * principal, so this is a small fixed-point.
 *
 * IMPORTANT: we converge from "no principal paid yet" (full principal outstanding =
 * maximum penalty exposure) downward. Converging from the opposite end
 * (`principalPaid = min(amount, paidAmount)`) has a degenerate root: as soon as
 * `paidAmount >= amount` it concludes `principalOutstanding = 0` -> penalty 0, even
 * when part of `paidAmount` actually went to penalty. That degenerate root is the
 * cause of overdue loans mis-reporting unpaid principal as 0.
 */
export const splitInstallmentPaidAmount = (params: {
  installmentAmount: number;
  installmentPaidAmount: number;
  penaltyRules: PenaltyRule[];
  penaltyDueDate: Date;
  asOfDate: Date;
}): InstallmentPaidSplit => {
  const { penaltyRules, penaltyDueDate, asOfDate } = params;
  const amount = Math.max(0, Number(params.installmentAmount) || 0);
  const paid = Math.max(0, Number(params.installmentPaidAmount) || 0);

  let principalOutstanding = amount;
  let penalty = 0;
  // A handful of iterations is more than enough for the penalty<->principal coupling
  // to converge; the loop is bounded so it can never spin.
  for (let i = 0; i < 6; i++) {
    penalty = calculateInstallmentPenalty({
      dueDate: penaltyDueDate,
      principalOutstanding,
      penaltyRules,
      asOfDate,
    });
    const penaltyPaid = Math.min(paid, penalty);
    const principalPaid = Math.min(amount, Math.max(0, paid - penaltyPaid));
    const nextOutstanding = Math.max(0, amount - principalPaid);
    if (nextOutstanding === principalOutstanding) break;
    principalOutstanding = nextOutstanding;
  }

  penalty = calculateInstallmentPenalty({
    dueDate: penaltyDueDate,
    principalOutstanding,
    penaltyRules,
    asOfDate,
  });
  const penaltyPaid = Math.min(paid, penalty);
  const principalPaid = Math.min(amount, Math.max(0, paid - penaltyPaid));

  return {
    penaltyAccrued: roundCurrency(penalty),
    penaltyPaid: roundCurrency(penaltyPaid),
    penaltyRemaining: roundCurrency(Math.max(0, penalty - penaltyPaid)),
    principalPaid: roundCurrency(principalPaid),
    principalRemaining: roundCurrency(Math.max(0, amount - principalPaid)),
  };
};

/**
 * Calculate the inclusive tax that should be deducted upfront from the loan principal.
 * Only tax configs marked as `isInclusive` are considered.
 * The tax is computed as a percentage of the gross loan amount.
 *
 * @returns An object with `taxAmount` (total inclusive tax) and `netDisbursedAmount` (amount after deduction).
 */
export const calculateInclusiveTax = (
  grossLoanAmount: number,
  taxConfigs: Tax[],
): { taxAmount: number; netDisbursedAmount: number } => {
  let totalInclusiveTaxRate = 0;

  for (const taxConfig of taxConfigs) {
    if (taxConfig.isInclusive && taxConfig.rate > 0) {
      totalInclusiveTaxRate += taxConfig.rate;
    }
  }

  if (totalInclusiveTaxRate <= 0) {
    return { taxAmount: 0, netDisbursedAmount: grossLoanAmount };
  }

  const taxAmount = roundCurrency(
    grossLoanAmount * (totalInclusiveTaxRate / 100),
  );
  const netDisbursedAmount = roundCurrency(grossLoanAmount - taxAmount);

  return { taxAmount, netDisbursedAmount };
};

export const calculateTotalRepayable = (
  loanDetails: LoanDetails,
  loanProduct: LoanProduct,
  taxConfigs: Tax[],
  asOfDate: Date = new Date(),
  forceCalculate: boolean = false,
): CalculatedRepayment => {
  const loanStartDate = startOfDay(new Date(loanDetails.disbursedDate));
  const finalDate = startOfDay(asOfDate);
  const dueDate = startOfDay(new Date(loanDetails.dueDate));

  const principal = loanDetails.loanAmount;
  let serviceFee = 0;
  let interestComponent = 0;
  let penaltyComponent = 0;
  let taxComponent = 0;

  // Safely parse JSON fields from the product, as they might be strings from the DB
  const safeParse = (field: any, defaultValue: any) => {
    if (typeof field === "string") {
      try {
        return JSON.parse(field);
      } catch (e) {
        return defaultValue;
      }
    }
    return field ?? defaultValue;
  };

  const serviceFeeRule = safeParse(loanProduct.serviceFee, undefined);
  const dailyFeeRule = safeParse(loanProduct.dailyFee, undefined);
  const penaltyRules = safeParse(loanProduct.penaltyRules, []);

  // 1. Service Fee (One-time charge)
  if (
    loanProduct.serviceFeeEnabled &&
    serviceFeeRule &&
    serviceFeeRule.value > 0
  ) {
    const feeValue =
      typeof serviceFeeRule.value === "string"
        ? parseFloat(serviceFeeRule.value)
        : serviceFeeRule.value;
    if (serviceFeeRule.type === "fixed") {
      serviceFee = feeValue;
    } else if (serviceFeeRule.type === "percentage") {
      serviceFee = principal * (feeValue / 100);
    }
  }
  serviceFee = roundCurrency(serviceFee);

  // 2. Daily Fee (Interest) - Calculated only up to the due date.
  if (loanProduct.dailyFeeEnabled && dailyFeeRule && dailyFeeRule.value > 0) {
    const feeValue =
      typeof dailyFeeRule.value === "string"
        ? parseFloat(dailyFeeRule.value)
        : dailyFeeRule.value;
    const interestEndDate = finalDate > dueDate ? dueDate : finalDate;
    const payments = normalizePayments((loanDetails as any).payments);

    interestComponent = calculateInterestWithPayments({
      principal,
      loanStartDate,
      interestEndDate,
      dailyFeeRule: {
        type: dailyFeeRule.type,
        value: feeValue,
        calculationBase: dailyFeeRule.calculationBase,
      },
      serviceFee,
      payments,
    });
  }
  interestComponent = roundCurrency(interestComponent);

  const runningBalanceForPenalty = principal + interestComponent + serviceFee;

  // 3. Penalty - Calculated only if overdue.
  // If the loan is paid, we return 0 penalty unless forceCalculate is true.
  // This is used for reports and historical views to see what the penalty was.
  if (loanDetails.repaymentStatus === "Paid" && !forceCalculate) {
    penaltyComponent = 0;
  } else if (
    loanProduct.penaltyRulesEnabled &&
    penaltyRules &&
    penaltyRules.length > 0
  ) {
    // If penaltyPerInstallment is enabled, compute penalty per-installment
    if (
      (loanProduct as any).penaltyPerInstallment &&
      Array.isArray(loanDetails.installments) &&
      loanDetails.installments.length > 0
    ) {
      // Sum penalties for each installment that is overdue as of finalDate.
      // Penalty exposure is based on the installment's OUTSTANDING PRINCIPAL, which
      // must be derived by removing the penalty already covered by installment.paidAmount
      // (payments settle penalty before principal). See splitInstallmentPaidAmount.
      for (const inst of loanDetails.installments) {
        const instDue = startOfDay(new Date(inst.dueDate));
        if (finalDate <= instDue) continue;
        const split = splitInstallmentPaidAmount({
          installmentAmount: inst.amount || 0,
          installmentPaidAmount: inst.paidAmount || 0,
          penaltyRules,
          penaltyDueDate: instDue,
          asOfDate: finalDate,
        });
        penaltyComponent += split.penaltyAccrued;
      }
    } else {
      // Loan-level penalty calculation (legacy behavior)
      if (finalDate > dueDate) {
        const penaltyStartDate =
          loanProduct.duration === 0
            ? startOfDay(
                new Date(loanDetails.disbursedDate.getTime() + 86400000),
              )
            : dueDate;
        const daysOverdueTotal = differenceInDays(finalDate, penaltyStartDate);

        penaltyRules.forEach((rule: PenaltyRule) => {
          const fromDay = rule.fromDay === "" ? 1 : Number(rule.fromDay);
          const toDayRaw =
            rule.toDay === "" || rule.toDay === null
              ? Infinity
              : Number(rule.toDay);
          const toDay = isNaN(toDayRaw) ? Infinity : toDayRaw;
          const value = rule.value === "" ? 0 : Number(rule.value);

          if (daysOverdueTotal >= fromDay) {
            const applicableDaysInTier =
              Math.min(daysOverdueTotal, toDay) - fromDay + 1;
            const isOneTime = rule.frequency === "one-time";

            if (applicableDaysInTier > 0) {
              let penaltyForThisRule = 0;
              const daysToCalculate = isOneTime ? 1 : applicableDaysInTier;

              if (rule.type === "fixed") {
                penaltyForThisRule = value * daysToCalculate;
              } else if (rule.type === "percentageOfPrincipal") {
                penaltyForThisRule =
                  principal * (value / 100) * daysToCalculate;
              } else if (rule.type === "percentageOfCompound") {
                let compoundPenaltyBase =
                  runningBalanceForPenalty + penaltyComponent;
                for (let i = 0; i < daysToCalculate; i++) {
                  const dailyPenalty = roundCurrency(
                    compoundPenaltyBase * (value / 100),
                  );
                  penaltyForThisRule += dailyPenalty;
                  if (!isOneTime) {
                    compoundPenaltyBase += dailyPenalty;
                  }
                }
              }
              penaltyComponent += penaltyForThisRule;
            }
          }
        });
      }
    }
  }
  penaltyComponent = roundCurrency(penaltyComponent);

  // 4. Tax Calculation for all configured taxes
  taxConfigs.forEach((taxConfig) => {
    const taxRate = taxConfig.rate;
    const taxAppliedTo = JSON.parse(taxConfig.appliedTo);

    if (taxRate > 0) {
      let taxableAmount = 0;
      if (taxAppliedTo.includes("serviceFee")) {
        taxableAmount += serviceFee;
      }
      if (taxAppliedTo.includes("interest")) {
        taxableAmount += interestComponent;
      }
      if (taxAppliedTo.includes("penalty")) {
        taxableAmount += penaltyComponent;
      }
      taxComponent += taxableAmount * (taxRate / 100);
    }
  });
  taxComponent = roundCurrency(taxComponent);

  const totalDebt = roundCurrency(
    principal +
      serviceFee +
      interestComponent +
      penaltyComponent +
      taxComponent,
  );

  return {
    total: totalDebt,
    principal: principal,
    serviceFee: serviceFee,
    interest: interestComponent,
    penalty: penaltyComponent,
    tax: taxComponent,
  };
};

/**
 * Same as calculateTotalRepayable but also returns how much of interest/serviceFee/principal
 * has been paid based on the payments array in loanDetails.
 */
export const calculateTotalRepayableDetailed = (
  loanDetails: LoanDetails,
  loanProduct: LoanProduct,
  taxConfigs: Tax[],
  asOfDate: Date = new Date(),
): CalculatedRepaymentDetailed => {
  const loanStartDate = startOfDay(new Date(loanDetails.disbursedDate));
  const finalDate = startOfDay(asOfDate);
  const dueDate = startOfDay(new Date(loanDetails.dueDate));

  const principal = loanDetails.loanAmount;
  let serviceFee = 0;
  let interestComponent = 0;
  let penaltyComponent = 0;
  let taxComponent = 0;
  let interestPaid = 0;
  let serviceFeePaid = 0;
  let principalPaidFromInterestCalc = 0;

  const safeParse = (field: any, defaultValue: any) => {
    if (typeof field === "string") {
      try {
        return JSON.parse(field);
      } catch (e) {
        return defaultValue;
      }
    }
    return field ?? defaultValue;
  };

  const serviceFeeRule = safeParse(loanProduct.serviceFee, undefined);
  const dailyFeeRule = safeParse(loanProduct.dailyFee, undefined);
  const penaltyRules = safeParse(loanProduct.penaltyRules, []);

  // 1. Service Fee
  if (
    loanProduct.serviceFeeEnabled &&
    serviceFeeRule &&
    serviceFeeRule.value > 0
  ) {
    const feeValue =
      typeof serviceFeeRule.value === "string"
        ? parseFloat(serviceFeeRule.value)
        : serviceFeeRule.value;
    if (serviceFeeRule.type === "fixed") {
      serviceFee = feeValue;
    } else if (serviceFeeRule.type === "percentage") {
      serviceFee = principal * (feeValue / 100);
    }
  }
  serviceFee = roundCurrency(serviceFee);

  // 2. Daily Fee (Interest) with detailed breakdown
  if (loanProduct.dailyFeeEnabled && dailyFeeRule && dailyFeeRule.value > 0) {
    const feeValue =
      typeof dailyFeeRule.value === "string"
        ? parseFloat(dailyFeeRule.value)
        : dailyFeeRule.value;
    const interestEndDate = finalDate > dueDate ? dueDate : finalDate;
    const payments = normalizePayments((loanDetails as any).payments);

    const detailed = calculateInterestWithPaymentsDetailed({
      principal,
      loanStartDate,
      interestEndDate,
      dailyFeeRule: {
        type: dailyFeeRule.type,
        value: feeValue,
        calculationBase: dailyFeeRule.calculationBase,
      },
      serviceFee,
      payments,
    });

    // The simulation is the source of truth for the TOTAL interest accrued (it
    // correctly handles early principal payments reducing percentage/compound
    // interest, and caps accrual at the due date). The "paid" split, however, is
    // derived from the priority waterfall below so that payments made AFTER the
    // due date are still counted — the simulation drops those by design.
    interestComponent = detailed.totalInterest;
  }
  interestComponent = roundCurrency(interestComponent);

  const runningBalanceForPenalty = principal + interestComponent + serviceFee;

  // 3. Penalty (same logic as calculateTotalRepayable)
  if (loanDetails.repaymentStatus === 'Paid') {
    penaltyComponent = 0;
  } else if (
    loanProduct.penaltyRulesEnabled &&
    penaltyRules &&
    penaltyRules.length > 0
  ) {
    if (
      (loanProduct as any).penaltyPerInstallment &&
      Array.isArray(loanDetails.installments) &&
      loanDetails.installments.length > 0
    ) {
      for (const inst of loanDetails.installments) {
        const instDue = startOfDay(new Date(inst.dueDate));
        if (finalDate <= instDue) continue;
        const split = splitInstallmentPaidAmount({
          installmentAmount: inst.amount || 0,
          installmentPaidAmount: inst.paidAmount || 0,
          penaltyRules,
          penaltyDueDate: instDue,
          asOfDate: finalDate,
        });
        penaltyComponent += split.penaltyAccrued;
      }
    } else {
      if (finalDate > dueDate) {
        const penaltyStartDate =
          loanProduct.duration === 0
            ? startOfDay(
                new Date(loanDetails.disbursedDate.getTime() + 86400000),
              )
            : dueDate;
        const daysOverdueTotal = differenceInDays(finalDate, penaltyStartDate);

        penaltyRules.forEach((rule: PenaltyRule) => {
          const fromDay = rule.fromDay === "" ? 1 : Number(rule.fromDay);
          const toDayRaw =
            rule.toDay === "" || rule.toDay === null
              ? Infinity
              : Number(rule.toDay);
          const toDay = isNaN(toDayRaw) ? Infinity : toDayRaw;
          const value = rule.value === "" ? 0 : Number(rule.value);

          if (daysOverdueTotal >= fromDay) {
            const applicableDaysInTier =
              Math.min(daysOverdueTotal, toDay) - fromDay + 1;
            const isOneTime = rule.frequency === "one-time";

            if (applicableDaysInTier > 0) {
              let penaltyForThisRule = 0;
              const daysToCalculate = isOneTime ? 1 : applicableDaysInTier;

              if (rule.type === "fixed") {
                penaltyForThisRule = value * daysToCalculate;
              } else if (rule.type === "percentageOfPrincipal") {
                penaltyForThisRule =
                  principal * (value / 100) * daysToCalculate;
              } else if (rule.type === "percentageOfCompound") {
                let compoundPenaltyBase =
                  runningBalanceForPenalty + penaltyComponent;
                for (let i = 0; i < daysToCalculate; i++) {
                  const dailyPenalty = roundCurrency(
                    compoundPenaltyBase * (value / 100),
                  );
                  penaltyForThisRule += dailyPenalty;
                  if (!isOneTime) {
                    compoundPenaltyBase += dailyPenalty;
                  }
                }
              }
              penaltyComponent += penaltyForThisRule;
            }
          }
        });
      }
    }
  }
  penaltyComponent = roundCurrency(penaltyComponent);

  // 4. Tax
  taxConfigs.forEach((taxConfig) => {
    const taxRate = taxConfig.rate;
    const taxAppliedTo = JSON.parse(taxConfig.appliedTo);

    if (taxRate > 0) {
      let taxableAmount = 0;
      if (taxAppliedTo.includes("serviceFee")) {
        taxableAmount += serviceFee;
      }
      if (taxAppliedTo.includes("interest")) {
        taxableAmount += interestComponent;
      }
      if (taxAppliedTo.includes("penalty")) {
        taxableAmount += penaltyComponent;
      }
      taxComponent += taxableAmount * (taxRate / 100);
    }
  });
  taxComponent = roundCurrency(taxComponent);

  // Derive how much of each bucket has been paid using the SAME priority waterfall
  // the payment routes use to apply funds: Penalty -> ServiceFee -> Interest -> Tax
  // -> Principal, run over the total amount actually repaid (loan.repaidAmount).
  // This is timing-independent, so payments made after the due date are counted —
  // fixing the bug where overdue repayments re-charged already-paid interest.
  const alreadyRepaid = Math.max(0, Number((loanDetails as any).repaidAmount ?? 0));
  const afterPenalty = Math.max(0, alreadyRepaid - penaltyComponent);
  serviceFeePaid = roundCurrency(Math.min(serviceFee, afterPenalty));
  const afterServiceFee = Math.max(0, afterPenalty - serviceFee);
  interestPaid = roundCurrency(Math.min(interestComponent, afterServiceFee));
  const afterInterest = Math.max(0, afterServiceFee - interestComponent);
  const afterTax = Math.max(0, afterInterest - taxComponent);
  principalPaidFromInterestCalc = roundCurrency(Math.min(principal, afterTax));

  const totalDebt = roundCurrency(
    principal +
      serviceFee +
      interestComponent +
      penaltyComponent +
      taxComponent,
  );

  return {
    total: totalDebt,
    principal: principal,
    serviceFee: serviceFee,
    interest: interestComponent,
    penalty: penaltyComponent,
    tax: taxComponent,
    interestPaid: interestPaid,
    serviceFeePaid: serviceFeePaid,
    principalPaidFromInterestCalc: principalPaidFromInterestCalc,
  };
};

export interface OutstandingBreakdown {
  principal: number;
  interest: number;
  serviceFee: number;
  penalty: number;
  tax: number;
  total: number;
  /** What each bucket has been paid under the same waterfall. */
  paid: { principal: number; interest: number; serviceFee: number; penalty: number; tax: number };
}

/**
 * What a loan still owes, split by bucket in the order repayments settle them
 * (penalty -> service fee -> interest -> tax -> principal) over loan.repaidAmount.
 * The loans report and the admin dashboard both use this, so the outstanding they
 * show is the same figure.
 */
export const calculateOutstandingBreakdown = (
  loanDetails: LoanDetails,
  loanProduct: LoanProduct,
  taxConfigs: Tax[],
  asOfDate: Date = new Date(),
): OutstandingBreakdown => {
  const totals = calculateTotalRepayable(loanDetails, loanProduct, taxConfigs, asOfDate, true);
  const repaid = Math.max(0, Number(loanDetails.repaidAmount ?? 0));

  let unapplied = repaid;
  const owed = (amount: number) => {
    const settled = Math.min(amount, unapplied);
    unapplied -= settled;
    return roundCurrency(Math.max(0, amount - settled));
  };
  const penalty = owed(totals.penalty);
  const serviceFee = owed(totals.serviceFee);
  const interest = owed(totals.interest);
  const tax = owed(totals.tax);
  const principal = owed(totals.principal);

  return {
    principal,
    interest,
    serviceFee,
    penalty,
    tax,
    total: roundCurrency(Math.max(0, totals.total - repaid)),
    paid: {
      principal: roundCurrency(totals.principal - principal),
      interest: roundCurrency(totals.interest - interest),
      serviceFee: roundCurrency(totals.serviceFee - serviceFee),
      penalty: roundCurrency(totals.penalty - penalty),
      tax: roundCurrency(totals.tax - tax),
    },
  };
};

export interface InstallmentDueBreakdown {
  principalRemaining: number;
  penaltyRemaining: number;
  serviceFeeDue: number;
  interestDue: number;
  taxDue: number;
  totalDue: number;
}

/**
 * Computes the amount due for the *current installment payment* plus any
 * loan-level buckets (service fee / interest / tax) that are still unpaid.
 * Never more than the loan's outstanding balance; exactly that balance for the
 * last open installment.
 *
 * This is the same breakdown used for repayment validation in the payment callback.
 */
export const calculateInstallmentDueBreakdown = (params: {
  loanDetails: LoanDetails;
  loanProduct: LoanProduct;
  taxConfigs: Tax[];
  activeInstallment: { amount?: number | null; paidAmount?: number | null; dueDate: Date | string };
  asOfDate?: Date;
}): InstallmentDueBreakdown => {
  const { loanDetails, loanProduct, taxConfigs, activeInstallment, asOfDate = new Date() } = params;

  const totals = calculateTotalRepayableDetailed(loanDetails, loanProduct, taxConfigs, asOfDate);
  const alreadyRepaid = Number((loanDetails as any).repaidAmount ?? 0);

  const serviceFeeDue = Math.max(0, totals.serviceFee - totals.serviceFeePaid);
  const interestDue = Math.max(0, totals.interest - totals.interestPaid);

  // Tax priority is after interest. Infer how much tax has already been covered
  // by repayments that are beyond (penalty + serviceFee + interest + principalPaidFromInterestCalc).
  const taxPaidSoFar = Math.max(
    0,
    alreadyRepaid -
      totals.penalty -
      totals.serviceFeePaid -
      totals.interestPaid -
      totals.principalPaidFromInterestCalc,
  );
  const taxDue = Math.max(0, totals.tax - taxPaidSoFar);

  const penaltyRules = (() => {
    const raw: any = (loanProduct as any).penaltyRules;
    if (typeof raw === "string") {
      try {
        return JSON.parse(raw);
      } catch {
        return [];
      }
    }
    return Array.isArray(raw) ? raw : [];
  })();

  const penaltyPerInstallment = Boolean((loanProduct as any).penaltyPerInstallment);
  const penaltyDueDate = penaltyPerInstallment
    ? new Date(activeInstallment.dueDate)
    : new Date((loanDetails as any).dueDate);

  const installmentAmount = Math.max(0, Number(activeInstallment.amount ?? 0));
  const installmentPaidAmount = Math.max(0, Number(activeInstallment.paidAmount ?? 0));

  // Installment payments settle penalty first, then principal. The penalty/principal
  // split is computed by the shared helper so this matches the loan-level penalty totals.
  const split = splitInstallmentPaidAmount({
    installmentAmount,
    installmentPaidAmount,
    penaltyRules,
    penaltyDueDate,
    asOfDate,
  });

  // installment.paidAmount only moves when a payment is booked against the
  // installment, while the service fee / interest / tax above are settled against
  // loan.repaidAmount, which every repayment channel moves. Reading principal
  // from one and charges from the other drifted both ways: it re-billed principal
  // a CBS auto-debit had already collected (the counter was not updated), and it
  // under-stated the balance once interest had been paid in pieces, so the
  // callback refused payments the gateway had already taken from the customer.
  //
  // The loan's outstanding balance bounds every installment, and the last open
  // installment carries all of it.
  const loanOutstanding = Math.max(0, totals.total - alreadyRepaid);
  const chargesDue = serviceFeeDue + interestDue + taxDue;
  const room = Math.max(0, loanOutstanding - chargesDue);
  const isClosed = (status: unknown) => ["PAID", "MERGED"].includes(String(status ?? "").toUpperCase());
  const openInstallments = (loanDetails.installments ?? []).filter(
    (i: any) => !isClosed(i?.status) && Number(i?.amount ?? 0) > 0,
  );
  const isLastOpenInstallment = openInstallments.length <= 1;

  const penaltyRemaining = Math.min(split.penaltyRemaining, room);
  const principalRemaining = isLastOpenInstallment
    ? room - penaltyRemaining
    : Math.min(split.principalRemaining, room - penaltyRemaining);

  const totalDue = roundCurrency(
    principalRemaining + penaltyRemaining + serviceFeeDue + interestDue + taxDue,
  );

  return {
    principalRemaining: roundCurrency(principalRemaining),
    penaltyRemaining: roundCurrency(penaltyRemaining),
    serviceFeeDue: roundCurrency(serviceFeeDue),
    interestDue: roundCurrency(interestDue),
    taxDue: roundCurrency(taxDue),
    totalDue: roundCurrency(Math.max(0, totalDue)),
  };
};
