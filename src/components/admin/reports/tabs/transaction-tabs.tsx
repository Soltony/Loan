'use client';

import { useReportQuery } from '../hooks/use-report-query';
import { BorrowerCell, DataTable, type DataTableColumn, formatDay, IdCell, LoanStatusBadge, Money, sumOf, totalsLabel, TxnStatusBadge } from '../../data-table';
import { reportQuery, reportUrl } from '../lib/report-filters';
import type { ReportPage, TableSort, TransactionReportRow } from '../types';
import { tabPaging, tabSort, type ReportTabProps } from './tab-props';

/** The transactions report's own order. */
const TRANSACTIONS_ORDER: TableSort = { by: 'transactionDate', dir: 'desc' };

const cbsCredit = (r: TransactionReportRow) => r.cbsCreditAmount ?? 0;

function useTransactions({ filters }: ReportTabProps, type: 'disbursement' | 'repayment') {
  return useReportQuery<ReportPage<TransactionReportRow>>(
    reportUrl('/api/reports/transactions', reportQuery(filters, { type })),
  );
}

const customer = (r: TransactionReportRow) => (
  <BorrowerCell name={r.customerName} phone={r.borrowerPhone ?? r.borrowerId} account={r.borrowerAccount} />
);

export function DisbursementsTab(props: ReportTabProps) {
  const result = useTransactions(props, 'disbursement');
  const rows = result.data?.data;
  const total = (pick: (row: TransactionReportRow) => number, bold?: boolean) => (
    <Money value={sumOf(rows ?? [], pick)} bold={bold} />
  );

  const columns: DataTableColumn<TransactionReportRow>[] = [
    {
      id: 'date',
      header: 'Date',
      sortKey: 'transactionDate',
      cell: (r) => formatDay(r.transactionDate),
      className: 'whitespace-nowrap',
    },
    { id: 'loanId', header: 'Loan ID', sortKey: 'loanId', cell: (r) => <IdCell id={r.loanId} /> },
    { id: 'customer', header: 'Customer', cell: customer },
    { id: 'debitAccount', header: 'Debit Account', cell: (r) => r.debitAccount, className: 'font-mono text-xs' },
    {
      id: 'creditAccount',
      header: 'Credit Account (Customer Account)',
      cell: (r) => r.borrowerAccount || r.creditAccount,
      className: 'font-mono text-xs',
    },
    {
      id: 'status',
      header: 'Txn Status',
      cell: (r) => <TxnStatusBadge status={r.disbursementOutcome || r.disbursementStatusText || r.transactionStatus} />,
    },
    {
      id: 'reference',
      header: 'CBS Reference',
      cell: (r) => r.cbsReference || r.reference,
      className: 'font-mono text-xs',
    },
    {
      id: 'loanAmount',
      header: 'Loan Amount (MLS)',
      align: 'right',
      sortKey: 'principalDisbursed',
      cell: (r) => <Money value={r.principalDisbursed} />,
      footer: total((r) => r.principalDisbursed),
    },
    {
      id: 'interestFee',
      header: 'Interest Fee (MLS)',
      align: 'right',
      cell: (r) => <Money value={r.interestOutstanding} />,
      footer: total((r) => r.interestOutstanding),
    },
    {
      id: 'serviceFee',
      header: 'Service Fee (MLS)',
      align: 'right',
      cell: (r) => <Money value={r.serviceFeeOutstanding} />,
      footer: total((r) => r.serviceFeeOutstanding),
    },
    {
      id: 'netDisbursed',
      header: 'Net Disbursed (MLS)',
      align: 'right',
      cell: (r) => <Money value={r.netDisbursed} bold />,
      footer: total((r) => r.netDisbursed, true),
    },
    {
      id: 'cbsCredit',
      header: 'CBS Credit Amount',
      align: 'right',
      cell: (r) => <Money value={cbsCredit(r)} />,
      footer: total(cbsCredit),
    },
    { id: 'due', header: 'Due Date', cell: (r) => formatDay(r.dueDate), className: 'whitespace-nowrap' },
    {
      id: 'difference',
      header: 'Difference',
      align: 'right',
      title: 'Net disbursed less what CBS credited',
      cell: (r) => <Money value={r.netDisbursed - cbsCredit(r)} />,
      footer: total((r) => r.netDisbursed - cbsCredit(r)),
    },
  ];

  return (
    <DataTable
      caption="Disbursements"
      columns={columns}
      rows={rows}
      rowKey={(r, i) => `${r.reference}:${i}`}
      isLoading={result.isLoading}
      isFetching={result.isFetching}
      error={result.error}
      onRetry={result.refetch}
      {...tabSort(props, TRANSACTIONS_ORDER)}
      paging={tabPaging(result.data, props)}
      footerLabel={totalsLabel(result.data)}
      emptyMessage="No disbursements in this period."
    />
  );
}

export function RepaymentsTab(props: ReportTabProps) {
  const result = useTransactions(props, 'repayment');
  const rows = result.data?.data;
  const total = (pick: (row: TransactionReportRow) => number, bold?: boolean) => (
    <Money value={sumOf(rows ?? [], pick)} bold={bold} />
  );

  const columns: DataTableColumn<TransactionReportRow>[] = [
    { id: 'provider', header: 'Provider', cell: (r) => r.provider },
    { id: 'loanId', header: 'Loan ID', sortKey: 'loanId', cell: (r) => <IdCell id={r.loanId} /> },
    { id: 'customer', header: 'Customer', cell: customer },
    {
      id: 'date',
      header: 'Transaction Date',
      sortKey: 'transactionDate',
      cell: (r) => formatDay(r.transactionDate),
      className: 'whitespace-nowrap',
    },
    { id: 'due', header: 'Due Date', cell: (r) => formatDay(r.dueDate), className: 'whitespace-nowrap' },
    { id: 'debitAccount', header: 'Debit Account', cell: (r) => r.debitAccount, className: 'font-mono text-xs' },
    {
      id: 'creditAccount',
      header: 'Credit Account',
      cell: (r) => r.borrowerAccount || r.creditAccount,
      className: 'font-mono text-xs',
    },
    { id: 'txnStatus', header: 'Txn Status', cell: (r) => <TxnStatusBadge status={r.transactionStatus} /> },
    { id: 'reference', header: 'Reference', cell: (r) => r.reference, className: 'font-mono text-xs' },
    { id: 'product', header: 'Product Type', cell: (r) => r.productType },
    {
      id: 'principalDisbursed',
      header: 'Principal Disbursed',
      align: 'right',
      sortKey: 'principalDisbursed',
      cell: (r) => <Money value={r.principalDisbursed} />,
    },
    {
      id: 'principalPaid',
      header: 'Principal Paid',
      align: 'right',
      cell: (r) => <Money value={r.principalPaid} />,
      footer: total((r) => r.principalPaid),
    },
    {
      id: 'interestPaid',
      header: 'Interest Paid',
      align: 'right',
      cell: (r) => <Money value={r.interestPaid} />,
      footer: total((r) => r.interestPaid),
    },
    {
      id: 'serviceFeePaid',
      header: 'Service Fee Paid',
      align: 'right',
      cell: (r) => <Money value={r.serviceFeePaid} />,
      footer: total((r) => r.serviceFeePaid),
    },
    {
      id: 'penaltyPaid',
      header: 'Penalty Paid',
      align: 'right',
      cell: (r) => <Money value={r.penaltyPaid} />,
      footer: total((r) => r.penaltyPaid),
    },
    {
      id: 'unappliedPaid',
      header: 'Unapplied / Overpaid',
      align: 'right',
      title: 'Cash beyond what the loan owed in principal and charges',
      cell: (r) => <Money value={r.unappliedPaid} />,
      footer: total((r) => r.unappliedPaid),
    },
    {
      id: 'totalPaid',
      header: 'Total Paid',
      align: 'right',
      cell: (r) => <Money value={r.totalPaid} bold />,
      footer: total((r) => r.totalPaid, true),
    },
    { id: 'status', header: 'Loan Status', cell: (r) => <LoanStatusBadge status={r.status} /> },
  ];

  return (
    <DataTable
      caption="Repayments"
      columns={columns}
      rows={rows}
      rowKey={(r, i) => `${r.reference}:${i}`}
      isLoading={result.isLoading}
      isFetching={result.isFetching}
      error={result.error}
      onRetry={result.refetch}
      {...tabSort(props, TRANSACTIONS_ORDER)}
      paging={tabPaging(result.data, props)}
      footerLabel={totalsLabel(result.data)}
      emptyMessage="No repayments in this period."
    />
  );
}
