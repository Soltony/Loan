'use client';

import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { filtersQuery, parseFilters, type ReportFilters } from '../lib/report-filters';

export type UpdateFilters = (patch: Partial<ReportFilters>, options?: { keepPage?: boolean }) => void;

/**
 * The reports screen's filters, read from the page URL once and written back
 * to it as they change (history.replaceState: no navigation, so the page's
 * server data is not fetched again). Any change but paging goes to page 1.
 */
export function useReportFilters(
  defaultProvider: string,
  isAllowedProvider: (providerId: string) => boolean,
  isAllowedBranch: (branch: string) => boolean,
): { filters: ReportFilters; update: UpdateFilters } {
  const searchParams = useSearchParams();
  const [state, setState] = useState(() => parseFilters(new URLSearchParams(searchParams?.toString() ?? '')));

  // No choice yet, or one the user may not see (a stale or shared link): their default.
  const providerId = state.providerId && isAllowedProvider(state.providerId) ? state.providerId : defaultProvider;
  const branch = isAllowedBranch(state.branch) ? state.branch : 'all';
  const filters = useMemo(() => ({ ...state, providerId, branch }), [state, providerId, branch]);

  useEffect(() => {
    const query = filtersQuery(filters, defaultProvider);
    const url = `${window.location.pathname}${query ? `?${query}` : ''}`;
    if (url !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(window.history.state, '', url);
    }
  }, [filters, defaultProvider]);

  const update = useCallback<UpdateFilters>(
    (patch, options) => setState((current) => ({ ...current, ...(!options?.keepPage && { page: 1 }), ...patch })),
    [],
  );

  return { filters, update };
}
