"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  componentLabel,
  formatCurrency,
  sourceAccountLabel,
  type CollectionTransfer,
  type CollectionTransferSummary,
} from "@/lib/collection-transfer-utils";
import { displayDate, displayDateTime, TransferStatusBadge } from "./history";

const MIN_REASON = 5;

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || "Request failed");
  return json;
}

function DetailRow(props: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="shrink-0 text-muted-foreground">{props.label}</span>
      <span className={props.mono ? "min-w-0 break-words text-right font-mono" : "min-w-0 break-words text-right font-medium"}>
        {props.children}
      </span>
    </div>
  );
}

/** Everything a checker needs to see before deciding. */
export function TransferDetails({ transfer }: { transfer: CollectionTransfer }) {
  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">
          {componentLabel(transfer.component)}
          {transfer.provider?.name ? ` · ${transfer.provider.name}` : ""}
        </span>
        <TransferStatusBadge status={transfer.status} />
      </div>
      <div className="rounded-md border p-3">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 break-words font-medium">{sourceAccountLabel(transfer)}</span>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1 break-words text-right font-medium">{transfer.destinationAccountName}</span>
        </div>
      </div>
      <DetailRow label="Amount" mono>
        <span className="font-semibold">{formatCurrency(transfer.transferAmount)}</span>
      </DetailRow>
      <DetailRow label="Reference" mono>
        {transfer.transferReference}
      </DetailRow>
      <DetailRow label="Transfer date">{displayDate(transfer.transferDate)}</DetailRow>
      {transfer.notes ? <DetailRow label="Notes">{transfer.notes}</DetailRow> : null}
      <DetailRow label="Submitted by">
        {transfer.recordedByUser?.fullName ?? "-"} · {displayDateTime(transfer.createdAt)}
      </DetailRow>
      {transfer.checkedByUser ? (
        <DetailRow label="Checked by">
          {transfer.checkedByUser.fullName} · {displayDateTime(transfer.checkedAt)}
        </DetailRow>
      ) : null}
      {transfer.status === "PENDING_REVERSAL" ? (
        <>
          <DetailRow label="Reversal requested by">
            {transfer.reversalRequestedByUser?.fullName ?? "-"} · {displayDateTime(transfer.reversalRequestedAt)}
          </DetailRow>
          <DetailRow label="Reversal reason">{transfer.reversalReason ?? "-"}</DetailRow>
        </>
      ) : null}
    </div>
  );
}

/** Maker: ask for an approved transfer to be reversed. A checker decides on Transfer Approvals. */
export function RequestReversalDialog(props: { transfer: CollectionTransfer; onDone: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const label = componentLabel(props.transfer.component).toLowerCase();

  async function submit() {
    setBusy(true);
    try {
      await postJson(`/api/collection-transfers/${props.transfer.id}/reversal`, {
        action: "request",
        reason: reason.trim(),
      });
      toast({ title: "Reversal requested", description: "A checker must approve it on Transfer Approvals." });
      setOpen(false);
      setReason("");
      props.onDone();
    } catch (e: any) {
      toast({ title: "Request failed", description: e?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Request reversal
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request reversal of this {label} transfer</DialogTitle>
          <DialogDescription>
            Use it for a record entered in error. The transfer stays approved until a checker approves the
            reversal. The transfer in the CBS is not affected.
          </DialogDescription>
        </DialogHeader>
        <TransferDetails transfer={props.transfer} />
        <div className="space-y-2">
          <Label htmlFor={`reversal-${props.transfer.id}`}>Reason</Label>
          <Textarea
            id={`reversal-${props.transfer.id}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={`At least ${MIN_REASON} characters`}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || reason.trim().length < MIN_REASON}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Request reversal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Shows the component balance at decision time, so the checker sees what approval leaves. */
function ComponentBalanceNote({ transfer, open }: { transfer: CollectionTransfer; open: boolean }) {
  const [summary, setSummary] = useState<CollectionTransferSummary | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch(`/api/collection-transfers?summary=true&providerId=${encodeURIComponent(transfer.providerId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => !cancelled && setSummary(json))
      .catch(() => !cancelled && setSummary(null));
    return () => {
      cancelled = true;
    };
  }, [open, transfer.providerId]);

  const balance = summary?.components.find((c) => c.component === transfer.component);
  if (!balance) return null;
  const label = componentLabel(transfer.component);

  return (
    <div className="space-y-1 rounded-md bg-muted/50 p-3 text-sm">
      <DetailRow label={`${label} collected`} mono>
        {formatCurrency(balance.collected)}
      </DetailRow>
      <DetailRow label="Already approved" mono>
        {formatCurrency(balance.transferred)}
      </DetailRow>
      <DetailRow label="Pending approval (incl. this)" mono>
        {formatCurrency(balance.pending)}
      </DetailRow>
      <DetailRow label="Left after all pending" mono>
        <span className={balance.available < 0 ? "text-destructive" : undefined}>{formatCurrency(balance.available)}</span>
      </DetailRow>
      <p className="pt-1 text-xs text-muted-foreground">
        {balance.postsJournal
          ? `Approving posts a journal entry from ${balance.sourceLedgerName ?? "Tax Receivable"} to the destination account.`
          : "Approving records the transfer in the register. No ledger posting is made."}
      </p>
    </div>
  );
}

/** Checker: approve or reject a submitted transfer. */
export function DecisionDialog(props: { transfer: CollectionTransfer; currentUserId?: string; onDone: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const ownEntry = props.transfer.recordedByUserId === props.currentUserId;

  if (ownEntry) {
    return (
      <Button variant="outline" size="sm" disabled title="You cannot decide on a transfer you submitted yourself.">
        Your entry
      </Button>
    );
  }

  async function decide(approved: boolean) {
    setBusy(approved ? "approve" : "reject");
    try {
      await postJson(`/api/collection-transfers/${props.transfer.id}/decision`, {
        approved,
        rejectionReason: approved ? undefined : reason.trim(),
      });
      toast({
        title: approved ? "Transfer approved" : "Transfer rejected",
        description: `${componentLabel(props.transfer.component)} ${formatCurrency(props.transfer.transferAmount)} · Ref ${props.transfer.transferReference}`,
      });
      setOpen(false);
      setReason("");
      props.onDone();
    } catch (e: any) {
      toast({ title: "Decision failed", description: e?.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
      <DialogTrigger asChild>
        <Button size="sm">Review</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review transfer</DialogTitle>
          <DialogDescription>Check the details against the CBS transfer before approving.</DialogDescription>
        </DialogHeader>
        <TransferDetails transfer={props.transfer} />
        <ComponentBalanceNote transfer={props.transfer} open={open} />
        <div className="space-y-2">
          <Label htmlFor={`reject-${props.transfer.id}`}>Rejection reason (required to reject)</Label>
          <Textarea
            id={`reject-${props.transfer.id}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Amount does not match FT"
          />
        </div>
        <DialogFooter className="gap-2">
          <Button
            variant="destructive"
            onClick={() => decide(false)}
            disabled={!!busy || reason.trim().length < MIN_REASON}
          >
            {busy === "reject" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Reject
          </Button>
          <Button onClick={() => decide(true)} disabled={!!busy}>
            {busy === "approve" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Checker: approve or decline a reversal request. */
export function ReversalDecisionDialog(props: {
  transfer: CollectionTransfer;
  currentUserId?: string;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const ownRequest = props.transfer.reversalRequestedByUserId === props.currentUserId;

  if (ownRequest) {
    return (
      <Button variant="outline" size="sm" disabled title="You cannot decide on a reversal you requested yourself.">
        Your request
      </Button>
    );
  }

  async function decide(action: "approve" | "reject") {
    setBusy(action);
    try {
      await postJson(`/api/collection-transfers/${props.transfer.id}/reversal`, { action, reason: note.trim() });
      toast({
        title: action === "approve" ? "Reversal approved" : "Reversal declined",
        description: `Ref ${props.transfer.transferReference}`,
      });
      setOpen(false);
      setNote("");
      props.onDone();
    } catch (e: any) {
      toast({ title: "Decision failed", description: e?.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">
          Review reversal
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review reversal request</DialogTitle>
          <DialogDescription>
            {props.transfer.journalEntryId
              ? "Approving posts a compensating journal entry and restores the collected tax balance."
              : `Approving returns ${formatCurrency(props.transfer.transferAmount)} to the ${componentLabel(props.transfer.component).toLowerCase()} available to transfer.`}{" "}
            Declining leaves the transfer approved.
          </DialogDescription>
        </DialogHeader>
        <TransferDetails transfer={props.transfer} />
        <div className="space-y-2">
          <Label htmlFor={`reversal-note-${props.transfer.id}`}>Decision note</Label>
          <Textarea
            id={`reversal-note-${props.transfer.id}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={`At least ${MIN_REASON} characters`}
          />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => decide("reject")} disabled={!!busy || note.trim().length < MIN_REASON}>
            {busy === "reject" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Decline
          </Button>
          <Button
            variant="destructive"
            onClick={() => decide("approve")}
            disabled={!!busy || note.trim().length < MIN_REASON}
          >
            {busy === "approve" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Approve reversal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
