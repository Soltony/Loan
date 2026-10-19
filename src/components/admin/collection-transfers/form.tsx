"use client";

import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  componentLabel,
  formatCurrency,
  TRANSFER_COMPONENTS,
  type AccountSuggestions,
  type TransferComponent,
} from "@/lib/collection-transfer-utils";

export function parseAmountLoose(input: string) {
  const raw = String(input ?? "").trim();
  if (!raw) return 0;
  // allow users to paste formatted numbers like "29,947.10"
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

export type CollectionTransferDraft = {
  component: TransferComponent;
  transferAmount: string; // keep as string for input
  sourceAccountName: string;
  destinationAccountName: string;
  transferReference: string;
  transferDate: string; // yyyy-MM-dd
  notes: string;
};

export function isDraftComplete(draft: CollectionTransferDraft, available: number) {
  const amount = parseAmountLoose(draft.transferAmount);
  return (
    Number.isFinite(amount) &&
    amount > 0 &&
    amount <= available + 0.005 &&
    !!draft.sourceAccountName.trim() &&
    !!draft.destinationAccountName.trim() &&
    !!draft.transferReference.trim() &&
    !!draft.transferDate
  );
}

export function CollectionTransferForm(props: {
  draft: CollectionTransferDraft;
  available: number;
  suggestions: AccountSuggestions | undefined;
  maxDate: string;
  disabled?: boolean;
  canCreate?: boolean;
  onChange: (next: CollectionTransferDraft) => void;
  onComponentChange: (component: TransferComponent) => void;
  onSubmit: () => void;
}) {
  const { draft } = props;
  const label = componentLabel(draft.component);
  const parsedAmount = parseAmountLoose(draft.transferAmount);
  const exceeds = Number.isFinite(parsedAmount) && parsedAmount > props.available + 0.005;
  const invalidAmount = draft.transferAmount.trim() !== "" && (!Number.isFinite(parsedAmount) || parsedAmount <= 0);
  let amountError: string | null = null;
  if (exceeds) {
    amountError = `Amount exceeds the ${label.toLowerCase()} available to transfer (${formatCurrency(props.available)}).`;
  } else if (invalidAmount) {
    amountError = "Enter an amount greater than zero.";
  }
  const set = (patch: Partial<CollectionTransferDraft>) => props.onChange({ ...draft, ...patch });
  const sourceListId = `collection-transfer-sources-${draft.component}`;
  const destinationListId = `collection-transfer-destinations-${draft.component}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Record transfer</CardTitle>
        <CardDescription>
          Record a transfer that was already made in the CBS: which amount moved, from which account to which
          account, and under which reference. A checker approves it on Transfer Approvals.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="ct-component">Component</Label>
            <Select
              value={draft.component}
              onValueChange={(v) => props.onComponentChange(v as TransferComponent)}
              disabled={props.disabled}
            >
              <SelectTrigger id="ct-component">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRANSFER_COMPONENTS.map((c) => (
                  <SelectItem key={c.key} value={c.key}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="ct-amount">Transfer amount</Label>
              {props.available > 0 ? (
                <button
                  type="button"
                  className="text-xs text-primary underline-offset-2 hover:underline disabled:opacity-50"
                  disabled={props.disabled}
                  onClick={() => set({ transferAmount: props.available.toFixed(2) })}
                >
                  Use full {formatCurrency(props.available)}
                </button>
              ) : null}
            </div>
            <Input
              id="ct-amount"
              type="text"
              inputMode="decimal"
              value={draft.transferAmount}
              disabled={props.disabled}
              onChange={(e) => set({ transferAmount: e.target.value })}
              placeholder={`Max ${formatCurrency(props.available)}`}
              aria-invalid={exceeds || invalidAmount}
            />
            {amountError ? <p className="text-sm text-destructive">{amountError}</p> : null}
          </div>
        </div>

        <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-[1fr_auto_1fr]">
          <div className="space-y-2">
            <Label htmlFor="ct-source">From account (GL)</Label>
            <Input
              id="ct-source"
              list={sourceListId}
              value={draft.sourceAccountName}
              disabled={props.disabled}
              onChange={(e) => set({ sourceAccountName: e.target.value })}
              placeholder="e.g. Loan collection GL 1234567890"
              autoComplete="off"
            />
            <datalist id={sourceListId}>
              {(props.suggestions?.sources ?? []).map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
          <ArrowRight className="mx-auto mb-2.5 hidden h-4 w-4 text-muted-foreground md:block" aria-hidden />
          <div className="space-y-2">
            <Label htmlFor="ct-destination">To account</Label>
            <Input
              id="ct-destination"
              list={destinationListId}
              value={draft.destinationAccountName}
              disabled={props.disabled}
              onChange={(e) => set({ destinationAccountName: e.target.value })}
              placeholder={`e.g. ${label} account 1234567890`}
              autoComplete="off"
            />
            <datalist id={destinationListId}>
              {(props.suggestions?.destinations ?? []).map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="ct-reference">Transfer reference</Label>
            <Input
              id="ct-reference"
              value={draft.transferReference}
              disabled={props.disabled}
              onChange={(e) => set({ transferReference: e.target.value })}
              placeholder="Unique reference / FT number"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ct-date">Transfer date</Label>
            <Input
              id="ct-date"
              type="date"
              value={draft.transferDate}
              max={props.maxDate}
              disabled={props.disabled}
              onChange={(e) => set({ transferDate: e.target.value })}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="ct-notes">Remarks / notes (optional)</Label>
          <Textarea
            id="ct-notes"
            value={draft.notes}
            disabled={props.disabled}
            onChange={(e) => set({ notes: e.target.value })}
            placeholder="e.g. Penalty collected 1–31 Oct 2026"
          />
        </div>

        <div className="flex items-center justify-end gap-2">
          {!props.canCreate ? (
            <span className="text-sm text-muted-foreground">You can view transfers but not submit them.</span>
          ) : null}
          <Button
            onClick={props.onSubmit}
            disabled={props.disabled || !props.canCreate || !isDraftComplete(draft, props.available)}
          >
            Review & Submit
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
