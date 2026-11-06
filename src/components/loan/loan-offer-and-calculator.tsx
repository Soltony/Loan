"use client";

import { useState, useEffect, useMemo } from "react";
import type {
  LoanProduct,
  LoanDetails,
  CheckLoanEligibilityOutput,
  Tax,
} from "@/lib/types";
import { addDays, endOfDay } from "date-fns";
import { AlertCircle, ChevronDown, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  calculateTotalRepayable,
  calculateInclusiveTax,
} from "@/lib/loan-calculator";
import { Skeleton } from "@/components/ui/skeleton";
import { BottomSheet } from "@/components/miniapp/bottom-sheet";
import {
  Amount,
  BrandButton,
  DetailRow,
  Notice,
  Panel,
} from "@/components/miniapp/ui";
import { formatDate, formatETB, formatMoney } from "@/lib/miniapp/format";
import {
  activePenaltyRules,
  dailyFeeText,
  describePenalty,
  serviceFeeText,
} from "@/lib/miniapp/fees";

interface LoanOfferAndCalculatorProps {
  product: LoanProduct;
  taxConfigs: Tax[];
  isLoading: boolean;
  eligibilityResult: CheckLoanEligibilityOutput | null;
  onAccept: (
    details: Omit<
      LoanDetails,
      "id" | "providerName" | "productName" | "payments"
    >,
  ) => void;
  isSubmitting?: boolean;
  /** Where the money goes, e.g. "•••• 2237" (shown on the confirmation). */
  accountLabel?: string;
}

/**
 * Percentage core banking deducts from the principal at disbursement.
 * Core performs this deduction itself — we always wire it the gross amount — so this
 * rate is disclosure-only. It never changes what we send out or what we record on the loan.
 * Set via NEXT_PUBLIC_CORE_DEDUCTED_TAX_RATE (e.g. "1" for 1%); 0 or unset hides the row.
 */
const CORE_DEDUCTED_TAX_RATE =
  Number(process.env.NEXT_PUBLIC_CORE_DEDUCTED_TAX_RATE) || 0;

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const wholeAmount = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** Keeps digits and one decimal point, with at most two decimals. */
const sanitizeAmount = (raw: string) => {
  let value = raw.replace(/[^\d.]/g, "");
  const dot = value.indexOf(".");
  if (dot !== -1) {
    value = value.slice(0, dot + 1) + value.slice(dot + 1).replace(/\./g, "").slice(0, 2);
  }
  return value;
};

export function LoanOfferAndCalculator({
  product,
  taxConfigs,
  isLoading,
  eligibilityResult,
  onAccept,
  isSubmitting = false,
  accountLabel,
}: LoanOfferAndCalculatorProps) {
  const [loanAmount, setLoanAmount] = useState<number | string>("");
  const [amountError, setAmountError] = useState("");
  const [isPenaltyDetailsOpen, setIsPenaltyDetailsOpen] = useState(false);
  const [calculationResult, setCalculationResult] = useState<any>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const { suggestedLoanAmountMin = 0, suggestedLoanAmountMax = 0 } =
    eligibilityResult || {};

  // If product.maxLoan is not configured (0 or negative), treat it as no cap and rely on suggestedLoanAmountMax
  const effectiveProductMax =
    typeof product.maxLoan === "number" && product.maxLoan > 0
      ? product.maxLoan
      : Infinity;
  const minLoan = Math.max(product.minLoan ?? 0, suggestedLoanAmountMin);
  const maxLoan = Math.min(effectiveProductMax, suggestedLoanAmountMax);

  useEffect(() => {
    const initialAmount = Math.min(product.availableLimit ?? maxLoan, maxLoan);
    setLoanAmount(initialAmount);
  }, [product.id, product.availableLimit, maxLoan]);

  useEffect(() => {
    const calculate = () => {
      const numericLoanAmount =
        typeof loanAmount === "string" ? parseFloat(loanAmount) : loanAmount;
      if (
        !eligibilityResult?.isEligible ||
        isNaN(numericLoanAmount) ||
        numericLoanAmount <= 0
      ) {
        setCalculationResult(null);
        return;
      }

      const disbursedDate = new Date();
      const duration = product.duration ?? 30;
      const dueDate =
        duration === 0
          ? endOfDay(disbursedDate)
          : addDays(disbursedDate, duration);

      let serviceFee = 0;
      if (
        product.serviceFeeEnabled &&
        product.serviceFee &&
        product.serviceFee.value
      ) {
        const feeValue =
          typeof product.serviceFee.value === "string"
            ? parseFloat(product.serviceFee.value)
            : product.serviceFee.value || 0;
        serviceFee =
          product.serviceFee.type === "fixed"
            ? feeValue
            : numericLoanAmount * (feeValue / 100);
      }

      const tempLoan: LoanDetails = {
        id: "temp",
        borrowerId: "",
        loanAmount: numericLoanAmount,
        serviceFee: serviceFee,
        disbursedDate,
        dueDate,
        repaymentStatus: "Unpaid",
        payments: [],
        productName: product.name,
        providerName: "",
        repaidAmount: 0,
        penaltyAmount: 0,
        product: product,
      };

      const result = calculateTotalRepayable(
        tempLoan,
        product,
        taxConfigs,
        dueDate,
      );

      // Calculate inclusive tax (deducted from principal before disbursement)
      const inclusiveTax = calculateInclusiveTax(numericLoanAmount, taxConfigs);

      // Tax core banking deducts on its own. Disclosure only — see CORE_DEDUCTED_TAX_RATE.
      const coreDeductedTaxAmount =
        CORE_DEDUCTED_TAX_RATE > 0
          ? round2(numericLoanAmount * (CORE_DEDUCTED_TAX_RATE / 100))
          : 0;

      const totalDeductedAtDisbursement = round2(
        inclusiveTax.taxAmount + coreDeductedTaxAmount,
      );

      setCalculationResult({
        ...result,
        disbursedDate,
        dueDate,
        penaltyAmount: 0,
        inclusiveTaxAmount: inclusiveTax.taxAmount,
        netDisbursedAmount: inclusiveTax.netDisbursedAmount,
        coreDeductedTaxAmount,
        totalDeductedAtDisbursement,
        // What actually lands in the borrower's account, whoever performs the deduction.
        netReceivedAmount: round2(
          numericLoanAmount - totalDeductedAtDisbursement,
        ),
      });
    };

    calculate();
  }, [loanAmount, eligibilityResult, product, taxConfigs]);

  const rangeText =
    minLoan > 0
      ? `${formatETB(minLoan)} to ${formatETB(maxLoan)}`
      : `up to ${formatETB(maxLoan)}`;

  const validateAmount = (amount: number | string) => {
    const numericAmount =
      typeof amount === "string" ? parseFloat(amount) : amount;
    if (
      isNaN(numericAmount) ||
      numericAmount <= 0 ||
      numericAmount > maxLoan ||
      numericAmount < minLoan
    ) {
      setAmountError(
        `Enter an amount between ${formatETB(minLoan)} and ${formatETB(maxLoan)}.`,
      );
      return false;
    }
    setAmountError("");
    return true;
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = sanitizeAmount(e.target.value);
    setLoanAmount(value);
    validateAmount(value);
  };

  const pickAmount = (value: number) => {
    setLoanAmount(value);
    validateAmount(value);
  };

  // Round shares of the limit, for quick taps on a phone.
  const quickAmounts = useMemo(() => {
    if (!Number.isFinite(maxLoan) || maxLoan <= 0) return [];
    const step = maxLoan >= 1000 ? 100 : maxLoan >= 100 ? 10 : 1;
    const picks = [0.25, 0.5, 0.75]
      .map((share) => Math.floor((maxLoan * share) / step) * step)
      .filter((v) => v > 0 && v >= minLoan && v < maxLoan);
    return [...new Set(picks)].map((value) => ({
      value,
      label: wholeAmount.format(value),
    }));
  }, [minLoan, maxLoan]);

  const numericAmount =
    typeof loanAmount === "string" ? parseFloat(loanAmount) : loanAmount;

  const openConfirm = () => {
    if (calculationResult && !isNaN(numericAmount) && validateAmount(numericAmount)) {
      setIsConfirmOpen(true);
    }
  };

  const handleAccept = () => {
    if (calculationResult && !isNaN(numericAmount)) {
      if (!validateAmount(numericAmount)) {
        setIsConfirmOpen(false);
        return;
      }
      setIsConfirmOpen(false);
      onAccept({
        loanAmount: numericAmount,
        repaymentStatus: "Unpaid",
        repaidAmount: 0,
        ...calculationResult,
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full rounded-2xl bg-white" />
        <Skeleton className="h-64 w-full rounded-2xl bg-white" />
      </div>
    );
  }

  if (!eligibilityResult) {
    return null; // Or some other placeholder
  }

  if (!eligibilityResult.isEligible) {
    return (
      <Notice tone="danger" icon={<AlertCircle />}>
        <p className="font-semibold">You can&apos;t take this loan right now</p>
        <p className="mt-0.5">
          {eligibilityResult.reason ||
            "We're sorry, but you are not eligible for this loan product at this time."}
        </p>
      </Notice>
    );
  }

  const penalties = activePenaltyRules(product);
  const dailyFee = dailyFeeText(product);
  const serviceFee = serviceFeeText(product);
  const inclusiveTaxes = taxConfigs.filter((t) => t.isInclusive && t.rate > 0);
  const duration = product.duration ?? 30;
  const cannotBorrow = !(maxLoan > 0);

  return (
    <div>
      <Panel className="p-3.5">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor="loanAmount" className="text-sm font-medium text-gray-600">
            How much do you need?
          </label>
          {!cannotBorrow && (
            <span className="shrink-0 text-xs text-gray-500">
              {minLoan > 0 ? `${formatMoney(minLoan)} – ${formatMoney(maxLoan)}` : `Up to ${formatMoney(maxLoan)}`}
            </span>
          )}
        </div>
        <div
          className={cn(
            "mt-1.5 flex items-baseline gap-2 rounded-xl border-2 bg-white px-3 py-1.5 transition-colors focus-within:border-brand-ink",
            amountError ? "border-red-500 focus-within:border-red-500" : "border-gray-200",
          )}
        >
          <input
            id="loanAmount"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={loanAmount}
            onChange={handleAmountChange}
            disabled={cannotBorrow || isSubmitting}
            aria-invalid={!!amountError}
            aria-describedby="loanAmountHelp"
            placeholder="0"
            className="w-full min-w-0 bg-transparent text-[26px] font-bold tabular-nums tracking-tight text-gray-900 outline-none placeholder:text-gray-300"
          />
          <span className="text-base font-semibold text-gray-400">ETB</span>
        </div>
        {/* Only problems are spelled out here; the range sits next to the label. */}
        <p
          id="loanAmountHelp"
          className={cn(
            "text-xs",
            amountError || cannotBorrow ? "mt-1.5 text-red-600" : "sr-only",
          )}
        >
          {amountError || (cannotBorrow ? "No amount is available to borrow right now." : `You can borrow ${rangeText}.`)}
        </p>

        {!cannotBorrow && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[...quickAmounts, { value: maxLoan, label: "Max" }].map((option) => {
              const selected = Math.abs((numericAmount || 0) - option.value) < 0.005;
              return (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => pickAmount(option.value)}
                  aria-pressed={selected}
                  disabled={isSubmitting}
                  className={cn(
                    "h-8 rounded-full border px-3 text-[13px] font-medium tabular-nums transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink",
                    selected
                      ? "border-transparent bg-brand-soft text-brand-ink"
                      : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50",
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        )}
      </Panel>

      {/* No figures for an amount that cannot be borrowed. */}
      {calculationResult && !amountError && (
        <Panel className="mt-3 overflow-hidden p-0">
          <div className="grid grid-cols-2 divide-x divide-gray-100 border-b border-gray-100">
            <div className="px-3.5 py-2.5">
              <p className="text-xs font-medium text-gray-500">You&apos;ll receive</p>
              <Amount value={formatMoney(calculationResult.netReceivedAmount)} className="block text-lg" />
            </div>
            <div className="px-3.5 py-2.5">
              <p className="text-xs font-medium text-gray-500">
                You&apos;ll repay by {formatDate(calculationResult.dueDate)}
              </p>
              <Amount value={formatMoney(calculationResult.total)} className="block text-lg text-brand-ink" />
            </div>
          </div>

          {/* Rates go in the labels: one line per row. */}
          <div className="px-3.5 py-1.5">
            <DetailRow className="py-1" label="Loan amount" value={formatMoney(calculationResult.principal)} />
            {calculationResult.inclusiveTaxAmount > 0 && (
              <DetailRow
                className="py-1"
                label={
                  inclusiveTaxes.length === 1
                    ? `${inclusiveTaxes[0].name || "Tax"} (${inclusiveTaxes[0].rate}%)`
                    : `Taxes (${inclusiveTaxes.reduce((s, t) => s + t.rate, 0)}%)`
                }
                value={`− ${formatMoney(calculationResult.inclusiveTaxAmount)}`}
              />
            )}
            {calculationResult.coreDeductedTaxAmount > 0 && (
              <DetailRow
                className="py-1"
                label={`Tax deducted (${CORE_DEDUCTED_TAX_RATE}%)`}
                value={`− ${formatMoney(calculationResult.coreDeductedTaxAmount)}`}
              />
            )}
            {calculationResult.serviceFee > 0 && (
              <DetailRow
                className="py-1"
                label={serviceFee ? `Service fee (${serviceFee})` : "Service fee"}
                value={`+ ${formatMoney(calculationResult.serviceFee)}`}
              />
            )}
            {calculationResult.interest > 0 && (
              <DetailRow
                className="py-1"
                label={dailyFee ? `Daily fee (${dailyFee.replace(" per day", "/day")}, ${duration} days)` : "Daily fee"}
                value={`+ ${formatMoney(calculationResult.interest)}`}
              />
            )}
            {calculationResult.tax > 0 && (
              <DetailRow className="py-1" label="Tax on fees" value={`+ ${formatMoney(calculationResult.tax)}`} />
            )}
            <DetailRow
              label="Total to repay"
              value={formatETB(calculationResult.total)}
              strong
              className="mt-0.5 border-t border-dashed border-gray-200 pt-1.5"
            />
          </div>

          {penalties.length > 0 && (
            <div className="border-t border-gray-100">
              <button
                type="button"
                onClick={() => setIsPenaltyDetailsOpen((v) => !v)}
                aria-expanded={isPenaltyDetailsOpen}
                aria-controls="late-payment-rules"
                className="flex w-full items-center justify-between px-3.5 py-2.5 text-[13px] font-medium text-gray-700 hover:bg-gray-50"
              >
                <span className="flex items-center gap-2">
                  <Info className="h-4 w-4 text-amber-600" aria-hidden />
                  If you pay late
                </span>
                <ChevronDown
                  className={cn("h-4 w-4 transition-transform", isPenaltyDetailsOpen && "rotate-180")}
                  aria-hidden
                />
              </button>
              {isPenaltyDetailsOpen && (
                <ul id="late-payment-rules" className="space-y-1.5 px-3.5 pb-3 text-[13px] text-gray-600">
                  {penalties.map((rule) => (
                    <li key={rule.id} className="flex gap-2">
                      <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gray-400" />
                      {describePenalty(rule)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Panel>
      )}

      <div className="sticky bottom-0 -mx-4 mt-6 border-t border-gray-200 bg-white/95 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 backdrop-blur">
        <BrandButton
          block
          size="lg"
          onClick={openConfirm}
          disabled={!calculationResult || !!amountError || cannotBorrow}
          loading={isSubmitting}
        >
          {isSubmitting ? "Processing…" : "Continue"}
        </BrandButton>
      </div>

      <BottomSheet
        open={isConfirmOpen}
        onOpenChange={setIsConfirmOpen}
        title="Confirm your loan"
        description="Please check the details before we send the money."
        footer={
          <div className="space-y-2">
            <BrandButton block size="lg" onClick={handleAccept} loading={isSubmitting}>
              Confirm and get {calculationResult ? formatETB(calculationResult.netReceivedAmount) : ""}
            </BrandButton>
            <BrandButton block variant="ghost" onClick={() => setIsConfirmOpen(false)}>
              Change amount
            </BrandButton>
          </div>
        }
      >
        {calculationResult && (
          <>
            <div className="rounded-2xl bg-gray-50 px-4 py-2">
              <DetailRow label="You'll receive" value={formatETB(calculationResult.netReceivedAmount)} strong />
              {accountLabel && <DetailRow label="Paid into" value={accountLabel} />}
              <DetailRow label="You'll repay" value={formatETB(calculationResult.total)} strong />
              <DetailRow label="Due date" value={formatDate(calculationResult.dueDate)} />
            </div>
            <p className="mt-3 text-xs leading-relaxed text-gray-500">
              By confirming, you take this {product.name} loan on the terms shown.
              {penalties.length > 0 && " Paying after the due date adds a penalty."}
            </p>
          </>
        )}
      </BottomSheet>
    </div>
  );
}
