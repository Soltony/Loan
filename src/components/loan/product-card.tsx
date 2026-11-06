'use client';

import { useState, useMemo } from 'react';
import type { LoanProduct, LoanDetails, Tax } from '@/lib/types';
import { ChevronDown, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { calculateTotalRepayableDetailed } from '@/lib/loan-calculator';
import { dueStatus, formatDate, formatMoney, repaidShare } from '@/lib/miniapp/format';
import { activePenaltyRules, dailyFeeText, describePenalty, feeTaxTexts, serviceFeeText } from '@/lib/miniapp/fees';
import { Amount, BrandButton, DetailRow, Notice, Panel, ProgressBar, StatusPill, dueTone } from '@/components/miniapp/ui';
import { Skeleton } from '@/components/ui/skeleton';

interface ProductCardProps {
    product: LoanProduct;
    taxConfigs: Tax[];
    activeLoan?: LoanDetails;
    onApply: () => void;
    onRepay: (loan: LoanDetails, balanceDue: number) => void;
    IconDisplayComponent: React.ComponentType<{ iconName: string, className?: string }>;
    isEligible: boolean;
    eligibilityReason: string;
    availableToBorrow: number;
    asOfDate: Date;
    /** The limit is being worked out: show a placeholder instead of a stale figure. */
    isLoadingLimit?: boolean;
    /** Apply was tapped and the up-to-date limit is being fetched. */
    isApplying?: boolean;
    /** Amounts hidden for privacy (the eye toggle on the dashboard). */
    hideAmounts?: boolean;
}

export function ProductCard({
    product,
    taxConfigs,
    activeLoan,
    onApply,
    onRepay,
    IconDisplayComponent,
    isEligible,
    eligibilityReason,
    availableToBorrow,
    asOfDate,
    isLoadingLimit = false,
    isApplying = false,
    hideAmounts = false,
}: ProductCardProps) {
    const [showTerms, setShowTerms] = useState(false);

    const activeInstallment = activeLoan && Array.isArray((activeLoan as any).installments) ? (activeLoan as any).installments.find((i: any) => i.isActive) : undefined;
    const mergedNextInstallment = activeLoan && activeInstallment && Array.isArray((activeLoan as any).installments)
        ? (activeLoan as any).installments.find((i: any) => i && i.status === 'Merged' && i.installmentNumber === activeInstallment.installmentNumber + 1)
        : undefined;

    // Loan-level repayment totals. The Outstanding shown on this card must match the
    // Loan History and Loan Detail pages, which both compute (total repayable −
    // loan.repaidAmount). The dashboard also repays at the loan level (it sends no
    // installmentId), so the card reads the same loan-level figure. Deriving it from
    // the per-installment paidAmount counter is what made this card go stale: that
    // counter only tracks penalty+principal, so auto-collections that settle
    // interest/penalty move loan.repaidAmount without moving installment.paidAmount.
    const loanTotals = useMemo(() => {
        if (!activeLoan) return null;
        return calculateTotalRepayableDetailed(activeLoan, activeLoan.product, taxConfigs, asOfDate);
    }, [activeLoan, taxConfigs, asOfDate]);

    const balanceDue = useMemo(() => {
        if (!activeLoan || !loanTotals) return 0;
        const alreadyRepaid = activeLoan.repaidAmount || 0;
        return Math.max(0, loanTotals.total - alreadyRepaid);
    }, [activeLoan, loanTotals]);

    const trueAvailableLimit = useMemo(() => {
        // The available limit for this specific product is the smaller of the product's general
        // available limit and the user's overall available credit.
        return Math.min(product.availableLimit || 0, availableToBorrow);
    }, [product.availableLimit, availableToBorrow]);

    const money = (amount: number | null | undefined) => (hideAmounts ? '••••••' : formatMoney(amount));

    if (activeLoan) {
        // Principal / penalty remaining come from the loan-level repayment waterfall
        // (over loan.repaidAmount) so they reflect every repayment — including SuperApp
        // auto-collections — exactly like the History and Detail pages. The stale
        // per-installment paidAmount counter is intentionally not used here.
        const principalRemaining = loanTotals
            ? Math.max(0, loanTotals.principal - loanTotals.principalPaidFromInterestCalc)
            : null;
        const penaltyPaid = loanTotals ? Math.min(loanTotals.penalty, activeLoan.repaidAmount || 0) : 0;
        const instPenalty = loanTotals ? Math.max(0, loanTotals.penalty - penaltyPaid) : 0;

        const dueDate = activeInstallment ? activeInstallment.dueDate : activeLoan.dueDate;
        const due = dueStatus(dueDate, asOfDate);
        const installmentCount = Array.isArray(activeLoan.installments) ? activeLoan.installments.length : 0;
        const repaid = activeLoan.repaidAmount || 0;

        return (
            <Panel className="overflow-hidden p-0">
                <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <p className="truncate font-semibold">{product.name}</p>
                            <p className="mt-0.5 text-xs text-gray-500">
                                {activeInstallment
                                    ? `Installment ${activeInstallment.installmentNumber}${installmentCount > 1 ? ` of ${installmentCount}` : ''} · `
                                    : ''}
                                Due {formatDate(dueDate)}
                            </p>
                        </div>
                        <StatusPill tone={dueTone(due.tone)}>{due.label}</StatusPill>
                    </div>

                    <p className="mt-4 text-xs font-medium text-gray-500">Outstanding</p>
                    <Amount value={money(balanceDue)} className="text-[28px] leading-tight" />
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                        {principalRemaining !== null && <span>Principal {money(principalRemaining)}</span>}
                        {instPenalty > 0 && <span className="font-medium text-red-700">Penalty {money(instPenalty)}</span>}
                        {mergedNextInstallment && <span>Includes installment {mergedNextInstallment.installmentNumber}</span>}
                    </div>

                    {loanTotals && (
                        <div className="mt-4">
                            <ProgressBar value={repaidShare(repaid, loanTotals.total)} label="Share of the loan repaid" />
                            <p className="mt-1.5 text-xs text-gray-500">
                                Repaid {money(repaid)} of {money(loanTotals.total)} ETB
                            </p>
                        </div>
                    )}
                </div>
                <div className="border-t border-gray-100 p-3">
                    <BrandButton block size="lg" onClick={() => onRepay(activeLoan, balanceDue)}>
                        Repay
                    </BrandButton>
                </div>
            </Panel>
        );
    }

    const serviceFee = serviceFeeText(product);
    const dailyFee = dailyFeeText(product);
    const penalties = activePenaltyRules(product);
    const taxes = feeTaxTexts(taxConfigs);
    const hasTerms = !!serviceFee || !!dailyFee || penalties.length > 0 || taxes.length > 0 || (product.duration ?? 0) > 0;
    const canApply = isEligible && availableToBorrow > 0;
    const minLoan = product.minLoan ?? 0;
    const termsId = `product-terms-${product.id}`;

    // One compact row: icon, name, amount and term, with Apply on the right.
    return (
        <Panel className="p-3">
            <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-brand-soft text-brand-ink" aria-hidden>
                    <IconDisplayComponent iconName={product.icon} className="h-6 w-6 object-contain" />
                </div>
                <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold leading-tight">{product.name}</p>
                    {isLoadingLimit ? (
                        <Skeleton className="mt-1 h-4 w-32 bg-gray-100" />
                    ) : (
                        <p className="mt-0.5 truncate text-[13px] leading-snug">
                            {canApply ? (
                                <span className="font-semibold text-brand-ink">
                                    {minLoan > 0 ? `${money(minLoan)} – ` : 'Up to '}
                                    {money(trueAvailableLimit)} ETB
                                </span>
                            ) : (
                                <span className="text-gray-500">Not available now</span>
                            )}
                            {(product.duration ?? 0) > 0 && (
                                <span className="text-gray-500"> · {product.duration} days</span>
                            )}
                        </p>
                    )}
                </div>
                <BrandButton
                    size="sm"
                    className="h-10 shrink-0 px-5"
                    onClick={onApply}
                    disabled={!canApply || isLoadingLimit}
                    loading={isApplying}
                >
                    Apply
                </BrandButton>
            </div>

            {!isLoadingLimit && !canApply && (
                <Notice icon={<Info />} className="mt-2.5 py-2 text-[13px]">
                    {/* Eligible but nothing left to borrow: the eligibility reason would read
                        "Congratulations! You are eligible" next to a disabled button. */}
                    {isEligible
                        ? 'You have used your available limit. Repay your active loans to borrow again.'
                        : eligibilityReason || 'This loan is not available for your account right now.'}
                </Notice>
            )}

            {hasTerms && (
                <div className="mt-1.5 pl-[52px]">
                    <button
                        type="button"
                        onClick={() => setShowTerms((v) => !v)}
                        aria-expanded={showTerms}
                        aria-controls={termsId}
                        className="-ml-1 inline-flex items-center gap-0.5 rounded-md px-1 py-0.5 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                    >
                        Fees and terms
                        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showTerms && 'rotate-180')} aria-hidden />
                    </button>
                    {showTerms && (
                        <div id={termsId} className="pb-1 pt-1">
                            {(product.duration ?? 0) > 0 && <DetailRow label="Loan term" value={`${product.duration} days`} />}
                            {serviceFee && <DetailRow label="Service fee" value={serviceFee} />}
                            {dailyFee && <DetailRow label="Daily fee" value={dailyFee} />}
                            {taxes.map((t) => (
                                <DetailRow key={t} label="Tax" value={t} valueClassName="max-w-[60%]" />
                            ))}
                            {penalties.length > 0 && (
                                <div className="pt-1.5 text-sm">
                                    <p className="text-gray-500">Late payment penalty</p>
                                    <ul className="mt-1 space-y-1 text-xs text-gray-600">
                                        {penalties.map((rule) => (
                                            <li key={rule.id} className="flex gap-2">
                                                <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gray-400" />
                                                {describePenalty(rule)}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </Panel>
    );
}
