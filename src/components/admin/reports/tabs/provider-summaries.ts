'use client';

import type { LoanProvider } from '@/lib/types';
import { useReportQueries } from '../hooks/use-report-query';
import { reportUrl, scopeParams, type ReportFilters } from '../lib/report-filters';
import type { ProviderSummary } from '../types';

export interface SummaryTabProps {
  /** The providers in view. */
  providers: LoanProvider[];
  summaries: ProviderSummary[];
  isLoading: boolean;
  isFetching: boolean;
  error: unknown;
  onRetry: () => void;
}

/** The summary of each provider in view for the period (one request per provider, side by side). */
export function useProviderSummaries(providers: LoanProvider[], filters: ReportFilters): SummaryTabProps {
  const result = useReportQueries<ProviderSummary>(
    providers.map((p) => reportUrl('/api/reports/provider-summary', { ...scopeParams(filters), providerId: p.id })),
  );
  return {
    providers,
    summaries: result.data ?? [],
    isLoading: result.isLoading,
    isFetching: result.isFetching,
    error: result.error,
    onRetry: result.refetch,
  };
}
