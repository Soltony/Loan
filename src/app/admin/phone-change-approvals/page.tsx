"use client";

import { useCallback, useEffect, useState } from "react";
import { useRequirePermission } from "@/hooks/use-require-permission";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DataTable, DateTimeCell, type DataTableColumn } from "@/components/admin/data-table";
import { Button } from "@/components/ui/button";
import { Loader2, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { usePermissions } from "@/hooks/use-permissions";
import { useAuth } from "@/hooks/use-auth";

type PhoneChangeRequestRow = {
  id: string;
  oldPhoneNumber: string;
  newPhoneNumber: string;
  reason: string;
  status: string;
  requestedById: string;
  requestedByName: string;
  approvedById: string | null;
  rejectionReason: string | null;
  createdAt: string;
};

export default function PhoneChangeApprovalsPage() {
  useRequirePermission("phone-change-approvals");

  const { toast } = useToast();
  const router = useRouter();
  // useAuth exposes the signed-in user as currentUser; `user` was always undefined, so own requests were never disabled.
  const { currentUser: user } = useAuth();
  const { canModule } = usePermissions();
  const canProcess =
    canModule("phone-change-approvals", "update") ||
    canModule("phone-change-approvals", "approve");

  const [requests, setRequests] = useState<PhoneChangeRequestRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());

  // Rejection dialog state
  const [rejectionReason, setRejectionReason] = useState("");
  const [requestToReject, setRequestToReject] = useState<PhoneChangeRequestRow | null>(null);

  const fetchRequests = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/phone-change/approvals?status=PENDING&page=${page}&limit=${pageSize}`
      );
      if (!res.ok) throw new Error("Failed to fetch requests");
      const data = await res.json();
      setRequests(data.data || []);
      setTotalPages(data.totalPages || 1);
      setTotal(data.total ?? (data.data || []).length);
      setLoadError(null);
    } catch (e: any) {
      setLoadError(e);
      toast({ title: "Error", description: String(e?.message ?? e), variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, toast]);

  useEffect(() => {
    void fetchRequests();
  }, [fetchRequests]);

  const visibleRequests = requests.filter((r) => !removedIds.has(r.id));

  const handleProcess = async (
    requestId: string,
    approved: boolean,
    reason?: string
  ) => {
    if (!canProcess) {
      toast({
        title: "Not authorized",
        description: "You are not authorized to process phone change requests.",
        variant: "destructive",
      });
      return;
    }

    setProcessingId(requestId);
    try {
      const res = await fetch("/api/phone-change/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          approved,
          rejectionReason: reason,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Failed to ${approved ? "approve" : "reject"}`);

      setRemovedIds((prev) => new Set([...prev, requestId]));
      toast({
        title: "Success",
        description: `Phone change request has been ${approved ? "approved" : "rejected"}.`,
      });

      if (approved) {
        router.refresh();
      }
    } catch (e: any) {
      toast({ title: "Error", description: String(e?.message ?? e), variant: "destructive" });
    } finally {
      setProcessingId(null);
      setRequestToReject(null);
      setRejectionReason("");
    }
  };

  const columns: DataTableColumn<PhoneChangeRequestRow>[] = [
    { id: "old", header: "Old Phone", className: "font-mono", cell: (req) => req.oldPhoneNumber },
    { id: "new", header: "New Phone", className: "font-mono", cell: (req) => req.newPhoneNumber },
    {
      id: "reason",
      header: "Reason",
      cell: (req) => (
        <span className="block max-w-xs truncate" title={req.reason}>
          {req.reason}
        </span>
      ),
    },
    { id: "requestedBy", header: "Requested By", cell: (req) => req.requestedByName },
    { id: "requested", header: "Requested", cell: (req) => <DateTimeCell value={req.createdAt} /> },
    {
      id: "actions",
      header: "Actions",
      align: "right",
      cell: (req) => {
        if (!canProcess) return null;
        const isSelf = req.requestedById === user?.id;
        return (
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleProcess(req.id, true)}
              disabled={processingId === req.id || isSelf}
              className="text-green-600 border-green-600 hover:bg-green-50 hover:text-green-700"
              title={isSelf ? "Cannot approve own request" : "Approve"}
              aria-label="Approve"
            >
              {processingId === req.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRequestToReject(req)}
              disabled={processingId === req.id || isSelf}
              className="text-red-600 border-red-600 hover:bg-red-50 hover:text-red-700"
              title={isSelf ? "Cannot reject own request" : "Reject"}
              aria-label="Reject"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <>
      <div className="flex-1 space-y-4 p-8 pt-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            Phone Change Approvals
          </h2>
          <p className="text-muted-foreground">
            Review and approve or reject pending phone number change requests.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Pending Requests</CardTitle>
            <CardDescription>
              Each request must be approved by a different user than the one who submitted it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable
              caption="Pending phone change requests"
              columns={columns}
              rows={visibleRequests}
              rowKey={(req) => req.id}
              isLoading={isLoading && requests.length === 0}
              isFetching={isLoading}
              error={loadError}
              onRetry={() => void fetchRequests()}
              emptyMessage="No pending phone change requests."
              paging={{
                page,
                pageSize,
                total,
                totalPages: Math.max(1, totalPages),
                onPageChange: setPage,
                onPageSizeChange: (size) => {
                  setPageSize(size);
                  setPage(1);
                },
                pageSizes: [10, 25, 50],
              }}
            />
          </CardContent>
        </Card>
      </div>

      {/* Rejection Dialog */}
      <Dialog
        open={!!requestToReject}
        onOpenChange={() => setRequestToReject(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Phone Change Request</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this phone number change request.
            </DialogDescription>
          </DialogHeader>
          {requestToReject && (
            <div className="space-y-3 py-2 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <span className="text-muted-foreground">Old Phone:</span>
                <span className="font-mono">{requestToReject.oldPhoneNumber}</span>
                <span className="text-muted-foreground">New Phone:</span>
                <span className="font-mono">{requestToReject.newPhoneNumber}</span>
              </div>
            </div>
          )}
          <div className="py-2">
            <Textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Reason for rejection..."
              disabled={!!processingId}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRequestToReject(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                handleProcess(requestToReject!.id, false, rejectionReason)
              }
              disabled={!!processingId || !rejectionReason.trim()}
            >
              {processingId ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Processing...
                </span>
              ) : (
                "Confirm Rejection"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
