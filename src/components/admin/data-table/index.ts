/**
 * The admin screens' table kit, first built for the Reports page: a table with
 * a sticky header and totals row, skeleton/empty/error states, sortable
 * headers and paging (server or in memory), plus the cells, search box and
 * formats that go with it.
 */
export { DataTable, PAGE_SIZES, totalsLabel } from './data-table';
export type { DataTableColumn, DataTablePaging, DataTableProps, SortDir, TableSort } from './data-table';
export {
  AgingBadge,
  BorrowerCell,
  DateTimeCell,
  IdCell,
  LoanStatusBadge,
  Money,
  StatusBadge,
  statusTone,
  TxnStatusBadge,
} from './cells';
export type { StatusTone } from './cells';
export { SearchInput } from './search-input';
export { sortRows, useClientTable } from './use-client-table';
export type { SortValue } from './use-client-table';
export { formatCompact, formatCount, formatDateTime, formatDay, formatMoney, formatRelative, sumOf } from './format';
