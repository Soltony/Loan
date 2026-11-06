'use client';

/**
 * The repayment currently in flight, held outside React.
 *
 * Handing the payment token to the super app takes the screen away from us: the host
 * raises its own PIN sheet, and on some builds reloads the webview underneath while
 * doing it. Component state (the open keypad, which loan was being paid) is gone by the
 * time the borrower is back, so the wait is written to localStorage instead and the
 * repayment watcher picks it back up on boot.
 *
 * localStorage rather than sessionStorage: a host that destroys the webview and builds a
 * new one starts a fresh session. The record is small, expires on its own and is cleared
 * as soon as the borrower dismisses the verdict.
 */

export interface PendingRepayment {
  /** PendingPayment.transactionId from /api/initiate-payment. */
  transactionId: string;
  loanId: string;
  amount: number;
  productName: string;
  providerName: string | null;
  /** Provider brand colour, so a resumed screen keeps the lender's colours. */
  providerColor: string | null;
  /** Epoch ms. */
  startedAt: number;
}

const KEY = 'loan.pending-repayment';
const STARTED_EVENT = 'loan:repayment-started';
const ABORTED_EVENT = 'loan:repayment-aborted';

/**
 * How long a written-down wait is still worth resuming after a reload.
 *
 * Longer than the watcher's poll window on purpose: a borrower who comes back after the
 * window still gets one fresh check and an answer, instead of the payment silently
 * disappearing from the screen.
 */
export const PENDING_RESUME_MAX_AGE_MS = 15 * 60_000;

/** Storage throws outright in some webview privacy modes; never let it bubble. */
function write(value: PendingRepayment | null) {
  try {
    if (value) window.localStorage.setItem(KEY, JSON.stringify(value));
    else window.localStorage.removeItem(KEY);
  } catch {
    // The wait degrades to component state.
  }
}

/** The repayment in flight, or null. Anything unparseable or expired is cleared. */
export function readPendingRepayment(): PendingRepayment | null {
  if (typeof window === 'undefined') return null;

  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as PendingRepayment;
    if (
      !parsed?.transactionId ||
      typeof parsed.startedAt !== 'number' ||
      Date.now() - parsed.startedAt > PENDING_RESUME_MAX_AGE_MS
    ) {
      write(null);
      return null;
    }
    return parsed;
  } catch {
    write(null);
    return null;
  }
}

/**
 * Opens the wait: writes it down and raises the status screen. Called before the token
 * goes to the super app, so the waiting screen is already up under the PIN sheet.
 */
export function startPendingRepayment(payment: Omit<PendingRepayment, 'startedAt'>): PendingRepayment {
  const record: PendingRepayment = { ...payment, startedAt: Date.now() };
  write(record);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<PendingRepayment>(STARTED_EVENT, { detail: record }));
  }
  return record;
}

/** The token never reached the super app, so nothing was charged and there is nothing to wait for. */
export function abortPendingRepayment(transactionId: string, message: string) {
  write(null);
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(ABORTED_EVENT, { detail: { transactionId, message } }));
}

export function clearPendingRepayment() {
  write(null);
}

function listen<T>(event: string, handler: (detail: T) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const wrapped = (raw: Event) => handler((raw as CustomEvent<T>).detail);
  window.addEventListener(event, wrapped);
  return () => window.removeEventListener(event, wrapped);
}

export const subscribeRepaymentStarted = (handler: (payment: PendingRepayment) => void) =>
  listen<PendingRepayment>(STARTED_EVENT, handler);

export const subscribeRepaymentAborted = (handler: (outcome: { transactionId: string; message: string }) => void) =>
  listen<{ transactionId: string; message: string }>(ABORTED_EVENT, handler);

/**
 * Resolves once the browser has drawn a frame.
 *
 * A React state update only schedules a render. Posting the token in the same task hands
 * the screen to the super app before the waiting screen exists, so the borrower comes
 * back from the PIN sheet to the keypad they just left. Two frames cover the commit and
 * the paint; the timeout covers a webview that has stopped animating.
 */
export function nextPaint(timeoutMs = 250): Promise<void> {
  if (typeof window === 'undefined' || typeof requestAnimationFrame !== 'function') {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(finish, 0)));
    setTimeout(finish, timeoutMs);
  });
}
