"use client";

import { useMemo, useState, type ReactNode } from "react";
import { format } from "date-fns";
import { Download, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  SearchInput,
  useClientTable,
  type DataTableColumn,
  type SortValue,
} from "@/components/admin/data-table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DateRangeFilter } from "@/components/ui/date-range-filter";
import { cn } from "@/lib/utils";
import {
  componentLabel,
  countsAsTransferred,
  formatCurrency,
  roundCurrency,
  sourceAccountLabel,
  TRANSFER_COMPONENTS,
  transferStatusLabel,
  type CollectionTransfer,
} from "@/lib/collection-transfer-utils";
import type { HistoryFilters } from "./use-transfer-list";

export type StatusOption = { value: string; label: string };

export function displayDate(value: string | null | undefined) {
  return value ? format(new Date(value), "yyyy-MM-dd") : "-";
}

export function displayDateTime(value: string | null | undefined) {
  return value ? format(new Date(value), "yyyy-MM-dd HH:mm") : "-";
}

const STATUS_CLASSES: Record<string, string> = {
  PENDING_APPROVAL: "border-transparent bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  PENDING_REVERSAL: "border-transparent bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300",
  APPROVED: "border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  SIMULATED: "border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  REJECTED: "border-transparent bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300",
  REVERSED: "border-transparent bg-muted text-muted-foreground",
};

export function TransferStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn("whitespace-nowrap", STATUS_CLASSES[status])}>
      {transferStatusLabel(status)}
    </Badge>
  );
}

/** One line explaining the latest decision on a row, shown under its status. */
function statusNote(t: CollectionTransfer) {
  if (t.status === "REJECTED") return t.rejectionReason ? `Rejected: ${t.rejectionReason}` : null;
  if (t.status === "PENDING_REVERSAL") {
    const by = t.reversalRequestedByUser ? ` by ${t.reversalRequestedByUser.fullName}` : "";
    return `Reversal requested${by}: ${t.reversalReason ?? ""}`;
  }
  if (t.status === "REVERSED") {
    const by = t.reversedByUser ? ` by ${t.reversedByUser.fullName}` : "";
    return `Reversed${by}: ${t.reversalReason ?? ""}`;
  }
  return null;
}

async function exportTransfers(rows: CollectionTransfer[], fileBase: string, filters: HistoryFilters) {
  const [{ default: ExcelJS }, { saveAs }] = await Promise.all([import("exceljs"), import("file-saver")]);
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Collection Transfers", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = [
    { header: "Transfer date", key: "date", width: 14 },
    { header: "Provider", key: "provider", width: 16 },
    { header: "Component", key: "component", width: 14 },
    { header: "Amount", key: "amount", width: 16 },
    { header: "From account", key: "from", width: 32 },
    { header: "To account", key: "to", width: 32 },
    { header: "Reference", key: "reference", width: 22 },
    { header: "Status", key: "status", width: 16 },
    { header: "Maker", key: "maker", width: 22 },
    { header: "Submitted at", key: "submittedAt", width: 18 },
    { header: "Checker", key: "checker", width: 22 },
    { header: "Checked at", key: "checkedAt", width: 18 },
    { header: "Rejection reason", key: "rejectionReason", width: 32 },
    { header: "Reversal requested by", key: "reversalRequestedBy", width: 22 },
    { header: "Reversal reason", key: "reversalReason", width: 32 },
    { header: "Reversed by", key: "reversedBy", width: 22 },
    { header: "Reversed at", key: "reversedAt", width: 18 },
    { header: "Notes", key: "notes", width: 36 },
  ];
  sheet.getColumn("amount").numFmt = "#,##0.00";
  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
    cell.border = { bottom: { style: "thin", color: { argb: "FFCBD5E1" } } };
  });

  for (const t of rows) {
    sheet.addRow({
      date: displayDate(t.transferDate),
      provider: t.provider?.name ?? "",
      component: componentLabel(t.component),
      amount: t.transferAmount,
      from: sourceAccountLabel(t),
      to: t.destinationAccountName,
      reference: t.transferReference,
      status: transferStatusLabel(t.status),
      maker: t.recordedByUser?.fullName ?? "",
      submittedAt: displayDateTime(t.createdAt),
      checker: t.checkedByUser?.fullName ?? "",
      checkedAt: t.checkedAt ? displayDateTime(t.checkedAt) : "",
      rejectionReason: t.rejectionReason ?? "",
      reversalRequestedBy: t.reversalRequestedByUser?.fullName ?? "",
      reversalReason: t.reversalReason ?? "",
      reversedBy: t.reversedByUser?.fullName ?? "",
      reversedAt: t.reversedAt ? displayDateTime(t.reversedAt) : "",
      notes: t.notes ?? "",
    });
  }
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length } };

  const range = filters.from || filters.to ? `_${filters.from || "start"}_to_${filters.to || "today"}` : "";
  const scope = filters.component !== "all" ? `_${filters.component}` : "";
  const fileName = `${fileBase}${scope}${range}_${format(new Date(), "yyyyMMdd")}.xlsx`;
  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), fileName);
}

const TRANSFER_SORTERS: Record<string, (t: CollectionTransfer) => SortValue> = {
  date: (t) => t.transferDate,
  provider: (t) => t.provider?.name,
  component: (t) => componentLabel(t.component),
  amount: (t) => t.transferAmount,
  maker: (t) => t.createdAt,
  checker: (t) => t.checkedAt,
  status: (t) => transferStatusLabel(t.status),
};

export function CollectionTransferHistory(props: {
  title: string;
  description?: string;
  transfers: CollectionTransfer[];
  totalMatching: number;
  filters: HistoryFilters;
  onFiltersChange: (next: HistoryFilters) => void;
  statusOptions: StatusOption[];
  exportFileBase: string;
  loading?: boolean;
  emptyMessage?: string;
  renderActions?: (t: CollectionTransfer) => ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [exporting, setExporting] = useState(false);
  const { filters } = props;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return props.transfers;
    return props.transfers.filter((t) =>
      [
        t.transferReference,
        t.sourceAccountName ?? "",
        t.destinationAccountName,
        t.recordedByUser?.fullName ?? "",
        t.checkedByUser?.fullName ?? "",
        t.notes ?? "",
      ].some((v) => v.toLowerCase().includes(q))
    );
  }, [props.transfers, query]);

  const totals = useMemo(() => {
    const approved = filtered.filter((t) => countsAsTransferred(t.status));
    const pending = filtered.filter((t) => t.status === "PENDING_APPROVAL");
    const sum = (rows: CollectionTransfer[]) => roundCurrency(rows.reduce((s, t) => s + t.transferAmount, 0));
    return { approvedCount: approved.length, approved: sum(approved), pendingCount: pending.length, pending: sum(pending) };
  }, [filtered]);

  const showProvider = useMemo(
    () => new Set(props.transfers.map((t) => t.providerId)).size > 1,
    [props.transfers]
  );
  const truncated = props.totalMatching > props.transfers.length;
  const table = useClientTable(filtered, { sorters: TRANSFER_SORTERS, pageSize: 25 });

  const columns: DataTableColumn<CollectionTransfer>[] = [
    { id: "date", header: "Date", sortKey: "date", className: "whitespace-nowrap", cell: (t) => displayDate(t.transferDate) },
    ...(showProvider
      ? [
          {
            id: "provider",
            header: "Provider",
            sortKey: "provider",
            className: "whitespace-nowrap",
            cell: (t: CollectionTransfer) => t.provider?.name ?? "-",
          },
        ]
      : []),
    { id: "component", header: "Component", sortKey: "component", className: "whitespace-nowrap", cell: (t) => componentLabel(t.component) },
    {
      id: "amount",
      header: "Amount",
      sortKey: "amount",
      align: "right",
      cell: (t) => {
        const struck = t.status === "REJECTED" || t.status === "REVERSED";
        return <span className={cn("font-mono", struck && "line-through")}>{formatCurrency(t.transferAmount)}</span>;
      },
      footer: <span className="font-mono">{formatCurrency(totals.approved)}</span>,
    },
    {
      id: "from",
      header: "From",
      cell: (t) => (
        <span className="block max-w-[200px] truncate" title={sourceAccountLabel(t)}>
          {sourceAccountLabel(t)}
        </span>
      ),
    },
    {
      id: "to",
      header: "To",
      cell: (t) => (
        <span className="block max-w-[200px] truncate" title={t.destinationAccountName}>
          {t.destinationAccountName}
        </span>
      ),
    },
    {
      id: "reference",
      header: "Reference",
      className: "font-mono",
      cell: (t) => (
        <>
          <div>{t.transferReference}</div>
          {t.notes ? (
            <div className="max-w-[200px] truncate font-sans text-xs text-muted-foreground" title={t.notes}>
              {t.notes}
            </div>
          ) : null}
        </>
      ),
    },
    {
      id: "maker",
      header: "Maker",
      sortKey: "maker",
      className: "whitespace-nowrap",
      cell: (t) => (
        <>
          <div>{t.recordedByUser?.fullName || "-"}</div>
          <div className="text-xs text-muted-foreground">{displayDateTime(t.createdAt)}</div>
        </>
      ),
    },
    {
      id: "checker",
      header: "Checker",
      sortKey: "checker",
      className: "whitespace-nowrap",
      cell: (t) => (
        <>
          <div>{t.checkedByUser?.fullName || "-"}</div>
          {t.checkedAt ? <div className="text-xs text-muted-foreground">{displayDateTime(t.checkedAt)}</div> : null}
        </>
      ),
    },
    {
      id: "status",
      header: "Status",
      sortKey: "status",
      cell: (t) => {
        const note = statusNote(t);
        return (
          <>
            <TransferStatusBadge status={t.status} />
            {note ? (
              <div className="mt-1 max-w-[220px] truncate text-xs text-muted-foreground" title={note}>
                {note}
              </div>
            ) : null}
          </>
        );
      },
    },
    {
      id: "actions",
      header: "Actions",
      align: "right",
      cell: (t) => props.renderActions?.(t) ?? <span className="text-sm text-muted-foreground">—</span>,
    },
  ];

  async function handleExport() {
    setExporting(true);
    try {
      await exportTransfers(filtered, props.exportFileBase, filters);
    } finally {
      setExporting(false);
    }
  }

  return (
    <Card>
      <CardHeader className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-1.5">
            <CardTitle>{props.title}</CardTitle>
            {props.description ? <CardDescription>{props.description}</CardDescription> : null}
          </div>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting || filtered.length === 0}>
            {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Export Excel
          </Button>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Component</span>
            <Select
              value={filters.component}
              onValueChange={(v) => props.onFiltersChange({ ...filters, component: v })}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All components</SelectItem>
                {TRANSFER_COMPONENTS.map((c) => (
                  <SelectItem key={c.key} value={c.key}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Status</span>
            <Select value={filters.status} onValueChange={(v) => props.onFiltersChange({ ...filters, status: v })}>
              <SelectTrigger className="w-[170px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {props.statusOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DateRangeFilter
            from={filters.from}
            to={filters.to}
            onFromChange={(v) => props.onFiltersChange({ ...filters, from: v })}
            onToChange={(v) => props.onFiltersChange({ ...filters, to: v })}
            onClear={
              filters.from || filters.to ? () => props.onFiltersChange({ ...filters, from: "", to: "" }) : undefined
            }
            fromLabel="Transfer date from"
            toLabel="To"
          />
          <div className="flex min-w-[220px] flex-1 flex-col gap-1">
            <span className="text-xs text-muted-foreground">Search</span>
            <SearchInput
              className="max-w-none"
              label="Search transfers"
              placeholder="Reference, account, maker, checker, notes…"
              value={query}
              onChange={(value) => {
                setQuery(value);
                table.resetPage();
              }}
            />
          </div>
        </div>
        {truncated ? (
          <p className="text-xs text-muted-foreground">
            Showing the latest {props.transfers.length.toLocaleString()} of {props.totalMatching.toLocaleString()}{" "}
            matching transfers. Narrow the date range to see older ones.
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-2">
        <DataTable
          caption={props.title}
          columns={columns}
          rows={table.rows}
          rowKey={(t) => t.id}
          isLoading={!!props.loading && props.transfers.length === 0}
          isFetching={!!props.loading}
          emptyMessage={props.emptyMessage ?? "No transfers found."}
          sort={table.sort}
          onSortChange={table.onSortChange}
          paging={table.paging}
          footerLabel={`Approved (${totals.approvedCount})`}
          rowClassName={(t) => (t.status === "REJECTED" || t.status === "REVERSED" ? "text-muted-foreground" : undefined)}
        />
        {filtered.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            {totals.pendingCount > 0
              ? `Pending approval: ${formatCurrency(totals.pending)} (${totals.pendingCount}). `
              : ""}
            The approved total excludes rejected and reversed transfers.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
