/**
 * @fileOverview Limits how many statement fetches run at the same time.
 *
 * One statement fetch can take minutes (the first ODS read of the day) and the data API holds a
 * small Oracle pool, so a rush of customers must not become a rush of ODS queries. Fetches run at
 * most STATEMENT_FETCH_CONCURRENCY at a time (default 3); the rest wait in a queue of at most
 * STATEMENT_FETCH_QUEUE (default 50). When that queue is full the fetch is dropped rather than
 * waiting: it happens on the customer's next visit, and scoring goes ahead without the figures.
 *
 * Fetches for the same account are already shared upstream (statement-figures.ts), and the data API
 * fetches an account only once per ODS load, so these limits only shape the traffic of many
 * different accounts at once.
 */

type QueueState = { active: number; waiting: (() => void)[] };

const state: QueueState = ((globalThis as any).__statementFetchQueue ??= { active: 0, waiting: [] });

function limit(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

/** How busy statement fetching is right now (for diagnostics and tests). */
export function fetchQueueState() {
  return { active: state.active, waiting: state.waiting.length };
}

/**
 * Runs `task` when a slot is free. Returns `onBusy()` instead when too many are already waiting.
 */
export async function runWithFetchSlot<T>(task: () => Promise<T>, onBusy: () => T): Promise<T> {
  const maxActive = limit('STATEMENT_FETCH_CONCURRENCY', 3);
  const maxWaiting = limit('STATEMENT_FETCH_QUEUE', 50);

  if (state.active >= maxActive) {
    if (state.waiting.length >= maxWaiting) return onBusy();
    await new Promise<void>((resolve) => state.waiting.push(resolve));
  }

  state.active++;
  try {
    return await task();
  } finally {
    state.active--;
    state.waiting.shift()?.();
  }
}
