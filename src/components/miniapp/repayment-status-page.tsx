'use client';

/**
 * The repayment as a screen of its own, from the hand-off to the super app's PIN sheet
 * to the verdict.
 *
 * The money is collected by the super app, not by us: once the token goes over the JS
 * channel the borrower leaves our webview and comes back to whatever we were showing.
 * A toast over the dashboard was the wrong thing to come back to — the balance still
 * shows the old figure and the Repay button is still there, which reads as "nothing
 * happened" and invites a second payment. A full screen has one thing on it, survives
 * the trip to the wallet and back, and cannot be tapped through while the answer is
 * still unknown.
 */
import * as React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { CheckCircle2, Clock3, Loader2, ShieldCheck, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { brandCssVars } from '@/lib/miniapp/brand';
import { formatDate, formatDateTime, formatMoney } from '@/lib/miniapp/format';
import { BrandButton, DetailRow, StatusPill } from './ui';

/**
 * - waiting      token handed over, no callback yet (still inside the poll window)
 * - success      the callback booked the repayment
 * - not-applied  the callback arrived but refused the amount (PendingPayment FAILED):
 *                money may have left the borrower, nothing reached the loan
 * - not-started  the token never reached the super app: nothing was charged
 * - unconfirmed  the poll window ran out with the payment still PENDING; a cancelled
 *                PIN sheet looks exactly like this, so it is not called a failure
 */
export type RepaymentStatus = 'waiting' | 'success' | 'not-applied' | 'not-started' | 'unconfirmed';

export interface RepaymentOutcome {
  /** The amount the server holds for this payment. */
  amount: number | null;
  settledAt: string | null;
  fullyRepaid: boolean;
  outstanding: number | null;
  nextDue: { date: string; installmentNumber: number | null; installmentCount: number | null } | null;
}

interface Props {
  status: RepaymentStatus;
  amount: number;
  productName: string;
  providerName: string | null;
  providerColor: string | null;
  transactionId: string;
  outcome: RepaymentOutcome | null;
  /** Why the payment did not start, when the hand-off itself failed. */
  message: string | null;
  checking: boolean;
  onCheckAgain: () => void;
  onDone: () => void;
}

const TONE: Record<RepaymentStatus, { badge: string; wash: string; title: string; glow: string }> = {
  // glow: plain rgba / CSS variables — color-mix() is missing from older Android webviews.
  waiting: { badge: 'border-gray-200', wash: 'bg-brand-soft', title: 'text-gray-900', glow: 'var(--brand-soft)' },
  success: { badge: 'border-emerald-200', wash: 'bg-emerald-50', title: 'text-emerald-700', glow: 'rgba(16,185,129,0.16)' },
  'not-applied': { badge: 'border-red-200', wash: 'bg-red-50', title: 'text-red-700', glow: 'rgba(239,68,68,0.14)' },
  'not-started': { badge: 'border-red-200', wash: 'bg-red-50', title: 'text-red-700', glow: 'rgba(239,68,68,0.14)' },
  unconfirmed: { badge: 'border-amber-200', wash: 'bg-amber-50', title: 'text-amber-800', glow: 'rgba(245,158,11,0.16)' },
};

function Badge({ status }: { status: RepaymentStatus }) {
  const tone = TONE[status];
  const settled = status !== 'waiting';
  return (
    <div className="relative flex h-28 w-28 shrink-0 items-center justify-center">
      {/* Only the wait animates: a verdict that keeps pulsing reads as still deciding. */}
      {status === 'waiting' && (
        <span aria-hidden className="absolute inset-1 animate-ping rounded-full bg-brand-soft" style={{ animationDuration: '2.2s' }} />
      )}
      <span aria-hidden className={cn('absolute inset-0 rounded-full', tone.wash)} />
      <span
        className={cn(
          'relative flex h-[5.5rem] w-[5.5rem] items-center justify-center rounded-full border-2 bg-white shadow-[0_10px_30px_-12px_rgba(16,24,40,0.35)]',
          tone.badge,
          settled && 'animate-in zoom-in-50 duration-500',
        )}
      >
        {status === 'waiting' && <Loader2 className="h-10 w-10 animate-spin text-brand-ink" strokeWidth={2.25} />}
        {status === 'success' && <CheckCircle2 className="h-11 w-11 text-emerald-600" strokeWidth={2.25} />}
        {(status === 'not-applied' || status === 'not-started') && (
          <XCircle className="h-11 w-11 text-red-600" strokeWidth={2.25} />
        )}
        {status === 'unconfirmed' && <Clock3 className="h-11 w-11 text-amber-600" strokeWidth={2.25} />}
      </span>
    </div>
  );
}

function headline(status: RepaymentStatus, outcome: RepaymentOutcome | null) {
  switch (status) {
    case 'waiting':
      return 'Confirming your payment…';
    case 'success':
      return outcome?.fullyRepaid ? 'Loan fully repaid' : 'Payment successful';
    case 'not-applied':
      return 'Payment not applied';
    case 'not-started':
      return "Payment didn't start";
    case 'unconfirmed':
      return 'Still waiting for confirmation';
  }
}

function explanation(status: RepaymentStatus, props: Props) {
  const amount = `${formatMoney(props.outcome?.amount ?? props.amount)} ETB`;
  switch (status) {
    case 'waiting':
      return `Approve the payment of ${amount} in the app. This screen updates as soon as it is confirmed.`;
    case 'success':
      return props.outcome?.fullyRepaid
        ? `You have paid off your ${props.productName} loan. Thank you!`
        : `${amount} has been paid towards your ${props.productName} loan.`;
    case 'not-applied':
      return 'This payment was more than your loan owed when it arrived, so it was not applied to your loan. If money left your account, please do not pay again — our team will review it. Keep the reference below.';
    case 'not-started':
      return props.message || 'We could not open the payment screen, so nothing was charged. Please try again.';
    case 'unconfirmed':
      return 'We have not heard back about this payment yet. If you approved it, it will show on your loan within a few minutes. If you cancelled, nothing was charged. Please do not pay again until your loan shows the update.';
  }
}

function nextDueLabel(nextDue: NonNullable<RepaymentOutcome['nextDue']>) {
  if (nextDue.installmentNumber) {
    const of = nextDue.installmentCount && nextDue.installmentCount > 1 ? ` of ${nextDue.installmentCount}` : '';
    return `Installment ${nextDue.installmentNumber}${of} · ${formatDate(nextDue.date)}`;
  }
  return formatDate(nextDue.date);
}

export function RepaymentStatusPage(props: Props) {
  const { status, outcome, transactionId, productName, providerName, providerColor, checking, onCheckAgain, onDone } = props;
  const settled = status !== 'waiting';
  const tone = TONE[status];
  const amount = outcome?.amount ?? props.amount;

  return (
    <Dialog.Root open>
      <Dialog.Portal>
        {/* Opaque, not a scrim: anything showing through is something the borrower
            might tap mid-payment — the Repay button above all. */}
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-gray-100 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby="repayment-status-explanation"
          // Nothing dismisses this while the money is in flight — not a tap outside, not
          // Escape. The way out appears once there is an outcome to accept.
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => {
            if (!settled) e.preventDefault();
            else onDone();
          }}
          style={providerColor ? (brandCssVars(providerColor) as React.CSSProperties) : undefined}
          className="miniapp fixed inset-0 z-[100] flex flex-col items-center overflow-y-auto px-4 text-gray-900 outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0"
        >
          {/* Colour wash behind the badge, so the state reads before a word does. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-[60%]"
            style={{ background: `radial-gradient(62% 52% at 50% 20%, ${tone.glow}, transparent 72%)` }}
          />

          <div
            className="relative my-auto flex w-full max-w-sm flex-col items-center text-center"
            style={{
              paddingTop: 'calc(env(safe-area-inset-top, 0px) + 2rem)',
              paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 2rem)',
            }}
          >
            <Badge status={status} />

            {/* Announced rather than only drawn: the borrower may still be looking at the
                super app's own sheet when this flips. */}
            <div aria-live="polite" className="w-full">
              <Dialog.Title className={cn('mt-6 text-[26px] font-bold leading-tight tracking-tight', tone.title)}>
                {headline(status, outcome)}
              </Dialog.Title>
              <p id="repayment-status-explanation" className="mx-auto mt-2 max-w-[20rem] text-sm leading-relaxed text-gray-500">
                {explanation(status, props)}
              </p>
            </div>

            <div className="mt-7 w-full overflow-hidden rounded-2xl border border-gray-200/80 bg-white text-left shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
              <div className="px-4 py-3.5">
                <p className="text-xs font-medium text-gray-500">
                  {status === 'success' ? 'Amount paid' : 'Amount'}
                </p>
                <p className="mt-0.5 text-[28px] font-bold leading-tight tabular-nums tracking-tight">
                  {formatMoney(amount)}
                  <span className="ml-1.5 text-sm font-semibold text-gray-400">ETB</span>
                </p>
                <p className="mt-1 truncate text-sm text-gray-500">
                  {productName}
                  {providerName ? ` · ${providerName}` : ''}
                </p>
              </div>

              <div className="border-t border-gray-100 bg-gray-50/70 px-4 py-2">
                {status === 'success' && outcome && (
                  <>
                    <DetailRow
                      label="Left to pay"
                      value={
                        outcome.fullyRepaid ? (
                          <StatusPill tone="success">Fully repaid</StatusPill>
                        ) : (
                          `${formatMoney(outcome.outstanding)} ETB`
                        )
                      }
                      strong
                    />
                    {outcome.nextDue && <DetailRow label="Next due" value={nextDueLabel(outcome.nextDue)} />}
                  </>
                )}
                {outcome?.settledAt && (status === 'success' || status === 'not-applied') && (
                  <DetailRow label={status === 'success' ? 'Paid on' : 'Received on'} value={formatDateTime(outcome.settledAt)} />
                )}
                <DetailRow
                  label="Reference"
                  value={<span className="break-all font-mono text-xs text-gray-600">{transactionId}</span>}
                  valueClassName="max-w-[62%]"
                />
              </div>
            </div>

            {status === 'waiting' ? (
              <p className="mt-6 flex items-start gap-2 rounded-xl bg-white/80 px-3.5 py-2.5 text-left text-xs leading-relaxed text-gray-600 ring-1 ring-inset ring-gray-200">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" aria-hidden />
                Keep this screen open and do not pay again while we confirm. It can take up to a minute after you approve.
              </p>
            ) : status === 'unconfirmed' ? (
              <div className="mt-6 grid w-full gap-2.5">
                <BrandButton autoFocus size="lg" block loading={checking} onClick={onCheckAgain}>
                  Check again
                </BrandButton>
                <BrandButton variant="outline" size="lg" block onClick={onDone} disabled={checking}>
                  Close
                </BrandButton>
              </div>
            ) : (
              <BrandButton
                autoFocus
                variant={status === 'success' ? 'solid' : 'outline'}
                size="lg"
                block
                className="mt-6"
                onClick={onDone}
              >
                {status === 'not-started' ? 'Close' : 'Done'}
              </BrandButton>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
