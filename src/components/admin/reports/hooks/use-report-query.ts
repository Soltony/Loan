'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  cancelSlot,
  forgetSlot,
  getGeneration,
  IDLE,
  isFetching,
  loadSlot,
  snapshotOf,
  subscribe,
  type Snapshot,
} from './report-store';

export { refreshReports, ReportError } from './report-store';

/** Whether any report request is running (the Refresh button spins). */
export function useReportsFetching(): boolean {
  return useSyncExternalStore(subscribe, isFetching, () => false);
}

export interface ReportQuery<T> {
  data: T | undefined;
  error: unknown;
  /** Nothing to show yet. */
  isLoading: boolean;
  /** A request is running (the data on screen may be the previous filters'). */
  isFetching: boolean;
  refetch: () => void;
}

/** This hook's slot of the report store, loaded with the URLs. */
function useSlot(urls: string[]): { snapshot: Snapshot; refetch: () => void } {
  const slot = useId();
  const key = urls.join('\n');
  const generation = useSyncExternalStore(subscribe, getGeneration, () => 0);
  const [nonce, setNonce] = useState(0);
  const handledNonce = useRef(0);

  // A layout effect, so a report already kept is in the first paint (no loading flash).
  useLayoutEffect(() => {
    const force = handledNonce.current !== nonce;
    handledNonce.current = nonce;
    loadSlot(slot, key ? key.split('\n') : [], force);
    return () => cancelSlot(slot);
  }, [slot, key, nonce, generation]);
  useEffect(() => () => forgetSlot(slot), [slot]);

  const snapshot = useSyncExternalStore(
    subscribe,
    () => snapshotOf(slot),
    () => IDLE,
  );
  const refetch = useCallback(() => setNonce((n) => n + 1), []);
  return { snapshot, refetch };
}

/** The report at `url` (null: not wanted yet). */
export function useReportQuery<T>(url: string | null): ReportQuery<T> {
  const { snapshot, refetch } = useSlot(url ? [url] : []);
  const data = url ? (snapshot.data?.[0] as T | undefined) : undefined;
  return {
    data,
    error: snapshot.error,
    isLoading: !!url && data === undefined && !snapshot.error,
    isFetching: snapshot.fetching,
    refetch,
  };
}

/** Several reports side by side (one per provider), delivered together once all have answered. */
export function useReportQueries<T>(urls: string[]): ReportQuery<T[]> {
  const { snapshot, refetch } = useSlot(urls);
  const data = snapshot.data as T[] | undefined;
  return {
    data,
    error: snapshot.error,
    isLoading: urls.length > 0 && data === undefined && !snapshot.error,
    isFetching: snapshot.fetching,
    refetch,
  };
}
