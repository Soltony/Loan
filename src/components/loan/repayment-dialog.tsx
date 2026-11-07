'use client';

import { useState, useMemo, useEffect } from 'react';
import type { LoanDetails, Tax } from '@/lib/types';
import { ChevronDown, Delete, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { calculateInstallmentDueBreakdown, calculateTotalRepayableDetailed } from '@/lib/loan-calculator';
import { BottomSheet } from '@/components/miniapp/bottom-sheet';
import { abortPendingRepayment, nextPaint, startPendingRepayment } from '@/lib/miniapp/pending-repayment';
import { REPAYMENT_CONFIRMATION_WINDOW_MS } from '@/lib/repayment-window';
import { DetailRow } from '@/components/miniapp/ui';
import { brandCssVars } from '@/lib/miniapp/brand';
import { formatETB, formatMoney } from '@/lib/miniapp/format';

interface RepaymentDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (amount: number) => void;
    loan: LoanDetails;
    totalBalanceDue: number;
    providerColor?: string;
    taxConfigs: Tax[];
    asOfDate: Date;
}

// Extend the window type to include myJsChannel
declare global {
  interface Window {
    myJsChannel?: {
      postMessage: (message: any) => void;
    };
  }
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

/** The typed amount with thousands separators: "10039.5" -> "10,039.5". */
const groupDigits = (raw: string) => {
    if (!raw) return '0';
    const [whole, fraction] = raw.split('.');
    const grouped = (whole || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return fraction !== undefined ? `${grouped}.${fraction}` : grouped;
};

export function RepaymentDialog({ isOpen, onClose, loan, totalBalanceDue, providerColor, taxConfigs, asOfDate }: RepaymentDialogProps) {
    const [amount, setAmount] = useState('');
    // The amount is still the pre-filled one: the first key typed replaces it.
    const [pristine, setPristine] = useState(true);
    const [error, setError] = useState('');
    const [payError, setPayError] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [showBreakdown, setShowBreakdown] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setAmount(totalBalanceDue.toFixed(2));
            setPristine(true);
            setError('');
            setPayError('');
            setIsProcessing(false);
        }
    }, [isOpen, totalBalanceDue, loan?.id]);

    const remainingAmount = useMemo(() => {
        const enteredAmount = parseFloat(amount) || 0;
        return totalBalanceDue - enteredAmount;
    }, [amount, totalBalanceDue]);

    const validateAmount = (value: string) => {
        const numericAmount = parseFloat(value);
        if (isNaN(numericAmount) || numericAmount <= 0) {
            setError('Enter an amount to pay.');
            return false;
        }
        if (numericAmount > totalBalanceDue + 1e-9) { // Use a small epsilon for float comparison
            setError(`You can pay at most ${formatETB(totalBalanceDue)}.`);
            return false;
        }
        setError('');
        return true;
    }

    const updateAmount = (next: string) => {
        setAmount(next);
        setPayError('');
        validateAmount(next);
    };

    const handleNumberClick = (key: string) => {
        const base = pristine ? '' : amount;
        setPristine(false);
        if (key === '.' && base.includes('.')) return;
        const dot = base.indexOf('.');
        if (dot !== -1 && key !== '.' && base.length - dot > 2) return; // two decimals at most
        let next = base === '' && key === '.' ? '0.' : base + key;
        next = next.replace(/^0+(?=\d)/, ''); // no leading zeros
        updateAmount(next);
    };

    const handleBackspace = () => {
        setPristine(false);
        updateAmount(amount.slice(0, -1));
    };

    const payFullAmount = () => {
        setPristine(true);
        updateAmount(totalBalanceDue.toFixed(2));
    };

    const handleConfirm = async () => {
        const numericAmount = parseFloat(amount);
        if (!validateAmount(amount) || isNaN(numericAmount)) {
            return;
        }

        // Checked before the gateway is asked for anything: without the super app's
        // channel no one can approve the payment, and asking first would only leave a
        // PENDING payment behind that never settles.
        if (typeof window === 'undefined' || typeof window.myJsChannel?.postMessage !== 'function') {
            console.error('NIB Super App channel (window.myJsChannel) not found.');
            setPayError("We couldn't open the payment screen. Please reopen Loans from the app and try again.");
            return;
        }

        setIsProcessing(true);
        setPayError('');

        let started: { paymentToken: string; transactionId: string } | null = null;
        let inFlight: { transactionId: string; amount: number; retryAfterSeconds: number } | null = null;
        try {
            // Step 1: our backend registers the payment with the gateway and returns its token.
            const initiateResponse = await fetch('/api/initiate-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount: numericAmount, loanId: loan.id }),
            });

            const data = await initiateResponse.json().catch(() => ({}));
            if (initiateResponse.status === 409 && data.code === 'PAYMENT_IN_PROGRESS' && data.inFlight?.transactionId) {
                inFlight = {
                    transactionId: String(data.inFlight.transactionId),
                    amount: Number(data.inFlight.amount) || numericAmount,
                    retryAfterSeconds: Number(data.retryAfterSeconds) || 0,
                };
            } else if (!initiateResponse.ok) {
                throw new Error(data.error || 'We could not start the payment. Please try again.');
            } else if (!data.paymentToken || !data.transactionId) {
                throw new Error('We could not start the payment. Please try again.');
            } else {
                started = { paymentToken: data.paymentToken, transactionId: data.transactionId };
            }
        } catch (err) {
            // Nothing has been charged yet, so the keypad stays open to try again.
            setPayError((err instanceof Error && err.message) || 'Something went wrong with the payment. Please try again.');
            setIsProcessing(false);
            return;
        }

        const about = {
            loanId: loan.id,
            productName: loan.productName ?? 'Loan',
            providerName: loan.providerName ?? null,
            providerColor: providerColor ?? null,
        };

        if (inFlight) {
            // A payment on this loan is still waiting for its callback — started on another
            // device, or on this one before the screen lost track of it. The server took no
            // new payment, so there is no token to hand over: follow the existing one instead.
            startPendingRepayment({
                ...about,
                transactionId: inFlight.transactionId,
                amount: inFlight.amount,
                rejoined: true,
                // Placed from what the server says is left of the window, so a wrong clock on
                // this phone neither cuts the wait short nor drags it out.
                startedAt: Date.now() - (REPAYMENT_CONFIRMATION_WINDOW_MS - inFlight.retryAfterSeconds * 1000),
            });
            onClose();
            setIsProcessing(false);
            return;
        }
        if (!started) return;

        // Step 2: raise the payment status screen and let it paint *before* the token goes
        // to the super app, so the borrower comes back from the PIN sheet to the wait (and
        // then the verdict) instead of to this keypad. The loan is only updated when the
        // gateway's callback lands; the status screen polls for that.
        startPendingRepayment({ ...about, transactionId: started.transactionId, amount: numericAmount });
        onClose();
        setIsProcessing(false);
        await nextPaint();

        try {
            window.myJsChannel!.postMessage(JSON.stringify({ token: started.paymentToken }));
        } catch (err) {
            console.error('Super app channel rejected the payment token', err);
            abortPendingRepayment(
                started.transactionId,
                // The server cannot tell this payment from one awaiting approval, so it holds
                // the loan for the rest of the confirmation window — hence the wait.
                "We couldn't open the payment screen, so nothing was charged. Please reopen Loans from the app and try again in 2 minutes.",
            );
        }
    };

    const activeInstallment = useMemo(() => {
        const installments = Array.isArray((loan as any)?.installments) ? (loan as any).installments : [];
        return installments.find((i: any) => i && i.isActive);
    }, [loan]);

    const mergedNextInstallment = useMemo(() => {
        const installments = Array.isArray((loan as any)?.installments) ? (loan as any).installments : [];
        if (!activeInstallment) return undefined;
        return installments.find((i: any) =>
            i && i.status === 'Merged' && i.installmentNumber === activeInstallment.installmentNumber + 1
        );
    }, [loan, activeInstallment]);

    const isInstallmentPayment = !!activeInstallment;

    const breakdown = useMemo(() => {
        if (!loan || !loan.product) return { principal: 0, interest: 0, penalty: 0, serviceFee: 0, tax: 0 };

        // Calculate totals with detailed breakdown of what's been paid
        const totals = calculateTotalRepayableDetailed(loan, loan.product, taxConfigs, asOfDate);

        // For installment-based loans - principal is per installment, but interest/penalty on full loan
        if (isInstallmentPayment && activeInstallment) {
            const due = calculateInstallmentDueBreakdown({
                loanDetails: loan,
                loanProduct: loan.product,
                taxConfigs,
                activeInstallment,
                asOfDate,
            });

            return {
                principal: due.principalRemaining,
                interest: due.interestDue,
                penalty: due.penaltyRemaining,
                serviceFee: due.serviceFeeDue,
                tax: due.taxDue,
            };
        }

        // For non-installment loans
        // Use the same payment priority estimation
        const alreadyRepaid = loan.repaidAmount || 0;
        let remaining = alreadyRepaid;

        const penaltyPaid = Math.min(totals.penalty, remaining);
        remaining = Math.max(0, remaining - penaltyPaid);

        const serviceFeePaid = Math.min(totals.serviceFee, remaining);
        remaining = Math.max(0, remaining - serviceFeePaid);

        const interestPaid = Math.min(totals.interest, remaining);
        remaining = Math.max(0, remaining - interestPaid);

        const taxPaid = Math.min(totals.tax, remaining);
        remaining = Math.max(0, remaining - taxPaid);

        const principalPaid = remaining;

        return {
            principal: Math.max(0, totals.principal - principalPaid),
            serviceFee: Math.max(0, totals.serviceFee - serviceFeePaid),
            interest: Math.max(0, totals.interest - interestPaid),
            penalty: Math.max(0, totals.penalty - penaltyPaid),
            tax: Math.max(0, totals.tax - taxPaid),
        };
    }, [loan, taxConfigs, isInstallmentPayment, activeInstallment, asOfDate]);

    const breakdownRows = [
        { label: 'Principal', value: breakdown.principal },
        { label: 'Service fee', value: breakdown.serviceFee },
        { label: 'Daily fee', value: breakdown.interest },
        { label: 'Penalty', value: breakdown.penalty },
        { label: 'Tax', value: breakdown.tax },
    ].filter((row) => row.value > 0.004);

    const isFullAmount = Math.abs((parseFloat(amount) || 0) - totalBalanceDue) < 0.005;
    const keyClass = 'flex h-14 items-center justify-center bg-white text-2xl font-medium text-gray-900 transition active:bg-gray-100 focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-ink disabled:text-gray-300';

    return (
        <BottomSheet
            open={isOpen}
            onOpenChange={(open) => !open && onClose()}
            title="Repay loan"
            description={`${loan?.productName ?? 'Loan'}${activeInstallment ? ` · Installment ${activeInstallment.installmentNumber}` : ''}`}
            closeOnOutsideTap={false}
            style={providerColor ? (brandCssVars(providerColor) as React.CSSProperties) : undefined}
            bodyClassName="px-0 pb-0 pt-3"
        >
            <div className="px-5">
                <div className="text-center">
                    <p className="text-xs font-medium text-gray-500">Amount to pay</p>
                    <p
                        aria-live="polite"
                        className={cn(
                            'mt-1 truncate text-[40px] font-bold leading-tight tabular-nums tracking-tight',
                            error ? 'text-red-600' : 'text-gray-900',
                        )}
                    >
                        {groupDigits(amount)}
                        <span className="ml-1.5 text-lg font-semibold text-gray-400">ETB</span>
                    </p>
                    <div aria-hidden className={cn('mx-auto mt-1 h-1 w-24 rounded-full', error ? 'bg-red-500' : 'bg-brand')} />
                </div>

                <div className="mt-3 flex justify-center">
                    <button
                        type="button"
                        onClick={payFullAmount}
                        aria-pressed={isFullAmount}
                        className={cn(
                            'rounded-full border px-3.5 py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink',
                            isFullAmount ? 'border-transparent bg-brand-soft text-brand-ink' : 'border-gray-300 text-gray-700 hover:bg-gray-50',
                        )}
                    >
                        {isInstallmentPayment ? 'Full amount due' : 'Full balance'} · {formatMoney(totalBalanceDue)}
                    </button>
                </div>

                <div className="mt-3 min-h-[20px] text-center text-sm" aria-live="polite">
                    {error ? (
                        <p className="text-red-600">{error}</p>
                    ) : payError ? (
                        <p role="alert" className="text-red-600">{payError}</p>
                    ) : (
                        <p className="text-gray-500">
                            Left to pay after this: <span className="font-semibold text-gray-900">{formatETB(Math.max(0, remainingAmount))}</span>
                        </p>
                    )}
                </div>

                <button
                    type="button"
                    onClick={() => setShowBreakdown((v) => !v)}
                    aria-expanded={showBreakdown}
                    className="mx-auto mt-2 flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100"
                >
                    What you owe
                    <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showBreakdown && 'rotate-180')} />
                </button>
                {showBreakdown && (
                    <div className="mt-2 rounded-xl bg-gray-50 px-3 py-1.5">
                        {breakdownRows.map((row) => (
                            <DetailRow key={row.label} label={row.label} value={formatMoney(row.value)} className="py-1" />
                        ))}
                        <DetailRow label="Total due" value={formatETB(totalBalanceDue)} strong className="border-t border-gray-200 py-1.5" />
                        {isInstallmentPayment && (
                            <p className="pb-1 text-xs text-gray-500">
                                For installment {activeInstallment.installmentNumber}, with any penalty as of today.
                                {mergedNextInstallment && ` Includes installment ${mergedNextInstallment.installmentNumber}.`}
                            </p>
                        )}
                    </div>
                )}
            </div>

            <div className="mt-4 grid grid-cols-4 gap-px border-t border-gray-200 bg-gray-200 pb-[env(safe-area-inset-bottom)]">
                {KEYS.slice(0, 3).map((key) => (
                    <button key={key} type="button" className={keyClass} onClick={() => handleNumberClick(key)} disabled={isProcessing}>{key}</button>
                ))}
                <button type="button" className={keyClass} onClick={handleBackspace} disabled={isProcessing} aria-label="Delete">
                    <Delete className="h-6 w-6" />
                </button>
                {KEYS.slice(3, 6).map((key) => (
                    <button key={key} type="button" className={keyClass} onClick={() => handleNumberClick(key)} disabled={isProcessing}>{key}</button>
                ))}
                <button
                    type="button"
                    onClick={handleConfirm}
                    disabled={!!error || isProcessing}
                    className="row-span-3 flex flex-col items-center justify-center gap-1 bg-brand text-lg font-semibold text-brand-fg transition active:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-fg disabled:bg-gray-200 disabled:text-gray-400"
                >
                    {isProcessing ? <Loader2 className="h-7 w-7 animate-spin" aria-label="Processing" /> : 'Pay'}
                </button>
                {KEYS.slice(6, 9).map((key) => (
                    <button key={key} type="button" className={keyClass} onClick={() => handleNumberClick(key)} disabled={isProcessing}>{key}</button>
                ))}
                <button type="button" className={cn(keyClass, 'col-span-2')} onClick={() => handleNumberClick('0')} disabled={isProcessing}>0</button>
                <button type="button" className={keyClass} onClick={() => handleNumberClick('.')} disabled={isProcessing} aria-label="Decimal point">.</button>
            </div>
        </BottomSheet>
    );
}
