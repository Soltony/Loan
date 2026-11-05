'use client';

import { useReportQuery } from '../hooks/use-report-query';
import { formatCount, sumOf } from '../lib/format';
import { audienceParams, reportUrl } from '../lib/report-filters';
import { AgingBadge, BorrowerCell, Money } from '../report-cells';
import { ReportTable, totalsLabel, type ReportColumn } from '../report-table';
import { AGING_CLASSES, type BorrowerAgingRow, type ProviderSummary, type ReportPage, type TableSort } from '../types';
import type { SummaryTabProps } from './provider-summaries';
import { AgingClassFilter } from './status-filters';
import { tabPaging, tabSort, type ReportTabProps } from './tab-props';

const BORROWERS_ORDER: TableSort = { by: 'daysOverdue', dir: 'desc' };

interface ProviderAgingRow {
  providerId: string;
  name: string;
  aging: ProviderSummary['agingReport'];
}

/** An amount over how many loans it covers. */
function AmountOfLoans({ amount, loans, bold }: { amount: number; loans: number; bold?: boolean }) {
  return (
    <>
      <Money value={amount} bold={bold} />
      <div className="text-xs font-normal text-muted-foreground">
        {formatCount(loans)} {loans === 1 ? 'loan' : 'loans'}
      </div>
    </>
  );
}

function ProviderAging({ providers, summaries, isLoading, isFetching, error, onRetry }: SummaryTabProps) {
  const rows = providers.flatMap((p): ProviderAgingRow[] => {
    const summary = summaries.find((s) => s.providerId === p.id);
    return summary ? [{ providerId: p.id, name: p.name, aging: summary.agingReport }] : [];
  });
  const showTotals = rows.length > 1;
  const sum = (pick: (row: ProviderAgingRow) => number) => sumOf(rows, pick);

  const columns: ReportColumn<ProviderAgingRow>[] = [
    { id: 'provider', header: 'Provider', cell: (r) => r.name },
    ...AGING_CLASSES.map(
      (c): ReportColumn<ProviderAgingRow> => ({
        id: c.key,
        header: (
          <span className="inline-flex flex-col items-end leading-tight">
            {c.label}
            <span className="text-[11px] font-normal">{c.days}</span>
          </span>
        ),
        align: 'right',
        cell: (r) => <AmountOfLoans amount={r.aging.bucketAmounts[c.key]} loans={r.aging.buckets[c.key]} />,
        footer: showTotals ? (
          <AmountOfLoans amount={sum((r) => r.aging.bucketAmounts[c.key])} loans={sum((r) => r.aging.buckets[c.key])} />
        ) : undefined,
      }),
    ),
    {
      id: 'total',
      header: 'Total Overdue',
      align: 'right',
      cell: (r) => <AmountOfLoans amount={r.aging.totalOverdueAmount} loans={r.aging.totalOverdue} bold />,
      footer: showTotals ? (
        <AmountOfLoans amount={sum((r) => r.aging.totalOverdueAmount)} loans={sum((r) => r.aging.totalOverdue)} bold />
      ) : undefined,
    },
  ];

  return (
    <ReportTable
      caption="Aging by provider"
      columns={columns}
      rows={rows}
      rowKey={(r) => r.providerId}
      isLoading={isLoading}
      isFetching={isFetching}
      error={error}
      onRetry={onRetry}
      footerLabel="All providers"
      emptyMessage="No overdue loans."
    />
  );
}

function BorrowerAging(props: ReportTabProps) {
  const { filters, update } = props;
  // Aging is a snapshot as of today: the period does not apply.
  const result = useReportQuery<ReportPage<BorrowerAgingRow>>(
    reportUrl('/api/reports/aging-borrowers', {
      ...audienceParams(filters),
      page: String(filters.page),
      pageSize: String(filters.pageSize),
      ...(filters.search && { search: filters.search }),
      ...(filters.agingClass && { class: filters.agingClass }),
      ...(filters.sort && { sortBy: filters.sort.by, sortDir: filters.sort.dir }),
    }),
  );
  const rows = result.data?.data;
  const total = (pick: (row: BorrowerAgingRow) => number, bold?: boolean) => (
    <Money value={sumOf(rows ?? [], pick)} bold={bold} />
  );

  const columns: ReportColumn<BorrowerAgingRow>[] = [
    ...(filters.providerId === 'all'
      ? [{ id: 'provider', header: 'Provider', sortKey: 'provider', cell: (r: BorrowerAgingRow) => r.provider }]
      : []),
    {
      id: 'borrower',
      header: 'Borrower',
      cell: (r) => <BorrowerCell name={r.borrowerName} phone={r.borrowerPhone} account={r.borrowerAccount} />,
    },
    {
      id: 'loans',
      header: 'Loans',
      align: 'right',
      sortKey: 'loanCount',
      cell: (r) => <span className="tabular-nums">{r.loanCount}</span>,
    },
    {
      id: 'daysOverdue',
      header: 'Days Overdue',
      align: 'right',
      sortKey: 'daysOverdue',
      title: "Days past due of the borrower's oldest overdue loan",
      cell: (r) => <span className="tabular-nums">{r.daysOverdue}</span>,
    },
    { id: 'category', header: 'Category', cell: (r) => <AgingBadge classification={r.classification} /> },
    {
      id: 'principal',
      header: 'Principal Outstanding',
      align: 'right',
      sortKey: 'principalOutstanding',
      cell: (r) => <Money value={r.principalOutstanding} />,
      footer: total((r) => r.principalOutstanding),
    },
    {
      id: 'interest',
      header: 'Interest Outstanding',
      align: 'right',
      cell: (r) => <Money value={r.interestOutstanding} />,
      footer: total((r) => r.interestOutstanding),
    },
    {
      id: 'serviceFee',
      header: 'Service Fee Outstanding',
      align: 'right',
      cell: (r) => <Money value={r.serviceFeeOutstanding} />,
      footer: total((r) => r.serviceFeeOutstanding),
    },
    {
      id: 'penalty',
      header: 'Penalty Outstanding',
      align: 'right',
      cell: (r) => <Money value={r.penaltyOutstanding} />,
      footer: total((r) => r.penaltyOutstanding),
    },
    {
      id: 'total',
      header: 'Total Outstanding',
      align: 'right',
      sortKey: 'totalOutstanding',
      cell: (r) => <Money value={r.totalOutstanding} bold />,
      footer: total((r) => r.totalOutstanding, true),
    },
  ];

  return (
    <ReportTable
      caption="Borrower-level aging"
      columns={columns}
      rows={rows}
      rowKey={(r) => `${r.providerId}:${r.borrowerId}`}
      isLoading={result.isLoading}
      isFetching={result.isFetching}
      error={result.error}
      onRetry={result.refetch}
      {...tabSort(props, BORROWERS_ORDER)}
      paging={tabPaging(result.data, props)}
      footerLabel={totalsLabel(result.data)}
      emptyMessage={
        filters.search || filters.agingClass
          ? 'No overdue borrowers match the search or class.'
          : 'No overdue borrowers.'
      }
      toolbar={<AgingClassFilter value={filters.agingClass} onChange={(agingClass) => update({ agingClass })} />}
    />
  );
}

/**
 * Overdue loans as of today: per provider (amount and loans in each class,
 * each loan classed by its own days overdue), then per borrower (classed by
 * their oldest overdue loan).
 */
export function AgingTab({ summary, ...props }: ReportTabProps & { summary: SummaryTabProps }) {
  return (
    <div className="space-y-6">
      <ProviderAging {...summary} />
      <section className="space-y-2">
        <h3 className="text-lg font-medium">Borrower-level Aging</h3>
        <BorrowerAging {...props} />
      </section>
    </div>
  );
}
