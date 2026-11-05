'use client';

import React, { useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { LoanDetails } from '@/lib/types';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { MiniAppShell } from '@/components/miniapp/shell';
import { Amount, BrandButton, DetailRow, Panel, ProgressBar, SectionTitle, StatusPill, dueTone } from '@/components/miniapp/ui';
import { dueStatus, formatDate, formatDateTime, formatETB, formatMoney, repaidShare } from '@/lib/miniapp/format';

interface LoanDetailClientProps {
    loanDetails: LoanDetails;
    /** Today, for the due-date status. */
    asOfDate?: Date;
}

export function LoanDetailClient({ loanDetails, asOfDate }: LoanDetailClientProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();

    const handleBack = () => {
        const params = new URLSearchParams(searchParams.toString());
        router.push(`/history?${params.toString()}`);
    }

    // Repaying needs the loan's installments, which the history page has: open its keypad.
    const handleRepay = () => {
        const params = new URLSearchParams(searchParams?.toString() ?? '');
        params.set('repay', loanDetails.id);
        router.push(`/history?${params.toString()}`);
    }

    const copyReference = async () => {
        try {
            await navigator.clipboard.writeText(loanDetails.id);
            toast({ title: 'Reference copied' });
        } catch {
            toast({ title: 'Could not copy', description: 'Press and hold the reference to copy it.' });
        }
    }

    const { total, principal, interest, penalty, serviceFee, tax } = useMemo(() => {
        if (loanDetails.calculatedRepayment) {
            return loanDetails.calculatedRepayment;
        }
        // Fallback for older data that might not have the pre-calculated value
        const estimate = {
            total: loanDetails.loanAmount + loanDetails.serviceFee,
            principal: loanDetails.loanAmount,
            interest: 0,
            penalty: 0,
            serviceFee: loanDetails.serviceFee,
            tax: 0,
        };
        return estimate;
    }, [loanDetails]);

    const repaid = loanDetails.repaidAmount || 0;
    const totalOutstanding = Math.max(0, total - repaid);
    const isPaid = loanDetails.repaymentStatus === 'Paid' || totalOutstanding <= 0.01;
    const due = dueStatus(loanDetails.dueDate, asOfDate ?? new Date());
    const providerColor = loanDetails.product.provider?.colorHex || undefined;
    const serviceFeeRule = loanDetails.product.serviceFee;

    return (
        <MiniAppShell
            brandColor={providerColor}
            title="Loan details"
            onBack={handleBack}
            footer={!isPaid ? <BrandButton block size="lg" onClick={handleRepay}>Repay</BrandButton> : undefined}
        >
            <Panel>
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <p className="truncate font-semibold">{loanDetails.productName}</p>
                        <p className="mt-0.5 truncate text-xs text-gray-500">{loanDetails.providerName}</p>
                    </div>
                    {isPaid ? (
                        <StatusPill tone="success" icon={<Check className="h-3 w-3" aria-hidden />}>Paid</StatusPill>
                    ) : (
                        <StatusPill tone={dueTone(due.tone)}>{due.label}</StatusPill>
                    )}
                </div>
                <p className="mt-4 text-xs font-medium text-gray-500">{isPaid ? 'Repaid in full' : 'Outstanding'}</p>
                <Amount value={formatMoney(isPaid ? repaid : totalOutstanding)} className="block text-[32px] leading-tight" />
                <div className="mt-4">
                    <ProgressBar
                        value={isPaid ? 1 : repaidShare(repaid, total)}
                        label="Share of the loan repaid"
                        barClassName={isPaid ? 'bg-emerald-600' : undefined}
                    />
                    <p className="mt-1.5 text-xs text-gray-500">
                        Repaid {formatMoney(repaid)} of {formatMoney(total)} ETB
                    </p>
                </div>
            </Panel>

            <SectionTitle>Breakdown</SectionTitle>
            <Panel className="py-2">
                <DetailRow label="Loan amount" value={formatMoney(principal)} />
                {serviceFee > 0 && (
                    <DetailRow
                        label="Service fee"
                        hint={serviceFeeRule?.type === 'percentage' ? `${serviceFeeRule.value}% of the loan` : undefined}
                        value={formatMoney(serviceFee)}
                    />
                )}
                {interest > 0 && <DetailRow label="Daily fee" value={formatMoney(interest)} />}
                {penalty > 0 && <DetailRow label="Late penalty" value={formatMoney(penalty)} valueClassName="text-red-700" />}
                {tax > 0 && <DetailRow label="Tax" value={formatMoney(tax)} />}
                <DetailRow label="Total" value={formatETB(total)} strong className="mt-1 border-t border-gray-100 pt-2.5" />
                <DetailRow label="Repaid" value={`− ${formatMoney(repaid)}`} />
                <DetailRow label="Outstanding" value={formatETB(totalOutstanding)} strong />
            </Panel>

            <SectionTitle>Dates</SectionTitle>
            <Panel className="py-2">
                <DetailRow label="Taken on" value={formatDate(loanDetails.disbursedDate)} />
                <DetailRow label="Due date" value={formatDate(loanDetails.dueDate)} />
            </Panel>

            <SectionTitle>Repayments</SectionTitle>
            <Panel className="p-0">
                {loanDetails.payments.length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-gray-500">No repayments yet.</p>
                ) : (
                    <ul className="divide-y divide-gray-100">
                        {loanDetails.payments.map((payment) => {
                            const refund = payment.amount < 0;
                            return (
                                <li key={payment.id} className="flex items-center justify-between gap-3 px-4 py-3">
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium">{refund ? 'Refund' : 'Repayment'}</p>
                                        <p className="text-xs text-gray-500">{formatDateTime(payment.date)}</p>
                                    </div>
                                    <p className={cn('shrink-0 font-semibold tabular-nums', refund ? 'text-red-700' : 'text-emerald-700')}>
                                        {refund ? '−' : '+'} {formatMoney(Math.abs(payment.amount))}
                                    </p>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </Panel>

            <SectionTitle>Reference</SectionTitle>
            <Panel className="flex items-center gap-3">
                <p className="min-w-0 flex-1 select-all break-all font-mono text-xs text-gray-700">{loanDetails.id}</p>
                <BrandButton variant="outline" size="sm" onClick={copyReference}>
                    <Copy className="h-4 w-4" aria-hidden />
                    Copy
                </BrandButton>
            </Panel>
        </MiniAppShell>
    );
}
