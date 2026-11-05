'use client';

import { formatDay, sumOf } from '../lib/format';
import { BorrowerCell, IdCell, LoanStatusBadge, Money } from '../report-cells';
import { ReportTable, totalsLabel, type ReportColumn } from '../report-table';
import type { LoanReportRow } from '../types';
import { LOANS_ORDER, useLoansReport } from './provider-loans-tab';
import { LoanStatusFilter } from './status-filters';
import { tabPaging, tabSort, type ReportTabProps } from './tab-props';

/** Each loan by borrower: what is outstanding and how far in arrears (server-paged). */
export function BorrowerPerformanceTab(props: ReportTabProps) {
  const { filters, update } = props;
  const result = useLoansReport(props);
  const rows = result.data?.data;
  const total = (pick: (row: LoanReportRow) => number) => <Money value={sumOf(rows ?? [], pick)} />;

  const columns: ReportColumn<LoanReportRow>[] = [
    {
      id: 'borrower',
      header: 'Borrower',
      cell: (r) => <BorrowerCell name={r.borrowerName} phone={r.borrowerPhone} account={r.borrowerAccount} />,
    },
    { id: 'loanId', header: 'Loan ID', cell: (r) => <IdCell id={r.loanId} /> },
    {
      id: 'disbursed',
      header: 'Disbursed',
      sortKey: 'disbursedDate',
      cell: (r) => formatDay(r.disbursedDate),
      className: 'whitespace-nowrap',
    },
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
      id: 'daysInArrears',
      header: 'Days in Arrears',
      align: 'right',
      cell: (r) => <span className="tabular-nums">{r.daysInArrears}</span>,
    },
    { id: 'due', header: 'Due Date', sortKey: 'dueDate', cell: (r) => formatDay(r.dueDate), className: 'whitespace-nowrap' },
    { id: 'status', header: 'Status', cell: (r) => <LoanStatusBadge status={r.status} /> },
  ];

  return (
    <ReportTable
      caption="Borrower performance"
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
