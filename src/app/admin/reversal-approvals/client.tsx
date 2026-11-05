"use client";

import { useState } from "react";
import { useRequirePermission } from "@/hooks/use-require-permission";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DataTable, DateTimeCell, StatusBadge, type DataTableColumn } from "@/components/admin/data-table";
import { Button } from "@/components/ui/button";
import { Loader2, Check, X, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { PendingReversalApproval, PaginatedReversalApprovals } from "./page";
import type { User } from "@/lib/types";
import { usePermissions } from "@/hooks/use-permissions";

export function ReversalApprovalsClient({
  paginatedData: initialData,
  currentUser,
}: {
  paginatedData: PaginatedReversalApprovals;
  currentUser: User;
}) {
  useRequirePermission("reversal-approval");
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [processingId, setProcessingId] = useState<string | null>(null);

  const changes = initialData.data.filter((c) => !removedIds.has(c.id));
  const [rejectionReason, setRejectionReason] = useState("");
  const [changeToReject, setChangeToReject] =
    useState<PendingReversalApproval | null>(null);
  const { toast } = useToast();
  const router = useRouter();
  const { canModule } = usePermissions();
  const canProcessApprovals = canModule("approvals", "update") || canModule("reversal-approval", "update");

  const handleProcessChange = async (
    changeId: string,
    approved: boolean,
    reason?: string
  ) => {
    if (!canProcessApprovals) {
      toast({
        title: "Not authorized",
        description: "You are not authorized to approve or reject changes.",
        variant: "destructive",
      });
      return;
    }

    setProcessingId(changeId);
    try {
      const response = await fetch("/api/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changeId, approved, rejectionReason: reason }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error ||
            `Failed to ${approved ? "approve" : "reject"} request.`
        );
      }

      setRemovedIds((prev) => new Set([...prev, changeId]));
      toast({
        title: "Success",
        description: `Reversal request has been ${
          approved ? "approved" : "rejected"
        }.`,
      });

      if (approved) {
        router.refresh();
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setProcessingId(null);
      setChangeToReject(null);
      setRejectionReason("");
    }
  };

  const handlePageChange = (page: number) => {
    router.push(`?page=${page}`);
  };

  const isCancel = (change: PendingReversalApproval) =>
    change.entityType === "DisbursementCancel" || change.entityType === "LoanCancel";
  const isPostedLoan = (change: PendingReversalApproval) =>
    change.entityType === "LoanReversal" || change.entityType === "LoanCancel";

  const columns: DataTableColumn<PendingReversalApproval>[] = [
    {
      id: "request",
      header: "Request",
      cell: (change) => (
        <div className="font-medium">
          <div>
            {isCancel(change) ? "Cancel" : "Reversal"}
            {isPostedLoan(change) ? " (Posted Loan)" : ""}
          </div>
          <div className="text-sm font-normal text-muted-foreground">{change.entityName}</div>
          {change.providerName && <div className="text-xs font-normal text-muted-foreground">({change.providerName})</div>}
        </div>
      ),
    },
    {
      id: "type",
      header: "Type",
      cell: (change) =>
        isCancel(change) ? (
          <StatusBadge status="Mark Success" tone="success" />
        ) : (
          <StatusBadge status={change.changeType} tone="warning" />
        ),
    },
    { id: "requestedBy", header: "Requested By", cell: (change) => change.createdBy?.fullName || "Unknown User" },
    { id: "requestedAt", header: "Requested At", cell: (change) => <DateTimeCell value={change.createdAt} /> },
    {
      id: "actions",
      header: "Actions",
      align: "right",
      className: "space-x-2 whitespace-nowrap",
      cell: (change) => (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="Open request"
            onClick={() => router.push(`/admin/reversal-approvals/${change.id}`)}
          >
            <Eye className="h-4 w-4" />
          </Button>
          {canProcessApprovals && (
            <>
              <Button
                variant="outline"
                size="sm"
                aria-label="Approve"
                onClick={() => handleProcessChange(change.id, true)}
                disabled={processingId === change.id || change.createdById === currentUser.id}
                className="text-green-600 border-green-600 hover:bg-green-50 hover:text-green-700"
              >
                {processingId === change.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              </Button>
              <Button
                variant="outline"
                size="sm"
                aria-label="Reject"
                onClick={() => setChangeToReject(change)}
                disabled={processingId === change.id || change.createdById === currentUser.id}
                className="text-red-600 border-red-600 hover:bg-red-50 hover:text-red-700"
              >
                <X className="h-4 w-4" />
              </Button>
            </>
          )}
        </>
      ),
    },
  ];

  return (
    <>
      <div className="flex-1 space-y-4 p-8 pt-6">
        <h2 className="text-3xl font-bold tracking-tight">
          Reversal Approvals
        </h2>
        <Card>
          <CardHeader>
            <CardTitle>Reversal & Cancel Requests</CardTitle>
            <CardDescription>
              Review and approve or reject pending disbursement reversals and
              cancel requests.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable
              caption="Reversal and cancel requests"
              columns={columns}
              rows={changes}
              rowKey={(change) => change.id}
              isLoading={false}
              emptyMessage="No pending reversal approvals."
              onRowClick={(change) => router.push(`/admin/reversal-approvals/${change.id}`)}
              paging={{
                page: initialData.page,
                pageSize: initialData.pageSize,
                total: initialData.total,
                totalPages: initialData.totalPages,
                onPageChange: handlePageChange,
              }}
            />
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={!!changeToReject}
        onOpenChange={() => setChangeToReject(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Reversal</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this reversal request.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g., Not a valid failed disbursement..."
              disabled={!canProcessApprovals}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangeToReject(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                handleProcessChange(changeToReject!.id, false, rejectionReason)
              }
              disabled={!canProcessApprovals || !rejectionReason.trim()}
            >
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
