'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { Download, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DateRangeFilter } from '@/components/ui/date-range-filter';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { branchLabel } from '@/lib/branches';
import type { LoanProvider } from '@/lib/types';
import { cn } from '@/lib/utils';
import type { UpdateFilters } from './hooks/use-report-filters';
import { refreshReports, useReportsFetching } from './hooks/use-report-query';
import { currentMonth, TIMEFRAMES, type ReportFilters, type Timeframe } from './lib/report-filters';

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => ({
  value: String(index + 1).padStart(2, '0'),
  label: format(new Date(2000, index, 1), 'MMMM'),
}));

function yearOptions(now: Date = new Date()): string[] {
  return Array.from({ length: 6 }, (_, index) => String(now.getFullYear() - index));
}

/**
 * The days of a custom range. Typing one end changes nothing yet: the range
 * applies once both ends are set, so a half-filled range never reloads the
 * reports with a window the user did not mean.
 */
function RangeInputs({
  filters,
  update,
  onDraftChange,
}: {
  filters: ReportFilters;
  update: UpdateFilters;
  onDraftChange: (pending: boolean) => void;
}) {
  const applied = filters.timeframe === 'custom' ? { from: filters.from ?? '', to: filters.to ?? '' } : null;
  const [draft, setDraft] = useState<{ from: string; to: string } | null>(null);
  const shown = draft ?? applied ?? { from: '', to: '' };

  const change = (end: 'from' | 'to', value: string) => {
    const next = { ...shown, [end]: value };
    if (next.from && next.to) {
      const [from, to] = next.from <= next.to ? [next.from, next.to] : [next.to, next.from];
      update({ timeframe: 'custom', from, to, month: undefined });
      setDraft(null);
      onDraftChange(false);
    } else {
      setDraft(next);
      onDraftChange(!!(next.from || next.to));
    }
  };

  return (
    <DateRangeFilter
      from={shown.from}
      to={shown.to}
      onFromChange={(value) => change('from', value)}
      onToChange={(value) => change('to', value)}
      onClear={() => {
        setDraft(null);
        onDraftChange(false);
        if (filters.timeframe === 'custom') update({ timeframe: 'overall', from: undefined, to: undefined });
      }}
    />
  );
}

function RefreshButton() {
  const fetching = useReportsFetching();
  return (
    <Button variant="outline" size="icon" aria-label="Refresh reports" title="Refresh reports" onClick={refreshReports}>
      <RefreshCw className={cn('h-4 w-4', fetching && 'animate-spin')} />
    </Button>
  );
}

/** Period, provider, branch, refresh and export controls of the reports screen. */
export function ReportToolbar({
  filters,
  update,
  providers,
  canViewAllProviders,
  branchCodes,
  onExport,
  isExporting,
}: {
  filters: ReportFilters;
  update: UpdateFilters;
  providers: LoanProvider[];
  canViewAllProviders: boolean;
  /** A District user's branches; empty for everyone else. */
  branchCodes: number[];
  onExport: () => void;
  isExporting: boolean;
}) {
  const [pendingRange, setPendingRange] = useState(false);
  const [month, year] = [
    (filters.month ?? currentMonth()).slice(5, 7),
    (filters.month ?? currentMonth()).slice(0, 4),
  ];

  return (
    // Bottom-aligned so the labelled From/To inputs line up with the controls beside them.
    <div className="flex flex-wrap items-end gap-2">
      <Select
        value={pendingRange ? 'custom' : filters.timeframe}
        onValueChange={(value) => {
          const timeframe = value as Timeframe;
          // "Custom Range" applies from the From/To days.
          setPendingRange(timeframe === 'custom');
          if (timeframe === 'custom') return;
          update({
            timeframe,
            month: timeframe === 'month' ? (filters.month ?? currentMonth()) : undefined,
            from: undefined,
            to: undefined,
          });
        }}
      >
        <SelectTrigger className="w-[170px]" aria-label="Period">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TIMEFRAMES.map((t) => (
            <SelectItem key={t.value} value={t.value}>
              {t.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {filters.timeframe === 'month' && !pendingRange ? (
        <>
          <Select value={month} onValueChange={(value) => update({ month: `${year}-${value}` })}>
            <SelectTrigger className="w-[140px]" aria-label="Month">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTH_OPTIONS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={year} onValueChange={(value) => update({ month: `${value}-${month}` })}>
            <SelectTrigger className="w-[100px]" aria-label="Year">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearOptions().map((y) => (
                <SelectItem key={y} value={y}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      ) : null}

      <RangeInputs
        // A new applied range (or none) restarts the inputs from it.
        key={`${filters.timeframe}:${filters.from ?? ''}:${filters.to ?? ''}`}
        filters={filters}
        update={update}
        onDraftChange={setPendingRange}
      />

      {canViewAllProviders ? (
        <Select value={filters.providerId} onValueChange={(providerId) => update({ providerId })}>
          <SelectTrigger className="w-[180px]" aria-label="Provider">
            <SelectValue placeholder="Select Provider" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Providers</SelectItem>
            {providers.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      {branchCodes.length > 0 ? (
        <Select value={filters.branch} onValueChange={(branch) => update({ branch })}>
          <SelectTrigger className="w-[240px]" aria-label="Branch">
            <SelectValue placeholder="All Branches" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Branches</SelectItem>
            {branchCodes.map((code) => (
              <SelectItem key={code} value={String(code)}>
                {branchLabel(code)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      <RefreshButton />
      <Button variant="outline" onClick={onExport} disabled={isExporting}>
        {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
        {isExporting ? 'Exporting…' : 'Excel'}
      </Button>
    </div>
  );
}
