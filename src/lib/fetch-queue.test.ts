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

  it('drops a task only past STATEMENT_FETCH_QUEUE waiting', async () => {
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

  it('by default keeps far more than 50 waiting, and serves them in arrival order', async () => {
    delete process.env.STATEMENT_FETCH_QUEUE;
    process.env.STATEMENT_FETCH_CONCURRENCY = '3';
    const started: number[] = [];
    let running = 0;
    let peak = 0;
    const job = (n: number) => async () => {
      started.push(n);
      peak = Math.max(peak, ++running);
      await tick();
      running--;
      return n;
    };
    const results = Array.from({ length: 120 }, (_, n) => runWithFetchSlot(job(n), () => -1));
    expect(fetchQueueState()).toEqual({ active: 3, waiting: 117 });

    expect(await Promise.all(results)).toEqual(Array.from({ length: 120 }, (_, n) => n)); // none dropped
    expect(started).toEqual(Array.from({ length: 120 }, (_, n) => n));
    expect(peak).toBe(3);
    expect(fetchQueueState()).toEqual({ active: 0, waiting: 0 });
  });

  it('a newcomer waits behind those already waiting, even when a slot is free at that moment', async () => {
    process.env.STATEMENT_FETCH_CONCURRENCY = '1';
    const order: string[] = [];
    const job = (name: string) => async () => {
      order.push(name);
      await tick();
      return name;
    };
    const a = runWithFetchSlot(job('a'), () => 'busy');
    const b = runWithFetchSlot(job('b'), () => 'busy');
    // 'c' asks the moment 'a' is done: the slot is 'b''s, so 'c' goes after it.
    const c = a.then(() => runWithFetchSlot(job('c'), () => 'busy'));
    expect(await Promise.all([a, b, c])).toEqual(['a', 'b', 'c']);
    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('frees the slot when a task fails', async () => {
    process.env.STATEMENT_FETCH_CONCURRENCY = '1';
    await expect(runWithFetchSlot(async () => { throw new Error('upstream down'); }, () => 'busy')).rejects.toThrow('upstream down');
    expect(fetchQueueState()).toEqual({ active: 0, waiting: 0 });
  });
});
