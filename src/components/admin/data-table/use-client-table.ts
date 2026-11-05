'use client';

import { useCallback, useMemo, useState } from 'react';
import type { DataTablePaging, TableSort } from './data-table';

export type SortValue = string | number | boolean | Date | null | undefined;

/** Orders rows by a value: numbers and dates by size, text A–Z (numeric-aware), missing values last. */
export function sortRows<T>(rows: T[], value: (row: T) => SortValue, dir: 'asc' | 'desc'): T[] {
  const sign = dir === 'asc' ? 1 : -1;
  const key = (row: T) => {
    const v = value(row);
    return v instanceof Date ? v.getTime() : typeof v === 'boolean' ? Number(v) : v;
  };
  return rows
    .map((row, index) => ({ row, index, v: key(row) }))
    .sort((a, b) => {
      if (a.v == null || b.v == null) return a.v == null ? (b.v == null ? a.index - b.index : 1) : -1;
      const order =
        typeof a.v === 'number' && typeof b.v === 'number'
          ? a.v - b.v
          : String(a.v).localeCompare(String(b.v), undefined, { numeric: true, sensitivity: 'base' });
      return order * sign || a.index - b.index;
    })
    .map((entry) => entry.row);
}

/**
 * Sorting and paging for a table whose rows are all in memory: the props a
 * DataTable takes for them (`rows`, `sort`, `onSortChange`, `paging`).
 * `sorters` names how each sortable column reads its value; a column is
 * sortable when its `sortKey` is one of them.
 */
export function useClientTable<T>(
  rows: T[] | undefined,
  options: {
    sorters?: Record<string, (row: T) => SortValue>;
    initialSort?: TableSort;
    pageSize?: number;
    pageSizes?: number[];
  } = {},
) {
  const [sort, setSort] = useState<TableSort | undefined>(options.initialSort);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(options.pageSize ?? 25);
  const { sorters } = options;

  const sorted = useMemo(() => {
    const list = rows ?? [];
    const sorter = sort ? sorters?.[sort.by] : undefined;
    return sorter && sort ? sortRows(list, sorter, sort.dir) : list;
  }, [rows, sort, sorters]);

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  // A shorter list (a filter, a removed row) never leaves the table on an empty page.
  const current = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => sorted.slice((current - 1) * pageSize, current * pageSize),
    [sorted, current, pageSize],
  );

  const onSortChange = useCallback((next: TableSort) => {
    setSort(next);
    setPage(1);
  }, []);
  const resetPage = useCallback(() => setPage(1), []);

  const paging: DataTablePaging = {
    page: current,
    pageSize,
    total,
    totalPages,
    onPageChange: setPage,
    onPageSizeChange: (size) => {
      setPageSize(size);
      setPage(1);
    },
    pageSizes: options.pageSizes ?? [10, 25, 50, 100],
  };

  return {
    /** The rows of the current page, in order. */
    rows: rows === undefined ? undefined : pageRows,
    /** Every row, in the table's order (for exports). */
    sortedRows: sorted,
    sort,
    onSortChange,
    paging,
    /** Back to the first page (after a filter changes). */
    resetPage,
  };
}
