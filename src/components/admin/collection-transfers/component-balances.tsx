"use client";

import { AlertTriangle, Landmark, Percent, Receipt, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  clampNonNegative,
  componentLabel,
  formatCurrency,
  TRANSFER_COMPONENTS,
  type ComponentBalance,
  type TransferComponent,
} from "@/lib/collection-transfer-utils";

const COMPONENT_ICONS: Record<TransferComponent, LucideIcon> = {
  Penalty: AlertTriangle,
  Interest: Percent,
  ServiceFee: Receipt,
  Tax: Landmark,
};

/** One selectable tile per component: what is still available, what is approved and what awaits a checker. */
export function ComponentBalanceCards(props: {
  balances: ComponentBalance[];
  selected: TransferComponent;
  onSelect: (component: TransferComponent) => void;
  loading?: boolean;
}) {
  const byKey = new Map(props.balances.map((b) => [b.component, b]));

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {TRANSFER_COMPONENTS.map(({ key, label }) => {
        const balance = byKey.get(key);
        const Icon = COMPONENT_ICONS[key];
        const active = props.selected === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => props.onSelect(key)}
            aria-pressed={active}
            className={cn(
              "rounded-lg border bg-card p-4 text-left shadow-sm transition-colors",
              "hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active && "border-primary ring-1 ring-primary"
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{label}</span>
              <span
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-md",
                  active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
            </div>
            {props.loading ? (
              <>
                <Skeleton className="mt-3 h-6 w-28" />
                <Skeleton className="mt-2 h-3 w-24" />
              </>
            ) : (
              <>
                <p className="mt-3 text-xs text-muted-foreground">Available to transfer</p>
                <p className="truncate font-mono text-lg font-semibold" title={formatCurrency(balance?.available)}>
                  {formatCurrency(balance?.available)}
                </p>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  Approved: <span className="font-mono">{formatCurrency(balance?.transferred)}</span>
                </p>
                {balance && balance.pending > 0 ? (
                  <p className="truncate text-xs text-amber-700 dark:text-amber-400">
                    Pending approval: <span className="font-mono">{formatCurrency(balance.pending)}</span>
                  </p>
                ) : null}
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Before/after view of the selected component for the amount being entered. */
export function SelectedComponentSummary(props: {
  balance: ComponentBalance | undefined;
  component: TransferComponent;
  amount: number | null;
}) {
  const available = props.balance?.available ?? 0;
  const after =
    props.amount != null && Number.isFinite(props.amount) && props.amount > 0
      ? clampNonNegative(available - props.amount)
      : available;
  const label = componentLabel(props.component);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">{label} balance</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <Row label="Collected" value={props.balance?.collected} />
        <Row label="Approved transfers" value={props.balance?.transferred} />
        <Row label="Pending approval" value={props.balance?.pending} />
        <Row label="Available to transfer" value={available} strong />
        <Row label="Available after this transfer" value={after} strong />
        <p className="pt-3 text-xs leading-relaxed text-muted-foreground">
          Submitted transfers wait for a checker on Transfer Approvals. Their amount is reserved while pending.{" "}
          {props.balance?.postsJournal ? (
            <>
              Once approved, a tax transfer posts a journal entry from{" "}
              <span className="font-medium">{props.balance?.sourceLedgerName ?? "Tax Receivable"}</span> to the
              destination account, so it shows as tax paid on the dashboard.
            </>
          ) : (
            <>
              Collected = <span className="font-medium">{props.balance?.sourceLedgerName ?? `${label} Received`}</span>{" "}
              ledger balance. {label} transfers are kept in this register only. The amount was already booked as
              collected when the borrower repaid, so approval does not post to the ledger.
            </>
          )}
        </p>
      </CardContent>
    </Card>
  );
}

function Row(props: { label: string; value: number | undefined; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{props.label}</span>
      <span className={cn("font-mono", props.strong && "font-semibold")}>{formatCurrency(props.value)}</span>
    </div>
  );
}
