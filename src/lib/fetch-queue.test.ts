import { describe, it, expect, afterEach } from 'vitest';
import { fetchQueueState, runWithFetchSlot } from './fetch-queue';

const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
  // The queue is shared (globalThis), so leave it empty for the next test.
  const state = (globalThis as any).__statementFetchQueue;
  state.active = 0;
  state.waiting.length = 0;
});

/** Lets the event loop run, so queued tasks can start. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A task that only finishes when told to. */
function pending() {
  let done: (() => void) | null = null;
  const task = () => new Promise<string>((resolve) => { done = () => resolve('done'); });
  const finish = () => {
    if (!done) throw new Error('task has not started yet');
    done();
  };
  return { task, finish };
}

describe('runWithFetchSlot', () => {
  it('runs up to the limit at once and makes the rest wait', async () => {
    process.env.STATEMENT_FETCH_CONCURRENCY = '2';
    const a = pending(), b = pending(), c = pending();
    const results = [runWithFetchSlot(a.task, () => 'busy'), runWithFetchSlot(b.task, () => 'busy'), runWithFetchSlot(c.task, () => 'busy')];
    await tick();

    expect(fetchQueueState()).toEqual({ active: 2, waiting: 1 });

    a.finish();
    expect(await results[0]).toBe('done');
    await tick();
    expect(fetchQueueState()).toEqual({ active: 2, waiting: 0 }); // the waiting one took the free slot

    b.finish();
    c.finish();
    expect(await Promise.all(results)).toEqual(['done', 'done', 'done']);
    expect(fetchQueueState()).toEqual({ active: 0, waiting: 0 });
  });

  it('drops a task when too many are waiting instead of queueing forever', async () => {
    process.env.STATEMENT_FETCH_CONCURRENCY = '1';
    process.env.STATEMENT_FETCH_QUEUE = '1';
    const a = pending(), b = pending();
    const running = runWithFetchSlot(a.task, () => 'busy');
    const waiting = runWithFetchSlot(b.task, () => 'busy');
    await tick();
    expect(fetchQueueState()).toEqual({ active: 1, waiting: 1 });

    // The queue is full: this one is dropped rather than queued.
    expect(await runWithFetchSlot(async () => 'done', () => 'busy')).toBe('busy');

    a.finish();
    expect(await running).toBe('done');
    await tick();
    b.finish();
    expect(await waiting).toBe('done');
    expect(fetchQueueState()).toEqual({ active: 0, waiting: 0 });
  });

  it('frees the slot when a task fails', async () => {
    process.env.STATEMENT_FETCH_CONCURRENCY = '1';
    await expect(runWithFetchSlot(async () => { throw new Error('upstream down'); }, () => 'busy')).rejects.toThrow('upstream down');
    expect(fetchQueueState()).toEqual({ active: 0, waiting: 0 });
  });
});
