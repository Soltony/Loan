'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { LoanDetails, LoanProvider, Tax } from '@/lib/types';
import { Check, ChevronRight, Wallet } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { calculateInstallmentDueBreakdown } from '@/lib/loan-calculator';
import { RepaymentDialog } from '@/components/loan/repayment-dialog';
import { useToast } from '@/hooks/use-toast';
import { getAsOfDate } from '@/lib/date-utils';
import { MiniAppShell } from '@/components/miniapp/shell';
import { Amount, BrandButton, Panel, ProgressBar, StatusPill, dueTone } from '@/components/miniapp/ui';
import { brandCssVars } from '@/lib/miniapp/brand';
import { dueStatus, formatDate, formatETB, formatMoney, repaidShare } from '@/lib/miniapp/format';

interface HistoryClientProps {
  initialLoanHistory: LoanDetails[];
  providers: LoanProvider[];
  taxConfigs: Tax[];
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

type RepayInfo = { loan: LoanDetails, balanceDue: number, installmentId?: string };

/** What the repay keypad opens with for a loan. */
function repayInfoFor(loan: LoanDetails, taxConfigs: Tax[]): RepayInfo {
  // If the loan has an active installment, default to the full amount due for that
  // installment. This must include the loan-level interest, service fee and tax that
  // are still owed (not just installment principal + penalty), otherwise the dialog's
  // line-item breakdown and the "Total amount to be repaid" disagree and the borrower
  // is blocked from settling outstanding interest/fees.
  const activeInstallment = Array.isArray(loan.installments) ? loan.installments.find(i => i.isActive) : undefined;
  if (activeInstallment && loan.product) {
    const due = calculateInstallmentDueBreakdown({
      loanDetails: loan,
      loanProduct: loan.product,
      taxConfigs,
      activeInstallment,
      asOfDate: getAsOfDate(),
    });
    return { loan, balanceDue: Math.max(0, due.totalDue), installmentId: activeInstallment.id };
  }

  const balanceDue = (loan.totalRepayableAmount ?? 0) - (loan.repaidAmount || 0);
  return { loan, balanceDue: Math.max(0, balanceDue) };
}

export function HistoryClient({ initialLoanHistory, providers, taxConfigs }: HistoryClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  // The loan detail page's Repay button opens this page with ?repay=<loanId>: start with
  // that loan's keypad open.
  const repayParam = searchParams?.get('repay') ?? null;
  const [loanHistory, setLoanHistory] = useState(initialLoanHistory);
  const [activeTab, setActiveTab] = useState('active');
  const [repayingLoanInfo, setRepayingLoanInfo] = useState<RepayInfo | null>(() => {
    const loan = repayParam
      ? initialLoanHistory.find((l) => l.id === repayParam && l.repaymentStatus === 'Unpaid')
      : undefined;
    return loan ? repayInfoFor(loan, taxConfigs) : null;
  });
  const [isRepayDialogOpen, setIsRepayDialogOpen] = useState(() => repayingLoanInfo !== null);
  const asOf = useMemo(() => getAsOfDate(), []);

  useEffect(() => {
    if (!repayParam) return;
    // Drop the parameter so going back or reloading does not open the keypad again.
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.delete('repay');
    window.history.replaceState(null, '', `/history?${params.toString()}`);
  }, [repayParam, searchParams]);

  useEffect(() => {
    setLoanHistory(initialLoanHistory);
  }, [initialLoanHistory]);

  const handleBack = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('repay');
    router.push(`/loan?${params.toString()}`)
  }

  const handleViewDetails = (loanId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('repay');
    router.push(`/history/${loanId}?${params.toString()}`);
  }

  const { activeLoans, closedLoans } = useMemo(() => {
    const active = loanHistory.filter(loan => loan.repaymentStatus === 'Unpaid');
    const closed = loanHistory.filter(loan => loan.repaymentStatus === 'Paid');
    return { activeLoans: active, closedLoans: closed };
  }, [loanHistory]);

  const totalOutstanding = useMemo(() => {
    return activeLoans.reduce((acc, loan) => {
      const balance = loan.totalRepayableAmount ?? 0;
      return acc + Math.max(0, balance - (loan.repaidAmount || 0));
    }, 0);
  }, [activeLoans]);

  const totalCreditAmount = useMemo(() => {
    return loanHistory.reduce((acc, loan) => acc + loan.loanAmount, 0);
  }, [loanHistory]);

  const totalRepaidAmount = useMemo(() => {
    return loanHistory.reduce((acc, loan) => acc + (loan.repaidAmount || 0), 0);
  }, [loanHistory]);

  const handleRepay = (loan: LoanDetails) => {
    setRepayingLoanInfo(repayInfoFor(loan, taxConfigs));
    setIsRepayDialogOpen(true);
  }

  const handleConfirmRepayment = async (amount: number) => {
    if (!repayingLoanInfo) return;
    try {
      const payload: any = { loanId: repayingLoanInfo.loan.id, amount };
      if (repayingLoanInfo.installmentId) payload.installmentId = repayingLoanInfo.installmentId;
      const response = await fetch('/api/payments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to process payment.');
      }

      const updatedLoanData = await response.json();

      const finalLoanObject: LoanDetails = {
        ...updatedLoanData,
        providerName: repayingLoanInfo.loan.providerName,
        productName: repayingLoanInfo.loan.productName,
        product: repayingLoanInfo.loan.product,
        provider: repayingLoanInfo.loan.provider,
        disbursedDate: new Date(updatedLoanData.disbursedDate),
        dueDate: new Date(updatedLoanData.dueDate),
        payments: updatedLoanData.payments,
      };

      setLoanHistory(prevHistory =>
        prevHistory.map(l => l.id === updatedLoanData.id ? finalLoanObject : l)
      );

      toast({
        title: 'Payment Successful',
        description: `${formatETB(amount)} has been paid towards your loan.`,
      });

      try {
        if (typeof window !== 'undefined') {
          const event = new CustomEvent('payment:completed', { detail: { loanId: updatedLoanData.id } });
          window.dispatchEvent(event);
          try {
            const bc = new BroadcastChannel('payments');
            bc.postMessage({ loanId: updatedLoanData.id });
            bc.close();
          } catch (e) {
            // ignore
          }
        }
      } catch (e) {
        // ignore
      }

    } catch (error: any) {
       toast({
        title: 'Payment Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsRepayDialogOpen(false);
      setRepayingLoanInfo(null);
    }
  }

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPayment = () => {
      // Simply reload server data by refreshing the router
      try {
        // dynamic import to avoid circular client/server issues
        // using window.location.reload as fallback if router isn't available in this component
        window.location.reload();
      } catch (e) {
        // ignore
      }
    };

    window.addEventListener('payment:completed', onPayment as EventListener);
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('payments');
      bc.addEventListener('message', onPayment as EventListener);
    } catch (e) {
      // ignore
    }

    return () => {
      window.removeEventListener('payment:completed', onPayment as EventListener);
      try { bc?.close(); } catch (e) { }
    };
  }, []);

  const colorFor = (loan: LoanDetails) =>
    providers.find(p => p.id === loan.product.providerId)?.colorHex || undefined;

  const renderLoanCard = (loan: LoanDetails) => {
    const total = loan.totalRepayableAmount ?? 0;
    const repaid = loan.repaidAmount || 0;
    const balanceDue = total - repaid;
    const isActive = loan.repaymentStatus === 'Unpaid';
    const activeInstallment = Array.isArray(loan.installments) ? loan.installments.find(i => i.isActive) : undefined;
    const due = dueStatus(activeInstallment?.dueDate ?? loan.dueDate, asOf);

    return (
      <Panel
        key={loan.id}
        className="overflow-hidden p-0"
        style={brandCssVars(colorFor(loan)) as React.CSSProperties}
      >
        <button
          type="button"
          onClick={() => handleViewDetails(loan.id)}
          className="block w-full p-4 text-left transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-ink"
        >
          <span className="flex items-start justify-between gap-3">
            <span className="min-w-0">
              <span className="block truncate font-semibold">{loan.productName}</span>
              <span className="mt-0.5 block truncate text-xs text-gray-500">
                {loan.providerName} · Taken {formatDate(loan.disbursedDate)}
              </span>
            </span>
            {isActive ? (
              <StatusPill tone={dueTone(due.tone)}>{due.label}</StatusPill>
            ) : (
              <StatusPill tone="success" icon={<Check className="h-3 w-3" aria-hidden />}>Paid</StatusPill>
            )}
          </span>

          <span className="mt-3 flex items-end justify-between gap-3">
            <span>
              <span className="block text-xs text-gray-500">{isActive ? 'Outstanding' : 'Borrowed'}</span>
              <Amount value={formatMoney(isActive && balanceDue > 0 ? balanceDue : loan.loanAmount)} className="text-xl" />
            </span>
            <span className="flex items-center text-sm font-medium text-gray-500">
              Details
              <ChevronRight className="h-4 w-4" aria-hidden />
            </span>
          </span>

          {isActive ? (
            <span className="mt-3 block">
              <ProgressBar value={repaidShare(repaid, total)} label="Share of the loan repaid" />
              <span className="mt-1.5 block text-xs text-gray-500">
                Repaid {formatMoney(repaid)} of {formatMoney(total)} ETB · Due {formatDate(activeInstallment?.dueDate ?? loan.dueDate)}
              </span>
            </span>
          ) : (
            <span className="mt-1 block text-xs text-gray-500">Repaid {formatETB(repaid)}</span>
          )}
        </button>
        {isActive && (
          <div className="border-t border-gray-100 p-3">
            <BrandButton block onClick={() => handleRepay(loan)}>Repay</BrandButton>
          </div>
        )}
      </Panel>
    );
  }

  const emptyState = (title: string, body: string, withAction: boolean) => (
    <Panel className="flex flex-col items-center px-6 py-10 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gray-100 text-gray-500" aria-hidden>
        <Wallet className="h-6 w-6" />
      </span>
      <p className="mt-3 font-semibold">{title}</p>
      <p className="mt-1 text-sm text-gray-500">{body}</p>
      {withAction && (
        <BrandButton className="mt-5" onClick={handleBack}>Borrow now</BrandButton>
      )}
    </Panel>
  );

  const triggerClass =
    'h-9 rounded-lg text-sm font-semibold text-gray-600 data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm';

  return (
    <MiniAppShell brandColor={providers[0]?.colorHex} title="My loans" onBack={handleBack}>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid h-11 w-full grid-cols-2 rounded-xl bg-gray-200/70 p-1">
          <TabsTrigger value="active" className={triggerClass}>Active ({activeLoans.length})</TabsTrigger>
          <TabsTrigger value="closed" className={triggerClass}>Closed ({closedLoans.length})</TabsTrigger>
        </TabsList>

        <Panel className="mt-4">
          {activeTab === 'active' ? (
            <>
              <p className="text-xs font-medium text-gray-500">Total outstanding</p>
              <Amount value={formatMoney(totalOutstanding)} className="mt-0.5 block text-[28px] leading-tight" />
              <p className="mt-1 text-sm text-gray-500">
                {activeLoans.length === 0 ? 'Nothing to repay' : `Across ${plural(activeLoans.length, 'active loan', 'active loans')}`}
              </p>
            </>
          ) : (
            <>
              <p className="text-xs font-medium text-gray-500">Repaid to date</p>
              <Amount value={formatMoney(totalRepaidAmount)} className="mt-0.5 block text-[28px] leading-tight" />
              <p className="mt-1 text-sm text-gray-500">
                {plural(closedLoans.length, 'loan', 'loans')} closed · {formatETB(totalCreditAmount)} borrowed in total
              </p>
            </>
          )}
        </Panel>

        <TabsContent value="active" className="mt-4">
          <div className="space-y-3">
            {activeLoans.length > 0
              ? activeLoans.map(renderLoanCard)
              : emptyState('No active loans', 'Loans you take will appear here.', true)}
          </div>
        </TabsContent>
        <TabsContent value="closed" className="mt-4">
          <div className="space-y-3">
            {closedLoans.length > 0
              ? closedLoans.map(renderLoanCard)
              : emptyState('No closed loans yet', 'Loans you have fully repaid will appear here.', false)}
          </div>
        </TabsContent>
      </Tabs>

      {repayingLoanInfo && (
        <RepaymentDialog
          isOpen={isRepayDialogOpen}
          onClose={() => setIsRepayDialogOpen(false)}
          onConfirm={handleConfirmRepayment}
          loan={repayingLoanInfo.loan}
          totalBalanceDue={repayingLoanInfo.balanceDue}
          providerColor={colorFor(repayingLoanInfo.loan)}
          taxConfigs={taxConfigs}
          asOfDate={asOf}
        />
      )}
    </MiniAppShell>
  );
}
