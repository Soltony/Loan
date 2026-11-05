'use client';

import { useReportQuery } from '../hooks/use-report-query';
import { DataTable, type DataTableColumn, formatCount, Money } from '../../data-table';
import { reportQuery, reportUrl } from '../lib/report-filters';
import type { CollectionAmounts, CollectionRow, CollectionsPage, TableSort } from '../types';
import { tabPaging, tabSort, type ReportTabProps } from './tab-props';

const COLLECTIONS_ORDER: TableSort = { by: 'date', dir: 'desc' };

const AMOUNTS: Array<{ key: keyof CollectionAmounts; header: string; title?: string }> = [
  { key: 'principal', header: 'Principal Received' },
  { key: 'interest', header: 'Interest Received' },
  { key: 'serviceFee', header: 'Service Fee Received' },
  { key: 'penalty', header: 'Penalty Received' },
  { key: 'tax', header: 'Tax Received' },
  { key: 'unapplied', header: 'Unapplied / Overpaid', title: 'Cash beyond what the loans owed' },
  { key: 'total', header: 'Total Collected' },
];

/** Collections per provider and day; the totals row covers every day, not just this page. */
export function CollectionsTab(props: ReportTabProps) {
  // Collections are summed per day: the search box does not apply.
  const result = useReportQuery<CollectionsPage>(
    reportUrl('/api/reports/collections', reportQuery({ ...props.filters, search: '' })),
  );
  const totals = result.data?.totals;

  const columns: DataTableColumn<CollectionRow>[] = [
    { id: 'provider', header: 'Provider', sortKey: 'provider', cell: (r) => r.provider },
    { id: 'date', header: 'Date', sortKey: 'date', cell: (r) => r.date, className: 'whitespace-nowrap' },
    ...AMOUNTS.map(
      ({ key, header, title }): DataTableColumn<CollectionRow> => ({
        id: key,
        header,
        title,
        align: 'right',
        sortKey: key,
        cell: (r) => <Money value={r[key]} bold={key === 'total'} />,
        footer: totals ? <Money value={totals[key]} bold={key === 'total'} /> : undefined,
      }),
    ),
    {
      id: 'outstandingPrincipal',
      header: 'Outstanding Principal',
      title: 'Principal still owed at the end of this date: disbursed less principal received',
      align: 'right',
      sortKey: 'outstandingPrincipal',
      cell: (r) => <Money value={r.outstandingPrincipal} />,
      footer: '',
    },
    {
      id: 'outstandingLoans',
      header: 'Outstanding Loans',
      title: 'Loans still carrying a principal balance at the end of this date',
      align: 'right',
      sortKey: 'outstandingLoans',
      cell: (r) => <span className="tabular-nums">{formatCount(r.outstandingLoans)}</span>,
      footer: '',
    },
  ];

  return (
    <DataTable
      caption="Collections"
      columns={columns}
      rows={result.data?.data}
      rowKey={(r) => `${r.provider}:${r.date}`}
      isLoading={result.isLoading}
      isFetching={result.isFetching}
      error={result.error}
      onRetry={result.refetch}
      {...tabSort(props, COLLECTIONS_ORDER)}
      paging={tabPaging(result.data, props)}
      footerLabel="Period total"
      emptyMessage="No collections in this period."
    />
  );
}
