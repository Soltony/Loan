"use client";

import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { useRequirePermission } from "@/hooks/use-require-permission";
import { canDecideTransfer, TRANSFER_CHECKER_MODULE } from "@/lib/collection-transfer-access";
import type { CollectionTransfer } from "@/lib/collection-transfer-utils";
import { CollectionTransferHistory, type StatusOption } from "./history";
import { DecisionDialog, ReversalDecisionDialog } from "./actions";
import { useTransferList, type HistoryFilters } from "./use-transfer-list";

const QUEUE_STATUS = "PENDING_APPROVAL,PENDING_REVERSAL";
const DECIDED_STATUS = "APPROVED,REJECTED,REVERSED";

const QUEUE_OPTIONS: StatusOption[] = [
  { value: "all", label: "Awaiting any decision" },
  { value: "PENDING_APPROVAL", label: "New transfers" },
  { value: "PENDING_REVERSAL", label: "Reversal requests" },
];

const DECIDED_OPTIONS: StatusOption[] = [
  { value: "all", label: "All decided" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "REVERSED", label: "Reversed" },
];

const EMPTY_FILTERS: HistoryFilters = { component: "all", status: "all", from: "", to: "" };

/**
 * The checker's queue for collection transfers. Approving a transfer makes it
 * count as transferred (tax transfers post their journal entry); rejecting needs
 * a reason. Nobody can decide on a transfer they submitted or a reversal they
 * requested: the server refuses it and the row shows "Your entry" instead.
 */
export default function TransferApprovalsPage() {
  useRequirePermission(TRANSFER_CHECKER_MODULE);
  const { currentUser } = useAuth();
  const canDecide = canDecideTransfer(currentUser);

  const [tab, setTab] = useState("queue");
  const [queueFilters, setQueueFilters] = useState<HistoryFilters>(EMPTY_FILTERS);
  const [decidedFilters, setDecidedFilters] = useState<HistoryFilters>(EMPTY_FILTERS);

  const queue = useTransferList({ filters: queueFilters, baseStatus: QUEUE_STATUS });
  const decided = useTransferList({ filters: decidedFilters, baseStatus: DECIDED_STATUS, enabled: tab === "decided" });

  async function refresh() {
    await Promise.all([queue.reload(), tab === "decided" ? decided.reload() : Promise.resolve()]);
  }

  function renderQueueActions(t: CollectionTransfer) {
    if (!canDecide) return null;
    if (t.status === "PENDING_APPROVAL") {
      return <DecisionDialog transfer={t} currentUserId={currentUser?.id} onDone={refresh} />;
    }
    if (t.status === "PENDING_REVERSAL") {
      return <ReversalDecisionDialog transfer={t} currentUserId={currentUser?.id} onDone={refresh} />;
    }
    return null;
  }

  const loading = queue.loading || decided.loading;

  return (
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Transfer Approvals</h2>
          <p className="text-muted-foreground">
            Check collection transfers submitted on Collection Transfers against the CBS, then approve or reject
            them. Reversal requests are decided here too.
          </p>
        </div>
        <Button variant="outline" onClick={refresh} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Refresh
        </Button>
      </div>

      {!canDecide ? (
        <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          You can view this queue but not approve or reject transfers.
        </p>
      ) : null}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="queue">
            Awaiting decision{queue.totalMatching > 0 ? ` (${queue.totalMatching})` : ""}
          </TabsTrigger>
          <TabsTrigger value="decided">Decided</TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="mt-4">
          <CollectionTransferHistory
            title="Awaiting decision"
            description="New transfers waiting on a checker, and approved transfers with a reversal request."
            transfers={queue.transfers}
            totalMatching={queue.totalMatching}
            filters={queueFilters}
            onFiltersChange={setQueueFilters}
            statusOptions={QUEUE_OPTIONS}
            exportFileBase="Collection_Transfers_Pending"
            loading={queue.loading}
            emptyMessage="Nothing is waiting for a decision."
            renderActions={renderQueueActions}
          />
        </TabsContent>

        <TabsContent value="decided" className="mt-4">
          <CollectionTransferHistory
            title="Approved, rejected and reversed"
            description="Everything already decided, for reconciliation against the CBS."
            transfers={decided.transfers}
            totalMatching={decided.totalMatching}
            filters={decidedFilters}
            onFiltersChange={setDecidedFilters}
            statusOptions={DECIDED_OPTIONS}
            exportFileBase="Collection_Transfers_Decided"
            loading={decided.loading}
            emptyMessage="No decided transfers match these filters."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
