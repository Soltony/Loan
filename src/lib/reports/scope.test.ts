import { describe, expect, it, vi } from 'vitest';
import { compareBy } from './params';
import { pageWithinScope, rowsOverScope, scopeChunks, SCOPE_CHUNK, sumOverScope } from './scope';

describe('scope chunks', () => {
  it('reads an unrestricted scope in one pass and an empty one in none', async () => {
    expect(scopeChunks(null)).toEqual([null]);
    expect(scopeChunks([])).toEqual([]);
    expect(scopeChunks(['a', 'b', 'c'], 2)).toEqual([['a', 'b'], ['c']]);
    expect(await sumOverScope([], async () => 5)).toBe(0);
    expect(await sumOverScope(['a', 'b', 'c'], async (chunk) => chunk!.length)).toBe(3);
    expect(await rowsOverScope(null, async (chunk) => [chunk])).toEqual([null]);
  });
});

/** A table of loans (id, borrower, amount) and the two ways of paging it. */
function book(borrowers: number, loansEach: number) {
  const loans = Array.from({ length: borrowers * loansEach }, (_, i) => ({
    id: `loan-${String(i).padStart(5, '0')}`,
    borrowerId: `b-${i % borrowers}`,
    amount: (i * 37) % 101,
  }));
  // amount desc, id desc: the order the "database" pages in.
  const order = (a: (typeof loans)[number], b: (typeof loans)[number]) =>
    compareBy<(typeof loans)[number]>((l) => l.amount, 'desc')(a, b) ||
    compareBy<(typeof loans)[number]>((l) => l.id, 'desc')(a, b);
  const inScope = (ids: string[] | null) => loans.filter((l) => !ids || ids.includes(l.borrowerId));
  return { loans, order, inScope };
}

describe('pageWithinScope', () => {
  it('pages in the database when the scope fits one statement', async () => {
    const { order, inScope } = book(10, 3);
    const direct = vi.fn(async (ids: string[] | null) => {
      const rows = inScope(ids).sort(order);
      return { total: rows.length, rows: rows.slice(2, 4) };
    });
    const keysIn = vi.fn();
    const result = await pageWithinScope({
      scope: ['b-1', 'b-2'],
      paging: { page: 2, pageSize: 2 },
      direct,
      keysIn,
      compare: order,
      rowsById: vi.fn(),
      idOf: (l) => l.id,
    });
    expect(direct).toHaveBeenCalledWith(['b-1', 'b-2']);
    expect(keysIn).not.toHaveBeenCalled();
    expect(result.total).toBe(6);
  });

  it('pages a large scope chunk by chunk, with the same rows in the same order', async () => {
    const borrowers = SCOPE_CHUNK + 500;
    const { loans, order, inScope } = book(borrowers, 2);
    const scope = Array.from({ length: borrowers }, (_, i) => `b-${i}`);
    const paging = { page: 7, pageSize: 25 };
    const expected = inScope(null).sort(order).slice(150, 175);

    const keysIn = vi.fn(async (ids: string[]) => inScope(ids).map((l) => ({ ...l })));
    const rowsById = vi.fn(async (ids: string[]) => loans.filter((l) => ids.includes(l.id)).reverse());
    const result = await pageWithinScope({
      scope,
      paging,
      direct: vi.fn(),
      keysIn,
      compare: order,
      rowsById,
      idOf: (l) => l.id,
    });

    expect(keysIn).toHaveBeenCalledTimes(2);
    expect(keysIn.mock.calls.every(([ids]) => ids.length <= SCOPE_CHUNK)).toBe(true);
    expect(result.total).toBe(loans.length);
    expect(result.rows.map((l) => l.id)).toEqual(expected.map((l) => l.id));
    expect(rowsById).toHaveBeenCalledTimes(1);
  });

  it('answers an empty scope, or a page past the end, without reading rows', async () => {
    const rowsById = vi.fn();
    const empty = await pageWithinScope({
      scope: [],
      paging: { page: 1, pageSize: 10 },
      direct: vi.fn(),
      keysIn: vi.fn(),
      compare: () => 0,
      rowsById,
      idOf: (l: { id: string }) => l.id,
    });
    expect(empty).toEqual({ total: 0, rows: [] });

    const { order, inScope } = book(SCOPE_CHUNK + 1, 1);
    const past = await pageWithinScope({
      scope: Array.from({ length: SCOPE_CHUNK + 1 }, (_, i) => `b-${i}`),
      paging: { page: 999, pageSize: 50 },
      direct: vi.fn(),
      keysIn: async (ids: string[]) => inScope(ids),
      compare: order,
      rowsById,
      idOf: (l: { id: string }) => l.id,
    });
    expect(past).toEqual({ total: SCOPE_CHUNK + 1, rows: [] });
    expect(rowsById).not.toHaveBeenCalled();
  });
});
