'use client';

import { useMemo, useState } from 'react';
import type { LoanProvider } from '@/lib/types';
import { formatMoney } from '../lib/format';
import { Money } from '../report-cells';
import { ReportTable, type ReportColumn } from '../report-table';
import type { ProviderSummary, TableSort } from '../types';
import type { SummaryTabProps } from './provider-summaries';

interface UtilizationRow {
  provider: LoanProvider;
  summary: ProviderSummary;
  available: number;
}

const percent = (value: number) => `${(value || 0).toFixed(2)}%`;

/** Each provider's fund against what it has disbursed and has outstanding (every row on screen). */
export function FundUtilizationTab({ providers, summaries, isLoading, isFetching, error, onRetry }: SummaryTabProps) {
  const [sort, setSort] = useState<TableSort>({ by: 'provider', dir: 'asc' });

  const rows = useMemo(() => {
    const list = providers.flatMap((provider): UtilizationRow[] => {
      const summary = summaries.find((s) => s.providerId === provider.id);
      return summary
        ? [{ provider, summary, available: provider.startingCapital - summary.portfolioSummary.outstanding }]
        : [];
    });
    const value = (row: UtilizationRow): number | string =>
      sort.by === 'utilization'
        ? row.summary.fundUtilization
        : sort.by === 'available'
          ? row.available
          : sort.by === 'disbursed'
            ? row.summary.portfolioSummary.disbursed
            : row.provider.name;
    const sign = sort.dir === 'asc' ? 1 : -1;
    return list.sort((a, b) => {
      const x = value(a);
      const y = value(b);
      return sign * (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y)));
    });
  }, [providers, summaries, sort]);

  const sum = (pick: (row: UtilizationRow) => number) => rows.reduce((total, row) => total + pick(row), 0);
  const capital = sum((r) => r.provider.startingCapital);
  // Utilization is principal ever disbursed over capital, so the total weighs each provider by its capital.
  const utilization = capital
    ? (sum((r) => (r.summary.fundUtilization * r.provider.startingCapital) / 100) / capital) * 100
    : 0;
  const showTotals = rows.length > 1;

  const columns: ReportColumn<UtilizationRow>[] = [
    { id: 'provider', header: 'Provider', sortKey: 'provider', cell: (r) => r.provider.name },
    {
      id: 'fund',
      header: 'Provider Fund',
      align: 'right',
      cell: (r) => <Money value={r.provider.startingCapital} />,
      footer: showTotals ? <Money value={capital} /> : undefined,
    },
    {
      id: 'disbursed',
      header: 'Loans Disbursed',
      align: 'right',
      sortKey: 'disbursed',
      title: 'Principal disbursed in the selected period',
      cell: (r) => <Money value={r.summary.portfolioSummary.disbursed} />,
      footer: showTotals ? <Money value={sum((r) => r.summary.portfolioSummary.disbursed)} /> : undefined,
    },
    {
      id: 'outstanding',
      header: 'Outstanding Principal',
      align: 'right',
      title: 'Principal of the loans still unpaid, as of now',
      cell: (r) => <Money value={r.summary.portfolioSummary.outstanding} />,
      footer: showTotals ? <Money value={sum((r) => r.summary.portfolioSummary.outstanding)} /> : undefined,
    },
    {
      id: 'available',
      header: 'Available Fund',
      align: 'right',
      sortKey: 'available',
      cell: (r) => <Money value={r.available} />,
      footer: showTotals ? <Money value={sum((r) => r.available)} /> : undefined,
    },
    {
      id: 'utilization',
      header: 'Utilization %',
      align: 'right',
      sortKey: 'utilization',
      cell: (r) => <span className="tabular-nums">{percent(r.summary.fundUtilization)}</span>,
      footer: showTotals ? <span className="tabular-nums">{percent(utilization)}</span> : undefined,
    },
  ];

  return (
    <div className="space-y-2">
      <ReportTable
        caption="Fund utilization"
        columns={columns}
        rows={rows}
        rowKey={(r) => r.provider.id}
        isLoading={isLoading}
        isFetching={isFetching}
        error={error}
        onRetry={onRetry}
        sort={sort}
        onSortChange={setSort}
        footerLabel="All providers"
      />
      <p className="text-xs text-muted-foreground">
        Loans Disbursed covers the selected period; outstanding principal and utilization (principal ever disbursed
        over the provider fund, {formatMoney(capital)} in total) are as of now.
      </p>
    </div>
  );
}
