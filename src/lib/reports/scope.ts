import { chunked, skipOf, type Paging } from './params';

/**
 * Branch and District users see only their branches' borrowers. Their scope is
 * a list of borrower ids that can run past the 2,100 parameters SQL Server
 * takes in one statement, and the limit is per statement (an `OR` of several
 * `IN` lists does not help), so queries over a large scope go in chunks.
 */

/** Ids per `IN` list: room is left for the other parameters of the statement. */
export const SCOPE_CHUNK = 1000;

/**
 * The scope in `IN`-sized chunks. `null` (no restriction) is one pass without a
 * borrower filter; `[]` (nothing in scope) is no pass at all, so sums over the
 * passes come to zero.
 */
export function scopeChunks(ids: string[] | null, size = SCOPE_CHUNK): Array<string[] | null> {
  if (ids === null) return [null];
  return chunked(ids, size);
}

/** Adds up a figure over every chunk of the scope (the chunks are disjoint by borrower). */
export async function sumOverScope(
  scope: string[] | null,
  read: (borrowerIds: string[] | null) => Promise<number>,
): Promise<number> {
  let total = 0;
  for (const chunk of scopeChunks(scope)) total += await read(chunk);
  return total;
}

/** Every row over the chunks of the scope. */
export async function rowsOverScope<T>(
  scope: string[] | null,
  read: (borrowerIds: string[] | null) => Promise<T[]>,
): Promise<T[]> {
  const rows: T[] = [];
  for (const chunk of scopeChunks(scope)) rows.push(...(await read(chunk)));
  return rows;
}

export interface ScopedPageQuery<K extends { id: string }, R> {
  scope: string[] | null;
  paging: Paging;
  /** Count and page in the database, the scope (if any) in one `IN` list. */
  direct: (borrowerIds: string[] | null) => Promise<{ total: number; rows: R[] }>;
  /** Id and sort fields of every row of borrowers in one chunk. */
  keysIn: (borrowerIds: string[]) => Promise<K[]>;
  /** The order `direct` sorts by, tiebreaker included. */
  compare: (a: K, b: K) => number;
  /** The page's rows, in any order. */
  rowsById: (ids: string[]) => Promise<R[]>;
  idOf: (row: R) => string;
}

/**
 * One page of a list of rows that belong to borrowers in scope. A scope that
 * fits one statement is filtered, counted and paged in the database. A larger
 * one is read as keys chunk by chunk, ordered and paged here, and the page's
 * rows are then read by id.
 */
export async function pageWithinScope<K extends { id: string }, R>(
  query: ScopedPageQuery<K, R>,
): Promise<{ total: number; rows: R[] }> {
  const { scope, paging } = query;
  if (scope !== null && scope.length === 0) return { total: 0, rows: [] };
  if (scope === null || scope.length <= SCOPE_CHUNK) return query.direct(scope);

  const keys: K[] = [];
  for (const chunk of chunked(scope, SCOPE_CHUNK)) keys.push(...(await query.keysIn(chunk)));
  keys.sort(query.compare);
  const pageIds = keys.slice(skipOf(paging), skipOf(paging) + paging.pageSize).map((k) => k.id);
  if (pageIds.length === 0) return { total: keys.length, rows: [] };

  const byId = new Map((await query.rowsById(pageIds)).map((row) => [query.idOf(row), row]));
  return {
    total: keys.length,
    rows: pageIds.flatMap((id) => {
      const row = byId.get(id);
      return row ? [row] : [];
    }),
  };
}
