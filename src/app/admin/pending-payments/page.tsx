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
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Calendar as CalendarIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, startOfDay } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { normalizeFtReference } from "@/lib/repayment-reference";

type PendingPaymentRow = {
  id: string;
  transactionId: string;
  loanId: string;
  borrowerId: string;
  amount: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  loan: {
    id: string;
    loanAmount: number;
    repaidAmount: number | null;
    repaymentStatus: string;
    dueDate: string | null;
    disbursedDate: string | null;
    productName: string | null;
    providerName: string | null;
    providerId: string | null;
  } | null;
  phoneNumber: string;
  accountNumber: string | null;
  pendingApproval: {
    changeId: string;
    requestedAt: string;
  } | null;
};

const ITEMS_PER_PAGE = 20;

type StatusFilter = "ALL" | "PENDING" | "FAILED";

export default function PendingPaymentsPage() {
  useRequirePermission(["pending-payments", "reversals", "approvals"]);

  const { toast } = useToast();
  const [rows, setRows] = useState<PendingPaymentRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(ITEMS_PER_PAGE);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [resolvingRow, setResolvingRow] = useState<PendingPaymentRow | null>(
    null
  );
  const [ftReference, setFtReference] = useState("");
  const [paymentDate, setPaymentDate] = useState<Date | undefined>(new Date());
  const [isResolving, setIsResolving] = useState(false);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    p.set("page", String(page));
    p.set("limit", String(pageSize));
    if (fromDate) p.set("from", fromDate);
    if (toDate) p.set("to", toDate);
    if (debouncedSearch) p.set("search", debouncedSearch);
    if (statusFilter !== "ALL") p.set("status", statusFilter);
    return p.toString();
  }, [page, pageSize, fromDate, toDate, debouncedSearch, statusFilter]);

  useEffect(() => {
    const fetchRows = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/pending-payments?${query}`);
        if (!res.ok) throw new Error("Failed to fetch pending payments");
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

  const openResolveDialog = (row: PendingPaymentRow) => {
    setResolvingRow(row);
    setFtReference("");
    setPaymentDate(new Date(row.createdAt));
    setResolveDialogOpen(true);
  };

  const submitResolve = async () => {
    if (!resolvingRow || !normalizeFtReference(ftReference)) {
      toast({
        title: "Error",
        description: "Please enter a valid FT reference number",
        variant: "destructive",
      });
      return;
    }

    setIsResolving(true);
    try {
      const res = await fetch("/api/pending-payments/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pendingPaymentId: resolvingRow.id,
          ftReference: ftReference.trim(),
          paymentDate: paymentDate?.toISOString(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Resolve request failed");

      toast({
        title: "Submitted",
        description: "Resolve request submitted for approval.",
      });
      setResolveDialogOpen(false);
      setResolvingRow(null);
      setFtReference("");

      // Refresh page
      const refresh = await fetch(`/api/pending-payments?${query}`);
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
      setIsResolving(false);
    }
  };

  const statusBadge = (row: PendingPaymentRow) => {
    if (row.pendingApproval) return <StatusBadge status="Pending approval" tone="info" />;
    if (row.status === "FAILED") return <StatusBadge status="Failed" tone="danger" />;
    return <StatusBadge status="Pending" tone="warning" />;
  };

  const columns: DataTableColumn<PendingPaymentRow>[] = [
    { id: "date", header: "Date", cell: (r) => <DateTimeCell value={r.createdAt} /> },
    { id: "status", header: "Status", cell: (r) => statusBadge(r) },
    {
      id: "borrower",
      header: "Borrower",
      cell: (r) => (
        <div className="font-mono text-xs">
          <div className="text-sm">{r.phoneNumber}</div>
          <div className="text-muted-foreground">{r.accountNumber || "—"}</div>
        </div>
      ),
    },
    { id: "loan", header: "Loan", cell: (r) => <IdCell id={r.loanId} /> },
    {
      id: "product",
      header: "Product",
      cell: (r) => (
        <>
          {r.loan?.productName || "—"}
          {r.loan?.providerName && <div className="text-xs text-muted-foreground">({r.loan.providerName})</div>}
        </>
      ),
    },
    { id: "amount", header: "Amount (ETB)", align: "right", cell: (r) => <Money value={r.amount} /> },
    { id: "txn", header: "Txn ID", cell: (r) => <IdCell id={r.transactionId} /> },
    {
      id: "action",
      header: "Action",
      align: "right",
      cell: (r) => (
        <Button variant="secondary" size="sm" disabled={!!r.pendingApproval} onClick={() => openResolveDialog(r)}>
          {r.pendingApproval ? "Pending Approval" : "Mark Successful"}
        </Button>
      ),
    },
  ];

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            Pending Payments
          </h2>
          <p className="text-muted-foreground">
            Pending and failed payments that can be marked as successful by
            providing the FT reference number.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Status</span>
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v as StatusFilter);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="FAILED">Failed</SelectItem>
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
        label="Search pending payments"
        placeholder="Search by transaction ID, borrower ID, loan ID, or account number..."
        value={debouncedSearch}
        onChange={(value) => {
          setDebouncedSearch(value);
          setPage(1);
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle>Pending Payments</CardTitle>
          <CardDescription>
            Submit a resolve request with an FT reference number to mark a
            pending or failed payment as successful. Requires approval from
            another user.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            caption="Pending payments"
            columns={columns}
            rows={rows}
            rowKey={(r) => r.id}
            isLoading={isLoading && rows.length === 0}
            isFetching={isLoading}
            error={loadError}
            onRetry={() => setReloadKey((k) => k + 1)}
            emptyMessage="No unresolved payments found."
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

      {/* Resolve Dialog */}
      <Dialog open={resolveDialogOpen} onOpenChange={setResolveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Payment as Successful</DialogTitle>
            <DialogDescription>
              Enter the FT reference number to mark this pending payment as
              successful. This will record the repayment against the loan.
            </DialogDescription>
          </DialogHeader>
          {resolvingRow && (
            <div className="space-y-4 py-4">
              {resolvingRow.status === "FAILED" && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  This payment was rejected by the payment callback (typically an
                  overpayment) and never posted. Confirm the amount against the
                  loan balance before resolving it.
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="text-muted-foreground">Borrower:</div>
                <div className="font-mono">{resolvingRow.phoneNumber}</div>
                <div className="text-muted-foreground">Loan ID:</div>
                <div className="font-mono">{resolvingRow.loanId}</div>
                <div className="text-muted-foreground">Amount:</div>
                <div>{resolvingRow.amount} ETB</div>
                <div className="text-muted-foreground">Product:</div>
                <div>{resolvingRow.loan?.productName || "—"}</div>
                <div className="text-muted-foreground">
                  Original Transaction ID:
                </div>
                <div className="font-mono">{resolvingRow.transactionId}</div>
              </div>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="ftRef" className="text-right">
                    FT Reference
                  </Label>
                  <Input
                    id="ftRef"
                    value={ftReference}
                    onChange={(e) => setFtReference(e.target.value)}
                    className="col-span-3"
                    placeholder="e.g. FT26123AB4CD"
                  />
                  {ftReference.trim() && !normalizeFtReference(ftReference) && (
                    <p className="col-span-3 col-start-2 text-xs text-destructive">
                      An FT is FT, 5 digits, then 5 letters or digits — copy it from the CBS transaction, not the account number.
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                   <Label className="text-right">
                     Payment Date
                   </Label>
                   <div className="col-span-3">
                     <Button
                       variant={"outline"}
                       disabled
                       className={cn(
                         "w-full justify-start text-left font-normal cursor-not-allowed opacity-100",
                         !paymentDate && "text-muted-foreground"
                       )}
                     >
                       <CalendarIcon className="mr-2 h-4 w-4" />
                       {paymentDate ? format(paymentDate, "PPP") : <span>Pick a date</span>}
                     </Button>
                     <p className="text-[10px] text-muted-foreground mt-1">
                       Locked to the date the payment was recorded.
                     </p>
                   </div>
                 </div>
               </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setResolveDialogOpen(false)}
              disabled={isResolving}
            >
              Close
            </Button>
            <Button
              onClick={submitResolve}
              disabled={isResolving || !normalizeFtReference(ftReference)}
            >
              {isResolving ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Submitting...
                </span>
              ) : (
                "Submit for Approval"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
