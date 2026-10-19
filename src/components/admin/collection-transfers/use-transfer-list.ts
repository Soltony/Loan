"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import type { CollectionTransfer } from "@/lib/collection-transfer-utils";

export const HISTORY_LIMIT = 1000;

export type HistoryFilters = {
  component: string; // "all" or a component key
  status: string; // "all" or comma-separated statuses
  from: string; // yyyy-MM-dd
  to: string;
};

/** Loads transfers for the given filters; the latest request wins so slow responses cannot overwrite newer filters. */
export function useTransferList(params: {
  providerId?: string; // omit to list every provider (checker queue)
  filters: HistoryFilters;
  baseStatus?: string; // used when filters.status is "all"
  enabled?: boolean;
}) {
  const { toast } = useToast();
  const { providerId, filters, baseStatus, enabled = true } = params;
  const [transfers, setTransfers] = useState<CollectionTransfer[]>([]);
  const [totalMatching, setTotalMatching] = useState(0);
  const [loading, setLoading] = useState(false);
  const requestRef = useRef(0);

  const reload = useCallback(async () => {
    if (!enabled) return;
    const requestId = ++requestRef.current;
    setLoading(true);
    try {
      const query = new URLSearchParams({ page: "1", limit: String(HISTORY_LIMIT) });
      if (providerId) query.set("providerId", providerId);
      if (filters.component !== "all") query.set("component", filters.component);
      const status = filters.status !== "all" ? filters.status : baseStatus;
      if (status) query.set("status", status);
      if (filters.from) query.set("from", filters.from);
      if (filters.to) query.set("to", filters.to);
      const res = await fetch(`/api/collection-transfers?${query.toString()}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to load transfers");
      if (requestId !== requestRef.current) return;
      setTransfers((json?.data ?? []) as CollectionTransfer[]);
      setTotalMatching(json?.pagination?.total ?? 0);
    } catch (e: any) {
      if (requestId !== requestRef.current) return;
      toast({ title: "Error", description: e?.message ?? "Could not load transfers.", variant: "destructive" });
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [enabled, providerId, filters, baseStatus, toast]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { transfers, totalMatching, loading, reload };
}
