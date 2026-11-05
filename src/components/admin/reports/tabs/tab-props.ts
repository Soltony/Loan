import type { UpdateFilters } from '../hooks/use-report-filters';
import type { ReportFilters } from '../lib/report-filters';
import type { DataTablePaging } from '../../data-table';
import type { TableSort } from '../types';

export interface ReportTabProps {
  filters: ReportFilters;
  update: UpdateFilters;
}

/** Server paging of a tab's table: the page asked for, the counts of the last answer. */
export function tabPaging(
  data: { total: number; totalPages: number } | undefined,
  { filters, update }: ReportTabProps,
): DataTablePaging | undefined {
  if (!data) return undefined;
  return {
    page: filters.page,
    pageSize: filters.pageSize,
    total: data.total,
    totalPages: data.totalPages,
    onPageChange: (page) => update({ page }, { keepPage: true }),
    onPageSizeChange: (pageSize) => update({ pageSize }),
  };
}

/** The tab's sort: the one picked, or the report's own order. */
export function tabSort({ filters, update }: ReportTabProps, reportOrder: TableSort) {
  return {
    sort: filters.sort ?? reportOrder,
    onSortChange: (sort: TableSort) => update({ sort }),
  };
}
