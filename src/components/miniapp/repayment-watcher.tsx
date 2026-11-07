'use client';

/**
 * Watches a repayment the super app is collecting, from anywhere in the mini-app.
 *
 * It sits in MiniAppShell rather than in the repayment keypad on purpose: the keypad
 * is a bottom sheet that closes the moment the token is handed over, the borrower is
 * carried off to the super app's PIN sheet, and on some builds the webview is reloaded
 * underneath. A watcher mounted at the top survives all of that and picks a wait back up
 * from what `pending-repayment` wrote down.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clearPendingRepayment,
  readPendingRepayment,
  subscribeRepaymentAborted,
  subscribeRepaymentStarted,
  type PendingRepayment,
} from '@/lib/miniapp/pending-repayment';
import { REPAYMENT_CONFIRMATION_WINDOW_MS } from '@/lib/repayment-window';
import { RepaymentStatusPage, type RepaymentOutcome, type RepaymentStatus } from './repayment-status-page';

const POLL_INTERVAL_MS = 2000;
/**
 * From the moment the payment was started, so a wait resumed after a reload gets what is
 * left of it. The same window /api/initiate-payment blocks a second payment for, so
 * "still waiting" appears exactly when paying again becomes possible.
 */
const POLL_WINDOW_MS = REPAYMENT_CONFIRMATION_WINDOW_MS;
/** A "Check again" after the window ran out polls for this much longer. */
const RECHECK_WINDOW_MS = 30_000;

/*
 * Unlike a gateway that reports failures, ours only ever calls back for money it took.
 * So there is no grace period before showing a failure: FAILED is written by our own
 * callback when it refuses the amount, and it is final (the callback ignores a payment
 * that is no longer PENDING). What there is instead is silence — a cancelled PIN sheet
 * sends nothing — which is why running out of time is "unconfirmed", never "failed".
 */

interface StatusResponse {
  status: string;
  amount: number;
  settledAt: string | null;
  loan: {
    id: string;
    fullyRepaid: boolean;
    outstanding: number;
    nextDue: RepaymentOutcome['nextDue'];
  } | null;
}

export function RepaymentWatcher() {
  const [pending, setPending] = useState<PendingRepayment | null>(null);
  const [status, setStatus] = useState<RepaymentStatus>('waiting');
  const [outcome, setOutcome] = useState<RepaymentOutcome | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Bumped on every new wait, so a response for an earlier one is ignored. */
  const generation = useRef(0);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  /** Polls until the payment settles or `deadline` (epoch ms) passes. */
  const poll = useCallback(
    (payment: PendingRepayment, deadline: number) => {
      stopPolling();
      const run = generation.current;

      const tick = async () => {
        pollTimer.current = null;
        let data: StatusResponse | null = null;
        try {
          const res = await fetch(`/api/payments/status/${encodeURIComponent(payment.transactionId)}`, {
            cache: 'no-store',
          });
          if (run !== generation.current) return;
          if (res.status === 404) {
            // Not this borrower's payment, or it no longer exists: nothing to show.
            clearPendingRepayment();
            setPending(null);
            return;
          }
          if (res.ok) data = (await res.json()) as StatusResponse;
        } catch {
          // A blip inside the webview; the next tick retries.
        }
        if (run !== generation.current) return;

        if (data && (data.status === 'COMPLETED' || data.status === 'FAILED')) {
          // Settled either way: a reload from here must land on the app, not on this screen.
          clearPendingRepayment();
          setChecking(false);
          setOutcome({
            amount: typeof data.amount === 'number' ? data.amount : payment.amount,
            settledAt: data.settledAt,
            fullyRepaid: Boolean(data.loan?.fullyRepaid),
            outstanding: data.loan?.outstanding ?? null,
            nextDue: data.loan?.nextDue ?? null,
          });
          setStatus(data.status === 'COMPLETED' ? 'success' : 'not-applied');
          return;
        }

        if (data?.status === 'NOT_STARTED') {
          clearPendingRepayment();
          setChecking(false);
          setMessage('This payment could not be started, so nothing was charged. You can try again now.');
          setStatus('not-started');
          return;
        }

        if (Date.now() >= deadline) {
          // Kept in storage: a reload inside the resume window checks once more.
          setChecking(false);
          setStatus('unconfirmed');
          return;
        }
        pollTimer.current = setTimeout(tick, POLL_INTERVAL_MS);
      };

      void tick();
    },
    [stopPolling],
  );

  const watch = useCallback(
    (payment: PendingRepayment) => {
      generation.current += 1;
      setPending(payment);
      setStatus('waiting');
      setOutcome(null);
      setMessage(null);
      setChecking(false);
      poll(payment, payment.startedAt + POLL_WINDOW_MS);
    },
    [poll],
  );

  // A wait already under way when this mounted — the webview was reloaded while the
  // super app had the screen. A record past the poll window still gets one check.
  // Read after mount, never during render: the shell is server-rendered, and a screen
  // drawn from localStorage on the first client render would not match it.
  useEffect(() => {
    const timer = setTimeout(() => {
      const resumed = readPendingRepayment();
      if (resumed) watch(resumed);
    }, 0);
    return () => clearTimeout(timer);
  }, [watch]);

  useEffect(() => subscribeRepaymentStarted(watch), [watch]);

  // The token never reached the super app: nothing is in flight, the verdict is final.
  useEffect(
    () =>
      subscribeRepaymentAborted(({ message: reason }) => {
        generation.current += 1;
        stopPolling();
        setStatus('not-started');
        setMessage(reason);
        setOutcome(null);
        setChecking(false);
      }),
    [stopPolling],
  );

  if (!pending) return null;

  const checkAgain = () => {
    generation.current += 1;
    setChecking(true);
    poll(pending, Date.now() + RECHECK_WINDOW_MS);
  };

  const done = () => {
    generation.current += 1;
    stopPolling();
    clearPendingRepayment();
    if (status === 'success') {
      // Fired only now, not when the verdict arrived: the loan history screen reloads
      // the page on this event, which would wipe the verdict before it was read.
      try {
        window.dispatchEvent(new CustomEvent('payment:completed', { detail: { loanId: pending.loanId } }));
      } catch {
        // ignore
      }
    }
    setPending(null);
  };

  return (
    <RepaymentStatusPage
      status={status}
      amount={pending.amount}
      productName={pending.productName}
      providerName={pending.providerName}
      providerColor={pending.providerColor}
      transactionId={pending.transactionId}
      rejoined={Boolean(pending.rejoined)}
      outcome={outcome}
      message={message}
      checking={checking}
      onCheckAgain={checkAgain}
      onDone={done}
    />
  );
}
