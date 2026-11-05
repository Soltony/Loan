'use client';

import { AlarmClock, Banknote, HandCoins, ShieldAlert, Wallet } from 'lucide-react';
import { StatTile } from '@/components/ui/stat-tile';
import { cn } from '@/lib/utils';
import { useReportQuery } from './hooks/use-report-query';
import { formatCompact, formatCount, formatMoney } from './lib/format';
import { periodLabel, reportUrl, scopeParams, type ReportFilters } from './lib/report-filters';
import { NPL_CLASSES, type OverviewSummary } from './types';

/**
 * Headline figures above the detail tabs, for the providers and branches in
 * view: what was disbursed and collected in the period, and what is
 * outstanding, overdue and non-performing now. The Overall tab shows the same
 * figures in full, so the strip is left off there.
 */
export function ReportSummary({ filters }: { filters: ReportFilters }) {
  const { data, error, isFetching } = useReportQuery<OverviewSummary>(
    reportUrl('/api/reports/overview', { ...scopeParams(filters), sections: 'summary' }),
  );

  if (error && !data) {
    return (
      <p className="rounded-md border border-dashed p-3 text-sm text-destructive">
        Could not load the summary: {error instanceof Error ? error.message : 'Something went wrong.'}
      </p>
    );
  }

  const loading = !data;
  const kpis = data?.kpis;
  const npl = (data?.aging ?? []).filter((row) => (NPL_CLASSES as string[]).includes(row.bucket));
  const nplAmount = npl.reduce((sum, row) => sum + row.amount, 0);
  const nplLoans = npl.reduce((sum, row) => sum + row.loans, 0);
  const period = periodLabel(filters);

  return (
    <div
      className={cn('grid gap-3 transition-opacity sm:grid-cols-2 lg:grid-cols-5', isFetching && data && 'opacity-70')}
      aria-busy={isFetching}
    >
      <StatTile
        label="Disbursed"
        value={kpis ? formatCompact(kpis.disbursedAmount) : '—'}
        hint={kpis ? `${period} · ${formatCount(kpis.loansDisbursed)} loans` : 'Loading…'}
        icon={Banknote}
        tone="info"
        loading={loading}
      />
      <StatTile
        label="Collected"
        value={kpis ? formatCompact(kpis.collectedAmount) : '—'}
        hint={kpis ? `${period} · ${formatCount(kpis.repaymentCount)} repayments` : 'Loading…'}
        icon={HandCoins}
        tone="success"
        loading={loading}
      />
      <StatTile
        label="Outstanding now"
        value={kpis ? formatCompact(kpis.outstandingBalance) : '—'}
        hint={kpis ? `${formatCount(kpis.outstandingLoans)} unpaid loans` : 'Loading…'}
        icon={Wallet}
        loading={loading}
      />
      <StatTile
        label="Overdue now"
        value={kpis ? formatCompact(kpis.overdueBalance) : '—'}
        hint={kpis ? `${formatCount(kpis.overdueLoans)} loans · PAR ${kpis.parRatio.toFixed(1)}%` : 'Loading…'}
        icon={AlarmClock}
        tone="warning"
        loading={loading}
      />
      <StatTile
        label="NPL (90+ days)"
        value={data ? formatCompact(nplAmount) : '—'}
        hint={data ? `${formatCount(nplLoans)} loans · ${formatMoney(nplAmount)}` : 'Loading…'}
        icon={ShieldAlert}
        tone="danger"
        loading={loading}
      />
    </div>
  );
}
