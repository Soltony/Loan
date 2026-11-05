/**
 * Report requests, without a data library. Each URL is fetched once and kept
 * for a minute (switching tabs back and forth does not re-ask the server). Each
 * hook owns a slot: a filter change cancels the slot's request and the rows on
 * screen stay until the new ones arrive. Refresh drops everything kept.
 *
 * Plain module state, read by the hooks through useSyncExternalStore.
 */

export const STALE_MS = 60_000;

export interface Snapshot {
  /** One value per URL that answered; the previous set while a request runs. */
  data?: unknown[];
  error?: unknown;
  fetching: boolean;
}

export const IDLE: Snapshot = Object.freeze({ fetching: false });

interface CacheEntry {
  data: unknown;
  at: number;
}

const cache = new Map<string, CacheEntry>();
const snapshots = new Map<string, Snapshot>();
const controllers = new Map<string, AbortController>();
const listeners = new Set<() => void>();
let generation = 0;
let inFlight = 0;

function notify() {
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const getGeneration = () => generation;
export const isFetching = () => inFlight > 0;
export const snapshotOf = (slot: string): Snapshot => snapshots.get(slot) ?? IDLE;

function setSnapshot(slot: string, snapshot: Snapshot) {
  snapshots.set(slot, snapshot);
  notify();
}

/** Forgets every report kept, so whatever is on screen is fetched again. */
export function refreshReports() {
  cache.clear();
  generation += 1;
  notify();
}

export class ReportError extends Error {}

async function fetchJson(url: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { signal, cache: 'no-store' });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
    throw new ReportError(body.error || body.message || `The report could not be loaded (${response.status}).`);
  }
  return response.json();
}

/** Stops the slot's running request; what it shows stays. */
export function cancelSlot(slot: string) {
  controllers.get(slot)?.abort();
  controllers.delete(slot);
}

/** Drops a slot whose hook has gone. */
export function forgetSlot(slot: string) {
  cancelSlot(slot);
  snapshots.delete(slot);
}

const FAILED = Symbol('failed');

/**
 * Fills the slot with the URLs' reports: kept ones at once, the rest from the
 * server (`force` asks the server for all of them). Answers are delivered
 * together; if none came back, the slot keeps what it showed, under the error.
 */
export function loadSlot(slot: string, urls: string[], force = false, now = Date.now()): void {
  cancelSlot(slot);
  const shown = snapshotOf(slot).data;
  const hits = urls.map((url) => {
    const hit = cache.get(url);
    return hit && !force && now - hit.at < STALE_MS ? hit : undefined;
  });
  if (hits.every(Boolean)) {
    setSnapshot(slot, { data: hits.map((hit) => hit!.data), fetching: false });
    return;
  }

  const controller = new AbortController();
  controllers.set(slot, controller);
  setSnapshot(slot, { data: shown, fetching: true });
  let firstError: unknown;
  void Promise.all(
    urls.map((url, i): unknown => {
      const hit = hits[i];
      if (hit) return hit.data;
      inFlight += 1;
      return fetchJson(url, controller.signal)
        .then((data) => {
          cache.set(url, { data, at: Date.now() });
          return data;
        })
        .catch((error: unknown) => {
          firstError ??= error;
          return FAILED;
        })
        .finally(() => {
          inFlight -= 1;
          notify();
        });
    }),
  ).then((values) => {
    if (controller.signal.aborted) return;
    controllers.delete(slot);
    const answered = values.filter((value) => value !== FAILED);
    setSnapshot(slot, {
      data: answered.length > 0 || !firstError ? answered : shown,
      error: firstError,
      fetching: false,
    });
  });
}
