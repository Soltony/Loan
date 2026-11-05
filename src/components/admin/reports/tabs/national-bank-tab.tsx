'use client';

import { useReportQuery } from '../hooks/use-report-query';
import { AgingBadge, DataTable, type DataTableColumn, IdCell, Money, sumOf, totalsLabel } from '../../data-table';
import { reportQuery, reportUrl } from '../lib/report-filters';
import type { NationalBankRow, ReportPage, TableSort } from '../types';
import { tabPaging, tabSort, type ReportTabProps } from './tab-props';

const NATIONAL_BANK_ORDER: TableSort = { by: 'disbursementDate', dir: 'desc' };

type Amount =
  | 'personalLoan'
  | 'workingCapitalLoan'
  | 'buyNowPayLater'
  | 'revolvingCredit'
  | 'msmeLoans'
  | 'otherLoanType'
  | 'applicationAmount'
  | 'approvedAmount'
  | 'outstandingBalance';

/**
 * National Bank of Ethiopia regulatory return. Column labels follow the
 * regulator's template, since the export is submitted as it is.
 */
export function NationalBankTab(props: ReportTabProps) {
  const result = useReportQuery<ReportPage<NationalBankRow>>(
    reportUrl('/api/reports/national-bank', reportQuery(props.filters)),
  );
  const rows = result.data?.data;

  const text = (id: keyof NationalBankRow, header: string): DataTableColumn<NationalBankRow> => ({
    id,
    header,
    cell: (r) => r[id],
    className: 'whitespace-nowrap',
  });
  const amount = (
    id: Amount,
    header: string,
    options: { sortKey?: string; blankWhenZero?: boolean } = {},
  ): DataTableColumn<NationalBankRow> => ({
    id,
    header,
    align: 'right',
    sortKey: options.sortKey,
    // Facility-type columns leave the types a facility is not blank.
    cell: (r) => (options.blankWhenZero && !r[id] ? '' : <Money value={r[id]} />),
    footer: <Money value={sumOf(rows ?? [], (r) => r[id])} />,
  });

  const columns: DataTableColumn<NationalBankRow>[] = [
    text('firstName', 'First Name'),
    text('middleName', 'Middle Name'),
    text('lastName', 'Last Name'),
    text('gender', 'Gender'),
    text('personalIncomeLevel', 'Income Level'),
    text('nationalId', 'National ID/Fayda No'),
    text('tin', 'TIN'),
    text('otherIdNo', 'Other ID No'),
    text('region', 'Region'),
    text('zone', 'Zone'),
    text('subCity', 'Sub-city'),
    text('woreda', 'Woreda'),
    text('kebele', 'Kebele'),
    text('houseNo', 'House No'),
    { ...text('phoneNo', 'Tel. No'), className: 'whitespace-nowrap font-mono text-xs' },
    amount('personalLoan', 'Personal Loan', { blankWhenZero: true }),
    amount('workingCapitalLoan', 'Working Capital', { blankWhenZero: true }),
    amount('buyNowPayLater', 'BNPL', { blankWhenZero: true }),
    amount('revolvingCredit', 'Revolving Credit', { blankWhenZero: true }),
    amount('msmeLoans', 'MSME Loans', { blankWhenZero: true }),
    amount('otherLoanType', 'Other', { blankWhenZero: true }),
    amount('applicationAmount', 'Application Amount', { sortKey: 'applicationAmount' }),
    text('purposeOfLoan', 'Purpose of Loan'),
    {
      id: 'loanAccountRefNo',
      header: 'Loan Account Ref No',
      sortKey: 'loanAccountRefNo',
      cell: (r) => <IdCell id={r.loanAccountRefNo} />,
    },
    amount('approvedAmount', 'Approved/Disbursed Amt', { sortKey: 'approvedAmount' }),
    { ...text('disbursementDate', 'Disbursement Date'), sortKey: 'disbursementDate' },
    text('repaymentFrequency', 'Repayment Frequency'),
    {
      id: 'durationDays',
      header: 'Duration (Days)',
      align: 'right',
      cell: (r) => <span className="tabular-nums">{r.durationDays}</span>,
    },
    amount('outstandingBalance', 'Outstanding Balance'),
    text('settlementDate', 'Settlement Date'),
    { id: 'loanClassification', header: 'Loan Status', cell: (r) => <AgingBadge classification={r.loanClassification} /> },
    {
      id: 'loanCycle',
      header: 'Loan Cycle',
      align: 'right',
      title: "Which facility this is in the borrower's history (1 = first)",
      cell: (r) => <span className="tabular-nums">{r.loanCycle}</span>,
    },
    text('interestRate', 'Interest Rate'),
    text('serviceCharge', 'Service Charge'),
    text('creditScore', 'Credit Score'),
  ];

  return (
    <DataTable
      caption="National Bank reporting"
      columns={columns}
      rows={rows}
      rowKey={(r, i) => r.loanAccountRefNo || String(i)}
      isLoading={result.isLoading}
      isFetching={result.isFetching}
      error={result.error}
      onRetry={result.refetch}
      {...tabSort(props, NATIONAL_BANK_ORDER)}
      paging={tabPaging(result.data, props)}
      footerLabel={totalsLabel(result.data)}
    />
  );
}
