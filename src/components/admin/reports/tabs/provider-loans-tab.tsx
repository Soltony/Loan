'use client';

import { useReportQuery } from '../hooks/use-report-query';
import { formatDay, sumOf } from '../lib/format';
import { reportQuery, reportUrl } from '../lib/report-filters';
import { BorrowerCell, IdCell, LoanStatusBadge, Money } from '../report-cells';
import { ReportTable, totalsLabel, type ReportColumn } from '../report-table';
import type { LoanReportRow, ReportPage, TableSort } from '../types';
import { LoanStatusFilter } from './status-filters';
import { tabPaging, tabSort, type ReportTabProps } from './tab-props';

/** The loans report's own order. */
export const LOANS_ORDER: TableSort = { by: 'disbursedDate', dir: 'desc' };

/** Loans listed by the report on these filters (shared with Borrower Performance, so the two tabs share a cache entry). */
export function useLoansReport({ filters }: ReportTabProps) {
  return useReportQuery<ReportPage<LoanReportRow>>(
    reportUrl('/api/reports/loans', reportQuery(filters, { status: filters.status })),
  );
}

export function ProviderLoansTab(props: ReportTabProps) {
  const { filters, update } = props;
  const result = useLoansReport(props);
  const rows = result.data?.data;
  const total = (pick: (row: LoanReportRow) => number, bold?: boolean) => (
    <Money value={sumOf(rows ?? [], pick)} bold={bold} />
  );

  const columns: ReportColumn<LoanReportRow>[] = [
    { id: 'provider', header: 'Provider', sortKey: 'provider', cell: (r) => r.provider },
    { id: 'loanId', header: 'Loan ID', cell: (r) => <IdCell id={r.loanId} /> },
    {
      id: 'borrower',
      header: 'Borrower',
      cell: (r) => <BorrowerCell name={r.borrowerName} phone={r.borrowerPhone} account={r.borrowerAccount} />,
    },
    {
      id: 'disbursed',
      header: 'Disbursed',
      sortKey: 'disbursedDate',
      cell: (r) => formatDay(r.disbursedDate),
      className: 'whitespace-nowrap',
    },
    { id: 'due', header: 'Due Date', sortKey: 'dueDate', cell: (r) => formatDay(r.dueDate), className: 'whitespace-nowrap' },
    {
      id: 'principalDisbursed',
      header: 'Principal Disbursed',
      align: 'right',
      sortKey: 'principalDisbursed',
      cell: (r) => <Money value={r.principalDisbursed} />,
      footer: total((r) => r.principalDisbursed),
    },
    {
      id: 'principalOutstanding',
      header: 'Principal Outstanding',
      align: 'right',
      cell: (r) => <Money value={r.principalOutstanding} />,
      footer: total((r) => r.principalOutstanding),
    },
    {
      id: 'interestOutstanding',
      header: 'Interest Outstanding',
      align: 'right',
      cell: (r) => <Money value={r.interestOutstanding} />,
      footer: total((r) => r.interestOutstanding),
    },
    {
      id: 'serviceFeeOutstanding',
      header: 'Service Fee Outstanding',
      align: 'right',
      cell: (r) => <Money value={r.serviceFeeOutstanding} />,
      footer: total((r) => r.serviceFeeOutstanding),
    },
    {
      id: 'penaltyOutstanding',
      header: 'Penalty Outstanding',
      align: 'right',
      cell: (r) => <Money value={r.penaltyOutstanding} />,
      footer: total((r) => r.penaltyOutstanding),
    },
    {
      id: 'totalOutstanding',
      header: 'Total Outstanding',
      align: 'right',
      cell: (r) => <Money value={r.totalOutstanding} bold />,
      footer: total((r) => r.totalOutstanding, true),
    },
    { id: 'status', header: 'Status', cell: (r) => <LoanStatusBadge status={r.status} /> },
  ];

  return (
    <ReportTable
      caption="Provider loans"
      columns={columns}
      rows={rows}
      rowKey={(r) => r.loanId}
      isLoading={result.isLoading}
      isFetching={result.isFetching}
      error={result.error}
      onRetry={result.refetch}
      {...tabSort(props, LOANS_ORDER)}
      paging={tabPaging(result.data, props)}
      footerLabel={totalsLabel(result.data)}
      toolbar={<LoanStatusFilter value={filters.status} onChange={(status) => update({ status })} />}
    />
  );
}
