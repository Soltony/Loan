import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cancelSlot, forgetSlot, isFetching, loadSlot, refreshReports, snapshotOf, STALE_MS } from './report-store';

/** A fetch whose answers the test hands out, one per call, in order. */
function deferredFetch() {
  const calls: Array<{ url: string; resolve: (body: unknown, status?: number) => void; signal: AbortSignal }> = [];
  const fetch = vi.fn(
    (url: string, init: { signal: AbortSignal }) =>
      new Promise<Response>((resolveResponse, reject) => {
        init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        calls.push({
          url,
          signal: init.signal,
          resolve: (body, status = 200) =>
            resolveResponse(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })),
        });
      }),
  );
  return { fetch, calls };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

let net: ReturnType<typeof deferredFetch>;
let slot = 0;
const nextSlot = () => `slot-${++slot}`;

beforeEach(() => {
  net = deferredFetch();
  vi.stubGlobal('fetch', net.fetch);
  refreshReports();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('report store', () => {
  it('fetches a report once and serves it from memory for a minute', async () => {
    const a = nextSlot();
    loadSlot(a, ['/r?1']);
    expect(snapshotOf(a)).toEqual({ data: undefined, fetching: true });
    expect(isFetching()).toBe(true);
    net.calls[0].resolve({ rows: 1 });
    await settle();
    expect(snapshotOf(a)).toEqual({ data: [{ rows: 1 }], error: undefined, fetching: false });
    expect(isFetching()).toBe(false);

    // Another hook asking for the same report gets it without a request.
    const b = nextSlot();
    loadSlot(b, ['/r?1']);
    expect(snapshotOf(b)).toEqual({ data: [{ rows: 1 }], fetching: false });
    expect(net.fetch).toHaveBeenCalledTimes(1);

    // Past a minute it is asked for again.
    loadSlot(b, ['/r?1'], false, Date.now() + STALE_MS + 1);
    expect(net.fetch).toHaveBeenCalledTimes(2);
    forgetSlot(a);
    forgetSlot(b);
  });

  it('keeps the rows on screen while the next filters load, and cancels the request they replace', async () => {
    const s = nextSlot();
    loadSlot(s, ['/r?page=1']);
    net.calls[0].resolve('page 1');
    await settle();

    loadSlot(s, ['/r?page=2']);
    expect(snapshotOf(s)).toEqual({ data: ['page 1'], fetching: true });
    loadSlot(s, ['/r?page=3']);
    expect(net.calls[1].signal.aborted).toBe(true);
    net.calls[2].resolve('page 3');
    await settle();
    expect(snapshotOf(s).data).toEqual(['page 3']);
    forgetSlot(s);
  });

  it('keeps the previous rows under the error when a request fails', async () => {
    const s = nextSlot();
    loadSlot(s, ['/r?ok']);
    net.calls[0].resolve('fine');
    await settle();

    loadSlot(s, ['/r?broken']);
    net.calls[1].resolve({ error: 'Internal Server Error' }, 500);
    await settle();
    const snapshot = snapshotOf(s);
    expect(snapshot.data).toEqual(['fine']);
    expect((snapshot.error as Error).message).toBe('Internal Server Error');
    expect(snapshot.fetching).toBe(false);
    forgetSlot(s);
  });

  it('delivers several reports together, leaving out the ones that failed', async () => {
    const s = nextSlot();
    loadSlot(s, ['/p?1', '/p?2']);
    net.calls[1].resolve('two');
    await settle();
    expect(snapshotOf(s).fetching).toBe(true);
    net.calls[0].resolve({ error: 'nope' }, 500);
    await settle();
    expect(snapshotOf(s).data).toEqual(['two']);
    expect((snapshotOf(s).error as Error).message).toBe('nope');
    forgetSlot(s);
  });

  it('ignores an answer that arrives after its request was cancelled', async () => {
    const s = nextSlot();
    loadSlot(s, ['/r?late']);
    cancelSlot(s);
    net.calls[0].resolve('too late');
    await settle();
    expect(snapshotOf(s)).toEqual({ data: undefined, fetching: true });
    forgetSlot(s);
    expect(snapshotOf(s)).toEqual({ fetching: false });
  });

  it('asks again for everything after a refresh, or when forced', async () => {
    const s = nextSlot();
    loadSlot(s, ['/r?x']);
    net.calls[0].resolve(1);
    await settle();
    loadSlot(s, ['/r?x'], true);
    expect(net.fetch).toHaveBeenCalledTimes(2);
    net.calls[1].resolve(2);
    await settle();
    refreshReports();
    loadSlot(s, ['/r?x']);
    expect(net.fetch).toHaveBeenCalledTimes(3);
    forgetSlot(s);
  });

  it('answers a slot that wants nothing at once', () => {
    const s = nextSlot();
    loadSlot(s, []);
    expect(snapshotOf(s)).toEqual({ data: [], fetching: false });
    expect(net.fetch).not.toHaveBeenCalled();
    forgetSlot(s);
  });
});
