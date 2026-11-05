'use client';

import type { ReactNode } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { PAGE_SIZES } from './lib/report-filters';
import type { TableSort } from './types';

export interface ReportColumn<T> {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: 'right' | 'center';
  /** The report route's sort key; unset = not sortable. */
  sortKey?: string;
  /** This column's cell in the totals row. */
  footer?: ReactNode;
  /** Hover text of the header. */
  title?: string;
  className?: string;
}

export interface ReportPaging {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
}

export interface ReportTableProps<T> {
  columns: ReportColumn<T>[];
  rows: T[] | undefined;
  rowKey: (row: T, index: number) => string;
  /** Nothing loaded yet. */
  isLoading: boolean;
  /** A request is running: rows on screen stay (dimmed) until it answers. */
  isFetching?: boolean;
  error?: unknown;
  onRetry?: () => void;
  emptyMessage?: string;
  /** The order the rows are in (the report's default when none was picked). */
  sort?: TableSort;
  onSortChange?: (sort: TableSort) => void;
  /** Server paging; unset = every row is on screen. */
  paging?: ReportPaging;
  /** First cell of the totals row, unless that column has its own total. */
  footerLabel?: ReactNode;
  /** Controls above the table (filters). */
  toolbar?: ReactNode;
  caption: string;
}

const ALIGN = { right: 'text-right', center: 'text-center' } as const;

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Something went wrong.';
}

function SortableHead<T>({
  column,
  sort,
  onSortChange,
}: {
  column: ReportColumn<T>;
  sort?: TableSort;
  onSortChange?: (sort: TableSort) => void;
}) {
  const align = column.align ? ALIGN[column.align] : undefined;
  if (!column.sortKey || !onSortChange) {
    return (
      <TableHead className={cn('whitespace-nowrap', align)} title={column.title}>
        {column.header}
      </TableHead>
    );
  }
  const active = sort?.by === column.sortKey;
  const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <TableHead
      className={cn('whitespace-nowrap', align)}
      title={column.title}
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() =>
          onSortChange({
            by: column.sortKey!,
            // Amounts and dates read largest/latest first; text A–Z.
            dir: active ? (sort.dir === 'asc' ? 'desc' : 'asc') : column.align === 'right' ? 'desc' : 'asc',
          })
        }
        className={cn(
          'inline-flex items-center gap-1 rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          column.align === 'right' && 'flex-row-reverse',
          active && 'text-foreground',
        )}
      >
        {column.header}
        <Icon className={cn('h-3.5 w-3.5 shrink-0', !active && 'opacity-40')} aria-hidden />
      </button>
    </TableHead>
  );
}

function Pagination({ paging }: { paging: ReportPaging }) {
  const { page, pageSize, total } = paging;
  const totalPages = Math.max(1, paging.totalPages);
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2 text-sm">
      <span className="text-muted-foreground">
        Showing {first.toLocaleString()}–{last.toLocaleString()} of {total.toLocaleString()}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        {paging.onPageSizeChange ? (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Rows</span>
            <Select value={String(pageSize)} onValueChange={(value) => paging.onPageSizeChange!(Number(value))}>
              <SelectTrigger className="h-8 w-[76px]" aria-label="Rows per page">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            aria-label="First page"
            disabled={page <= 1}
            onClick={() => paging.onPageChange(1)}
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            aria-label="Previous page"
            disabled={page <= 1}
            onClick={() => paging.onPageChange(page - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="px-2 tabular-nums">
            Page {page.toLocaleString()} of {totalPages.toLocaleString()}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            aria-label="Next page"
            disabled={page >= totalPages}
            onClick={() => paging.onPageChange(page + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            aria-label="Last page"
            disabled={page >= totalPages}
            onClick={() => paging.onPageChange(totalPages)}
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * A report table: one scrolling area with a sticky header and totals row,
 * paging below it (always in view), and loading, empty, error and refreshing
 * states.
 */
export function ReportTable<T>({
  columns,
  rows,
  rowKey,
  isLoading,
  isFetching = false,
  error,
  onRetry,
  emptyMessage = 'No results found for the selected filters.',
  sort,
  onSortChange,
  paging,
  footerLabel,
  toolbar,
  caption,
}: ReportTableProps<T>) {
  const hasRows = !!rows && rows.length > 0;
  const refreshing = isFetching && hasRows;
  const showFooter = hasRows && columns.some((c) => c.footer !== undefined);

  let body: ReactNode;
  if (!hasRows && (isLoading || (isFetching && !error))) {
    body = Array.from({ length: 6 }, (_, i) => (
      <TableRow key={i} className="hover:bg-transparent">
        {columns.map((c) => (
          <TableCell key={c.id}>
            <Skeleton className="h-4 w-full min-w-12" />
          </TableCell>
        ))}
      </TableRow>
    ));
  } else if (!hasRows && error) {
    body = (
      <TableRow className="hover:bg-transparent">
        <TableCell colSpan={columns.length} className="h-24 text-center">
          <p className="text-destructive">{errorMessage(error)}</p>
          {onRetry ? (
            <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
              Try again
            </Button>
          ) : null}
        </TableCell>
      </TableRow>
    );
  } else if (!hasRows) {
    body = (
      <TableRow className="hover:bg-transparent">
        <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
          {emptyMessage}
        </TableCell>
      </TableRow>
    );
  } else {
    body = rows.map((row, index) => (
      <TableRow key={rowKey(row, index)}>
        {columns.map((c) => (
          <TableCell key={c.id} className={cn('py-3', c.align && ALIGN[c.align], c.className)}>
            {c.cell(row)}
          </TableCell>
        ))}
      </TableRow>
    ));
  }

  return (
    <div className="space-y-2">
      {toolbar || refreshing ? (
        <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">{toolbar}</div>
          {refreshing ? (
            <span role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Updating…
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="overflow-hidden rounded-md border bg-card">
        <div className="relative max-h-[60vh] overflow-auto">
          <table
            className={cn('w-full caption-bottom text-sm transition-opacity', refreshing && 'opacity-60')}
            aria-busy={isFetching}
          >
            <caption className="sr-only">{caption}</caption>
            <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_hsl(var(--border))]">
              <TableRow className="hover:bg-transparent">
                {columns.map((column) => (
                  <SortableHead key={column.id} column={column} sort={sort} onSortChange={onSortChange} />
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>{body}</TableBody>
            {showFooter ? (
              <TableFooter className="sticky bottom-0 z-10 bg-muted shadow-[0_-1px_0_hsl(var(--border))]">
                <TableRow className="hover:bg-transparent">
                  {columns.map((c, index) => (
                    <TableCell key={c.id} className={cn('whitespace-nowrap font-semibold', c.align && ALIGN[c.align])}>
                      {index === 0 && c.footer === undefined ? footerLabel : c.footer}
                    </TableCell>
                  ))}
                </TableRow>
              </TableFooter>
            ) : null}
          </table>
        </div>
        {paging && paging.total > 0 ? <Pagination paging={paging} /> : null}
      </div>
      {hasRows && error ? (
        <p className="text-xs text-destructive">
          Could not refresh: {errorMessage(error)}{' '}
          {onRetry ? (
            <button type="button" className="underline" onClick={onRetry}>
              Try again
            </button>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

/** "Page total" while more pages exist, "Total" when every row is on screen. */
export function totalsLabel(paging?: { totalPages: number }): string {
  return paging && paging.totalPages > 1 ? 'Page total' : 'Total';
}
