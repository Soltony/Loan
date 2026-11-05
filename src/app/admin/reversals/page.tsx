"use client";

import { useEffect, useMemo, useState } from "react";
import { useRequirePermission } from "@/hooks/use-require-permission";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DataTable,
  DateTimeCell,
  IdCell,
  Money,
  SearchInput,
  StatusBadge,
  type DataTableColumn,
} from "@/components/admin/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ReversalRow = {
  id: string;
  transactionId: string | null;
  providerId: string;
  originalProviderId: string | null;
  creditAccount: string | null;
  amount: number | null;
  statusCode: number | null;
  createdAt: string;
  borrowerId: string | null;
  loanId: string | null;
  reversed: { reversedAt: string; reversedBy: string } | null;
  cancelled: { cancelledAt: string; cancelledBy: string } | null;
  pendingApproval: {
    changeId: string;
    requestedAt: string;
    requestedBy: string;
    type: string;
  } | null;
  isFailure: boolean;
  isPosted?: boolean;
  disbursementStatus?: string;
};

type FilterMode = "failed" | "all" | "posted";

const ITEMS_PER_PAGE = 20;

export default function ReversalsPage() {
  // Check for reversals permission
  useRequirePermission("reversals");

  const { toast } = useToast();
  const router = useRouter();
  const [rows, setRows] = useState<ReversalRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(ITEMS_PER_PAGE);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("failed");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [reversingId, setReversingId] = useState<string | null>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancellingRow, setCancellingRow] = useState<ReversalRow | null>(null);
  const [cancelTransactionId, setCancelTransactionId] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    p.set("page", String(page));
    p.set("limit", String(pageSize));
    p.set("filter", filterMode);
    if (fromDate) p.set("from", fromDate);
    if (toDate) p.set("to", toDate);
    if (debouncedSearch) p.set("search", debouncedSearch);
    return p.toString();
  }, [page, pageSize, fromDate, toDate, filterMode, debouncedSearch]);

  useEffect(() => {
    const fetchRows = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/reversals?${query}`);
        if (!res.ok) throw new Error("Failed to fetch reversal rows");
        const data = await res.json();
        setRows(data.rows || []);
        setTotalPages(data.totalPages || 1);
        setTotal(data.total ?? (data.rows || []).length);
        setLoadError(null);
      } catch (e: any) {
        setLoadError(e);
        toast({
          title: "Error",
          description: String(e?.message ?? e),
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    void fetchRows();
  }, [query, reloadKey, toast]);

  const reverseTx = async (row: ReversalRow) => {
    setReversingId(row.id);
    try {
      const isPosted = row.isPosted || row.disbursementStatus === "POSTED";
      const res = await fetch("/api/reversals/reverse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isPosted
            ? { loanId: row.loanId, isPosted: true }
            : { id: row.id }
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Reversal failed");

      toast({
        title: "Submitted",
        description: "Reversal request submitted for approval.",
      });

      // Refresh page
      const refresh = await fetch(`/api/reversals?${query}`);
      const refreshed = await refresh.json();
      setRows(refreshed.rows || []);
      setTotalPages(refreshed.totalPages || 1);
      setTotal(refreshed.total ?? (refreshed.rows || []).length);
    } catch (e: any) {
      toast({
        title: "Error",
        description: String(e?.message ?? e),
        variant: "destructive",
      });
    } finally {
      setReversingId(null);
    }
  };

  const openCancelDialog = (row: ReversalRow) => {
    setCancellingRow(row);
    setCancelTransactionId("");
    setCancelDialogOpen(true);
  };

  const cancelTx = async () => {
    if (!cancellingRow || !cancelTransactionId.trim()) {
      toast({
        title: "Error",
        description: "Please enter a valid CBS transaction ID",
        variant: "destructive",
      });
      return;
    }

    setIsCancelling(true);
    try {
      const isPosted = cancellingRow.isPosted || cancellingRow.disbursementStatus === "POSTED";
      const res = await fetch("/api/reversals/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isPosted
            ? {
                loanId: cancellingRow.loanId,
                isPosted: true,
                transactionId: cancelTransactionId.trim(),
              }
            : {
                id: cancellingRow.id,
                transactionId: cancelTransactionId.trim(),
              }
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Cancel failed");

      toast({
        title: "Submitted",
        description: "Cancel request submitted for approval.",
      });
      setCancelDialogOpen(false);
      setCancellingRow(null);
      setCancelTransactionId("");

      // Refresh page
      const refresh = await fetch(`/api/reversals?${query}`);
      const refreshed = await refresh.json();
      setRows(refreshed.rows || []);
      setTotalPages(refreshed.totalPages || 1);
      setTotal(refreshed.total ?? (refreshed.rows || []).length);
    } catch (e: any) {
      toast({
        title: "Error",
        description: String(e?.message ?? e),
        variant: "destructive",
      });
    } finally {
      setIsCancelling(false);
    }
  };

  const statusBadge = (row: ReversalRow) => {
    if (row.reversed) return <StatusBadge status="Reversed" tone="success" />;
    if (row.cancelled) return <StatusBadge status="Cancelled" tone="info" />;
    if (row.pendingApproval) {
      const type = row.pendingApproval.type === "DisbursementCancel" ? "Cancel" : "Reversal";
      return <StatusBadge status={`Pending ${type}`} tone="warning" />;
    }
    // Loans posted without a disbursement transaction.
    if (row.isPosted || row.disbursementStatus === "POSTED") return <StatusBadge status="Posted" tone="warning" />;
    if (row.disbursementStatus === "SUCCESS") return <StatusBadge status="Success" tone="success" />;
    if (row.statusCode == null) return <StatusBadge status="Failed" tone="danger" />;
    if (row.statusCode >= 200 && row.statusCode < 300) return <StatusBadge status="OK" tone="success" />;
    return <StatusBadge status="Failed" tone="danger" />;
  };

  const columns: DataTableColumn<ReversalRow>[] = [
    { id: "date", header: "Date", cell: (r) => <DateTimeCell value={r.createdAt} /> },
    { id: "status", header: "Status", cell: (r) => statusBadge(r) },
    { id: "provider", header: "Provider", cell: (r) => <IdCell id={r.originalProviderId || r.providerId} /> },
    { id: "account", header: "Credit Account", className: "font-mono text-xs", cell: (r) => r.creditAccount || "—" },
    { id: "amount", header: "Amount (ETB)", align: "right", cell: (r) => (r.amount == null ? "—" : <Money value={r.amount} />) },
    { id: "txn", header: "Txn ID", cell: (r) => <IdCell id={r.transactionId} /> },
    { id: "loan", header: "Loan", cell: (r) => <IdCell id={r.loanId} /> },
    {
      id: "action",
      header: "Action",
      align: "right",
      cell: (r) => {
        const isPostedOnly = r.isPosted || r.disbursementStatus === "POSTED";
        const canReverse = !r.reversed && !r.cancelled && !r.pendingApproval && (r.isFailure || isPostedOnly);
        return (
          <div className="flex justify-end gap-2">
            {r.reversed ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const detailId = r.loanId || r.id;
                  router.push(`/admin/reversal-details?id=${encodeURIComponent(detailId)}`);
                }}
              >
                <Eye className="h-4 w-4 mr-1" />
                View Details
              </Button>
            ) : (
              <>
                <Button variant="outline" size="sm" disabled={!canReverse || reversingId === r.id} onClick={() => void reverseTx(r)}>
                  {reversingId === r.id ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Submitting
                    </span>
                  ) : (
                    "Reverse"
                  )}
                </Button>
                <Button variant="secondary" size="sm" disabled={!canReverse} onClick={() => openCancelDialog(r)}>
                  Cancel
                </Button>
              </>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Reversals</h2>
          <p className="text-muted-foreground">
            {filterMode === "posted" 
              ? "Loans posted internally without external disbursement."
              : filterMode === "all"
                ? "All disbursement transactions."
                : "Failed external disbursements that can be reversed internally."}
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Filter</span>
            <Select value={filterMode} onValueChange={(v) => { setFilterMode(v as FilterMode); setPage(1); }}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="failed">Failed Only</SelectItem>
                <SelectItem value="posted">Posted Only</SelectItem>
                <SelectItem value="all">All Transactions</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">From</span>
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-[160px]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">To</span>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-[160px]"
            />
          </div>
        </div>
      </div>

      <SearchInput
        label="Search reversals"
        placeholder="Search by account number or phone number..."
        value={debouncedSearch}
        onChange={(value) => {
          setDebouncedSearch(value);
          setPage(1);
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle>
            {filterMode === "posted" 
              ? "Posted Loans (No Disbursement Record)" 
              : filterMode === "all"
                ? "All Disbursements"
                : "Failed Disbursements"}
          </CardTitle>
          <CardDescription>
            {filterMode === "posted"
              ? "These loans were posted internally but have no external disbursement transaction record."
              : filterMode === "all"
                ? "View all disbursement transactions regardless of status."
                : "Submit a reversal request for approval to undo internal postings for failed upstream transfers."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            caption="Disbursements"
            columns={columns}
            rows={rows}
            rowKey={(r) => r.id}
            isLoading={isLoading && rows.length === 0}
            isFetching={isLoading}
            error={loadError}
            onRetry={() => setReloadKey((k) => k + 1)}
            emptyMessage={
              filterMode === "posted"
                ? "No posted loans without disbursement records found."
                : filterMode === "all"
                  ? "No disbursement transactions found."
                  : "No failed disbursements found."
            }
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
              pageSizes: [20, 50, 100],
            }}
          />
        </CardContent>
      </Card>

      {/* Cancel Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Failed Disbursement</DialogTitle>
            <DialogDescription>
              Enter the CBS transaction ID to mark this disbursement as
              successful. Use this when the external disbursement actually
              succeeded but was recorded as failed.
            </DialogDescription>
          </DialogHeader>
          {cancellingRow && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="text-muted-foreground">Credit Account:</div>
                <div className="font-mono">{cancellingRow.creditAccount}</div>
                <div className="text-muted-foreground">Amount:</div>
                <div>{cancellingRow.amount ?? "—"}</div>
                <div className="text-muted-foreground">Loan ID:</div>
                <div className="font-mono">{cancellingRow.loanId ?? "—"}</div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="transactionId">CBS Transaction ID</Label>
                <Input
                  id="transactionId"
                  placeholder="Enter the transaction ID from CBS"
                  value={cancelTransactionId}
                  onChange={(e) => setCancelTransactionId(e.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCancelDialogOpen(false)}
              disabled={isCancelling}
            >
              Close
            </Button>
            <Button
              onClick={cancelTx}
              disabled={isCancelling || !cancelTransactionId.trim()}
            >
              {isCancelling ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Saving...
                </span>
              ) : (
                "Mark as Successful"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
