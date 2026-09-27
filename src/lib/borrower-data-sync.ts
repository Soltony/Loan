import { parseStoredPayload, storedAccountNumber } from './customer-data-api';
import { loadCustomerInfoCopies, syncCustomerInfo, type CustomerInfoSyncResult } from './customer-info';
import {
  figuresForAccount,
  refreshStatementFigures,
  statementRefreshInProgress,
  type StatementRefreshResult,
} from './statement-figures';

/**
 * @fileOverview Fetches a borrower's customer info and then the statement figures of their account,
 * in the background, and says when new data has landed so the dashboard can recalculate the limit.
 *
 * For a new customer both can take minutes when many arrive at once: the data API reads ODS a few at
 * a time and the rest wait their turn. /api/phone-accounts/fetch-customer answers within seconds
 * while the work carries on; /api/phone-accounts/data-status tells the dashboard when it is done.
 */

export type BorrowerDataSync = {
  customerInfo: Promise<CustomerInfoSyncResult>;
  /** The statement refresh that follows; null when none does or something failed. Never rejects. */
  statement: Promise<StatementRefreshResult | null>;
  /** Settles when both are over. Never rejects. */
  done: Promise<void>;
};

// On globalThis so every route bundle shares it: one sync per borrower's account at a time.
const state: { running: Map<string, BorrowerDataSync> } = ((globalThis as any).__borrowerDataSync ??= {
  running: new Map(),
});

/**
 * Starts fetching the customer info of `accountNumber`, then its statement figures - or joins the
 * fetch already running for this borrower's account. `configId` is only used for a first copy.
 */
export function syncBorrowerData(borrowerId: string, accountNumber: string, configId: string): BorrowerDataSync {
  const key = `${borrowerId}|${accountNumber}`;
  const running = state.running.get(key);
  if (running) return running;

  const customerInfo = syncCustomerInfo(borrowerId, accountNumber, configId);
  // 'stale' = the data API could not be reached and the stored copy is used: no statement either.
  const statement = customerInfo
    .then((result) => (result.ok && result.outcome !== 'stale' ? refreshStatementFigures(borrowerId, accountNumber) : null))
    .catch((err) => {
      console.error('[borrower-data] fetching customer data failed', accountNumber, err);
      return null;
    });
  const sync: BorrowerDataSync = {
    customerInfo,
    statement,
    done: statement.then(() => {
      if (state.running.get(key) === sync) state.running.delete(key);
    }),
  };
  state.running.set(key, sync);
  return sync;
}

/** What is still fetching data for this borrower's account in this process, if anything. */
export function borrowerDataInProgress(borrowerId: string, accountNumber: string): Promise<unknown> | null {
  return state.running.get(`${borrowerId}|${accountNumber}`)?.done ?? statementRefreshInProgress(borrowerId, accountNumber);
}

/**
 * When the stored customer info of `accountNumber` was fetched and its statement figures computed
 * (null when there are none). A change in either means scoring has new data to work with.
 */
export async function storedDataStamps(borrowerId: string, accountNumber: string) {
  const payloads = (await loadCustomerInfoCopies(borrowerId)).map((c) => parseStoredPayload(c.data));
  const copy = payloads.findLast((p) => storedAccountNumber(p) === accountNumber);
  return {
    customerInfoFetchedAt: copy?.fetchedAt ? String(copy.fetchedAt) : null,
    figuresComputedAt: figuresForAccount(payloads, accountNumber)?.computedAt ?? null,
  };
}

/** The result of `promise` if it settles within `ms`, otherwise undefined (it keeps running). */
export async function within<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
