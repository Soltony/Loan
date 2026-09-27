/**
 * @fileOverview Limits how many statement fetches run at the same time.
 *
 * One statement fetch can take minutes (the first ODS read of the day) and the data API holds a
 * small Oracle pool, so a rush of customers must not become a rush of ODS queries. Fetches run at
 * most STATEMENT_FETCH_CONCURRENCY at a time (default 3); the rest wait their turn, first come first
 * served. Only past STATEMENT_FETCH_QUEUE waiting (default 1000, a safety limit) is a fetch dropped;
 * it then happens on the customer's next visit, and scoring goes ahead without the figures.
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
  const maxWaiting = limit('STATEMENT_FETCH_QUEUE', 1000);

  if (state.active >= maxActive || state.waiting.length > 0) {
    if (state.waiting.length >= maxWaiting) return onBusy();
    // Resolved by a finishing task, which hands its slot straight to us: nobody can take it in
    // between, so the order holds and the limit is never exceeded.
    await new Promise<void>((resolve) => state.waiting.push(resolve));
  } else {
    state.active++;
  }

  try {
    return await task();
  } finally {
    const next = state.waiting.shift();
    if (next) next();
    else state.active--;
  }
}
