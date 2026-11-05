"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import {
  DataTable,
  DateTimeCell,
  SearchInput,
  useClientTable,
  type DataTableColumn,
  type SortValue,
} from "@/components/admin/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatCurrency,
  FundReplenishmentRecord,
} from "@/lib/fund-replenishment-utils";

const RECORD_SORTERS: Record<string, (r: FundReplenishmentRecord) => SortValue> = {
  date: (r) => r.replenishmentDate,
  amount: (r) => r.amount,
  recordedBy: (r) => r.recordedByUser?.fullName,
  recordedAt: (r) => r.createdAt,
};

const COLUMNS: DataTableColumn<FundReplenishmentRecord>[] = [
  {
    id: "date",
    header: "Date",
    sortKey: "date",
    className: "whitespace-nowrap",
    cell: (r) => format(new Date(r.replenishmentDate), "dd MMM yyyy"),
  },
  { id: "amount", header: "Amount", sortKey: "amount", align: "right", className: "font-mono", cell: (r) => formatCurrency(r.amount) },
  {
    id: "before",
    header: "Balance before",
    align: "right",
    className: "font-mono text-muted-foreground",
    cell: (r) => formatCurrency(r.balanceBefore),
  },
  { id: "after", header: "Balance after", align: "right", className: "font-mono", cell: (r) => formatCurrency(r.balanceAfter) },
  {
    id: "remarks",
    header: "Remarks",
    cell: (r) => (
      <span className="block max-w-xs truncate" title={r.remarks || ""}>
        {r.remarks || "—"}
      </span>
    ),
  },
  { id: "recordedBy", header: "Recorded by", sortKey: "recordedBy", cell: (r) => r.recordedByUser?.fullName ?? "—" },
  { id: "recordedAt", header: "Recorded at", sortKey: "recordedAt", cell: (r) => <DateTimeCell value={r.createdAt} /> },
];

export function RevolvingFundHistory(props: {
  records: FundReplenishmentRecord[];
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return props.records;
    return props.records.filter((r) => {
      return (
        (r.remarks || "").toLowerCase().includes(q) ||
        (r.recordedByUser?.fullName || "").toLowerCase().includes(q)
      );
    });
  }, [props.records, query]);
  const table = useClientTable(filtered, { sorters: RECORD_SORTERS, pageSize: 25 });

  return (
    <Card>
      <CardHeader className="space-y-3">
        <CardTitle>Replenishment history</CardTitle>
        <SearchInput
          label="Search replenishments"
          placeholder="Search by remarks or recorded by..."
          value={query}
          onChange={(value) => {
            setQuery(value);
            table.resetPage();
          }}
        />
      </CardHeader>
      <CardContent>
        <DataTable
          caption="Replenishment history"
          columns={COLUMNS}
          rows={table.rows}
          rowKey={(r) => r.id}
          isLoading={false}
          emptyMessage={query ? "No replenishments match your search." : "No replenishment records yet."}
          sort={table.sort}
          onSortChange={table.onSortChange}
          paging={table.paging}
        />
      </CardContent>
    </Card>
  );
}
