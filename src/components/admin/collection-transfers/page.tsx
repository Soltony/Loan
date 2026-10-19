"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Loader2, RefreshCw } from "lucide-react";
import { useRequirePermission } from "@/hooks/use-require-permission";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  clampNonNegative,
  componentLabel,
  formatCurrency,
  isReversible,
  type CollectionTransferSummary,
  type TransferComponent,
} from "@/lib/collection-transfer-utils";
import {
  canRequestTransferReversal,
  canSubmitTransfer,
  TRANSFER_MAKER_MODULE,
} from "@/lib/collection-transfer-access";
import {
  CollectionTransferForm,
  parseAmountLoose,
  type CollectionTransferDraft,
} from "./form";
import { ComponentBalanceCards, SelectedComponentSummary } from "./component-balances";
import { CollectionTransferHistory, type StatusOption } from "./history";
import { RequestReversalDialog } from "./actions";
import { useTransferList, type HistoryFilters } from "./use-transfer-list";

const STATUS_OPTIONS: StatusOption[] = [
  { value: "all", label: "All statuses" },
  { value: "PENDING_APPROVAL", label: "Pending approval" },
  { value: "APPROVED", label: "Approved" },
  { value: "PENDING_REVERSAL", label: "Reversal pending" },
  { value: "REJECTED", label: "Rejected" },
  { value: "REVERSED", label: "Reversed" },
];

type ProviderOption = { id: string; name: string };

function todayYmd() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function emptyDraft(component: TransferComponent): CollectionTransferDraft {
  return {
    component,
    transferAmount: "",
    sourceAccountName: "",
    destinationAccountName: "",
    transferReference: "",
    transferDate: todayYmd(),
    notes: "",
  };
}

export default function CollectionTransfersPage() {
  useRequirePermission(TRANSFER_MAKER_MODULE);
  const { toast } = useToast();
  const { currentUser } = useAuth();
  const canCreate = canSubmitTransfer(currentUser);
  const canReverse = canRequestTransferReversal(currentUser);

  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [providerId, setProviderId] = useState("");
  const [summary, setSummary] = useState<CollectionTransferSummary | null>(null);
  const [filters, setFilters] = useState<HistoryFilters>({ component: "all", status: "all", from: "", to: "" });

  const [loadingProviders, setLoadingProviders] = useState(true);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [posting, setPosting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [draft, setDraft] = useState<CollectionTransferDraft>(() => emptyDraft("Penalty"));

  const history = useTransferList({ providerId, filters, enabled: !!providerId });

  const balance = summary?.components.find((c) => c.component === draft.component);
  const available = balance?.available ?? 0;
  const parsedAmount = parseAmountLoose(draft.transferAmount);
  const providerName = providers.find((p) => p.id === providerId)?.name ?? "";

  const fetchSummary = useCallback(
    async (id: string) => {
      if (!id) return null;
      setLoadingSummary(true);
      try {
        const res = await fetch(`/api/collection-transfers?summary=true&providerId=${encodeURIComponent(id)}`);
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || "Failed to load balances");
        setSummary(json as CollectionTransferSummary);
        return json as CollectionTransferSummary;
      } catch (e: any) {
        toast({ title: "Error", description: e?.message ?? "Could not load balances.", variant: "destructive" });
        return null;
      } finally {
        setLoadingSummary(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    (async () => {
      setLoadingProviders(true);
      try {
        const res = await fetch("/api/providers");
        if (!res.ok) throw new Error("Failed to load providers");
        const data = await res.json();
        const opts: ProviderOption[] = (data ?? []).map((p: any) => ({ id: p.id, name: p.name }));
        setProviders(opts);
        setProviderId((prev) => (opts.some((p) => p.id === prev) ? prev : opts[0]?.id ?? ""));
      } catch (e: any) {
        toast({ title: "Error", description: e?.message ?? "Could not load providers.", variant: "destructive" });
      } finally {
        setLoadingProviders(false);
      }
    })();
  }, [toast]);

  useEffect(() => {
    if (!providerId) return;
    setSummary(null);
    fetchSummary(providerId).then((s) => {
      // Prefill the accounts last used for the selected component.
      const last = s?.suggestions?.[draft.component];
      setDraft((prev) => ({
        ...prev,
        sourceAccountName: prev.sourceAccountName || last?.sources[0] || "",
        destinationAccountName: prev.destinationAccountName || last?.destinations[0] || "",
      }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerId, fetchSummary]);

  function selectComponent(component: TransferComponent) {
    if (component === draft.component) return;
    const last = summary?.suggestions?.[component];
    setDraft((prev) => ({
      ...prev,
      component,
      transferAmount: "",
      sourceAccountName: last?.sources[0] ?? "",
      destinationAccountName: last?.destinations[0] ?? "",
    }));
  }

  async function refreshAll() {
    if (!providerId) return;
    await Promise.all([fetchSummary(providerId), history.reload()]);
  }

  async function submitTransfer() {
    if (!providerId) return;
    setPosting(true);
    try {
      const payload = {
        providerId,
        component: draft.component,
        transferAmount: parsedAmount,
        sourceAccountName: draft.sourceAccountName.trim(),
        destinationAccountName: draft.destinationAccountName.trim(),
        transferReference: draft.transferReference.trim(),
        transferDate: draft.transferDate,
        notes: draft.notes.trim() || undefined,
      };
      const res = await fetch("/api/collection-transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to submit transfer");

      toast({
        title: "Submitted for approval",
        description: `${componentLabel(draft.component)} ${formatCurrency(parsedAmount)} · Ref ${payload.transferReference}`,
      });
      setConfirmOpen(false);
      // Keep component, accounts and date: consecutive entries usually share them.
      setDraft((prev) => ({ ...prev, transferAmount: "", transferReference: "", notes: "" }));
      await refreshAll();
    } catch (e: any) {
      toast({ title: "Submission failed", description: e?.message ?? "Could not submit transfer.", variant: "destructive" });
    } finally {
      setPosting(false);
    }
  }

  const amountAfter = useMemo(
    () => clampNonNegative(available - (Number.isFinite(parsedAmount) ? parsedAmount : 0)),
    [available, parsedAmount]
  );

  return (
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Collection Transfers</h2>
          <p className="text-muted-foreground">
            Record transfers of collected penalty, interest, service fee and tax from the collection GL to their
            destination accounts. Each transfer is approved by a checker.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {providers.length > 1 ? (
            <Select value={providerId} onValueChange={setProviderId} disabled={loadingProviders || posting}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                {providers.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <Button variant="outline" onClick={refreshAll} disabled={!providerId || loadingSummary || history.loading}>
            {loadingSummary || history.loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Refresh
          </Button>
        </div>
      </div>

      <ComponentBalanceCards
        balances={summary?.components ?? []}
        selected={draft.component}
        onSelect={selectComponent}
        loading={loadingProviders || (loadingSummary && !summary)}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <CollectionTransferForm
            draft={draft}
            available={available}
            suggestions={summary?.suggestions?.[draft.component]}
            maxDate={todayYmd()}
            onChange={setDraft}
            onComponentChange={selectComponent}
            disabled={posting || loadingProviders || loadingSummary || !providerId}
            canCreate={canCreate}
            onSubmit={() => setConfirmOpen(true)}
          />
        </div>
        <SelectedComponentSummary
          balance={balance}
          component={draft.component}
          amount={Number.isFinite(parsedAmount) ? parsedAmount : null}
        />
      </div>

      <CollectionTransferHistory
        title="Transfer history"
        transfers={history.transfers}
        totalMatching={history.totalMatching}
        filters={filters}
        onFiltersChange={setFilters}
        statusOptions={STATUS_OPTIONS}
        exportFileBase={`Collection_Transfers_${providerName.replace(/\s+/g, "_")}`}
        loading={history.loading}
        renderActions={(t) =>
          canReverse && isReversible(t.status) ? <RequestReversalDialog transfer={t} onDone={refreshAll} /> : null
        }
      />

      <AlertDialog open={confirmOpen} onOpenChange={(open) => !posting && setConfirmOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit {componentLabel(draft.component).toLowerCase()} transfer for approval</AlertDialogTitle>
            <AlertDialogDescription>
              The amount is reserved until a checker decides on Transfer Approvals.{" "}
              {balance?.postsJournal
                ? `On approval, a balanced journal entry is posted out of ${balance.sourceLedgerName ?? "Tax Receivable"}.`
                : "On approval it is recorded in the register. No ledger posting is made."}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2 text-sm">
            <ConfirmRow label="Provider" value={providerName} />
            <ConfirmRow label="Component" value={componentLabel(draft.component)} />
            <div className="rounded-md border p-3">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 break-words font-medium">{draft.sourceAccountName.trim()}</span>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 break-words text-right font-medium">
                  {draft.destinationAccountName.trim()}
                </span>
              </div>
            </div>
            <ConfirmRow label="Amount" value={formatCurrency(parsedAmount)} mono strong />
            <ConfirmRow label="Reference" value={draft.transferReference.trim()} mono />
            <ConfirmRow label="Transfer date" value={draft.transferDate} />
            {draft.notes.trim() ? <ConfirmRow label="Notes" value={draft.notes.trim()} /> : null}
            <div className="space-y-1 border-t pt-2">
              <ConfirmRow label="Available before" value={formatCurrency(available)} mono />
              <ConfirmRow label="Available after" value={formatCurrency(amountAfter)} mono />
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={posting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                submitTransfer();
              }}
              disabled={posting}
            >
              {posting ? "Submitting..." : "Submit for approval"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ConfirmRow(props: { label: string; value: string; mono?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="shrink-0 text-muted-foreground">{props.label}</span>
      <span
        className={[
          "min-w-0 break-words text-right",
          props.mono ? "font-mono" : "font-medium",
          props.strong ? "font-semibold" : "",
        ].join(" ")}
      >
        {props.value}
      </span>
    </div>
  );
}
