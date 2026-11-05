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
import { DataTable, DateTimeCell, formatDay, Money, StatusBadge, type DataTableColumn } from "@/components/admin/data-table";
import { Button } from "@/components/ui/button";
import { Loader2, Check, X } from "lucide-react";
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
import type {
  PendingPaymentApproval,
  PaginatedPendingPaymentApprovals,
} from "./page";
import type { User } from "@/lib/types";
import { usePermissions } from "@/hooks/use-permissions";

export function PendingPaymentApprovalsClient({
  paginatedData: initialData,
  currentUser,
}: {
  paginatedData: PaginatedPendingPaymentApprovals;
  currentUser: User;
}) {
  useRequirePermission(["payment-approvals", "approvals"]);
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [processingId, setProcessingId] = useState<string | null>(null);

  const changes = initialData.data.filter((c) => !removedIds.has(c.id));
  const [rejectionReason, setRejectionReason] = useState("");
  const [changeToReject, setChangeToReject] =
    useState<PendingPaymentApproval | null>(null);
  const { toast } = useToast();
  const router = useRouter();
  const { canModule } = usePermissions();
  const canProcessApprovals =
    canModule("payment-approvals", "update") ||
    canModule("approvals", "update") ||
    canModule("reversal-approval", "update");

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
        description: `Payment resolve request has been ${
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

  const getFtReference = (change: PendingPaymentApproval): string | null => {
    try {
      const data = JSON.parse(change.payload);
      return data?.created?.ftReference || null;
    } catch {
      return null;
    }
  };

  const getAmount = (change: PendingPaymentApproval): number | null => {
    try {
      const data = JSON.parse(change.payload);
      return data?.created?.amount ?? null;
    } catch {
      return null;
    }
  };

  // Requests raised against a FAILED payment (e.g. an overpayment the callback
  // refused to post) are worth flagging to the checker.
  const getOriginalStatus = (
    change: PendingPaymentApproval
  ): string | null => {
    try {
      const data = JSON.parse(change.payload);
      return data?.created?.originalStatus || null;
    } catch {
      return null;
    }
  };

  const getPaymentDate = (change: PendingPaymentApproval): string | null => {
    try {
      const data = JSON.parse(change.payload);
      return data?.created?.paymentDate || null;
    } catch {
      return null;
    }
  };


  const columns: DataTableColumn<PendingPaymentApproval>[] = [
    {
      id: "request",
      header: "Request",
      cell: (change) => (
        <div className="font-medium">
          <div className="flex items-center gap-2">
            <span>Mark Payment Successful</span>
            {getOriginalStatus(change) === "FAILED" && <StatusBadge status="FAILED" label="Was Failed" />}
          </div>
          <div className="text-sm font-normal text-muted-foreground">{change.entityName}</div>
          {change.providerName && <div className="text-xs font-normal text-muted-foreground">({change.providerName})</div>}
        </div>
      ),
    },
    {
      id: "amount",
      header: "Amount (ETB)",
      align: "right",
      cell: (change) => {
        const amount = getAmount(change);
        return amount != null ? <Money value={Number(amount)} /> : "—";
      },
    },
    {
      id: "ft",
      header: "FT Reference",
      className: "font-mono text-xs whitespace-nowrap",
      cell: (change) => getFtReference(change) || "—",
    },
    {
      id: "paymentDate",
      header: "Payment Date",
      className: "whitespace-nowrap",
      cell: (change) => {
        const paymentDate = getPaymentDate(change);
        return paymentDate ? formatDay(paymentDate) : "—";
      },
    },
    { id: "requestedBy", header: "Requested By", cell: (change) => change.createdBy?.fullName || "Unknown User" },
    { id: "requestedAt", header: "Requested At", cell: (change) => <DateTimeCell value={change.createdAt} /> },
    {
      id: "actions",
      header: "Actions",
      align: "right",
      className: "space-x-2 whitespace-nowrap",
      cell: (change) =>
        canProcessApprovals ? (
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
        ) : null,
    },
  ];

  return (
    <>
      <div className="flex-1 space-y-4 p-8 pt-6">
        <h2 className="text-3xl font-bold tracking-tight">
          Pending Payment Approvals
        </h2>
        <Card>
          <CardHeader>
            <CardTitle>Payment Resolve Requests</CardTitle>
            <CardDescription>
              Review and approve or reject pending payment resolve requests.
              Approving will record the repayment and mark the pending payment as
              successful.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable
              caption="Payment resolve requests"
              columns={columns}
              rows={changes}
              rowKey={(change) => change.id}
              isLoading={false}
              emptyMessage="No pending payment approval requests."
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
            <DialogTitle>Reject Payment Resolve</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this payment resolve request.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g., Invalid FT reference number..."
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
