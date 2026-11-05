"use client";

import type { LoanDetails } from "@/lib/types";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandButton, DetailRow, Panel } from "@/components/miniapp/ui";
import { formatDate, formatETB } from "@/lib/miniapp/format";

/** Where the money transfer stands once the loan has been created. */
export type DisbursementState = "sending" | "sent" | "failed" | "skipped";

interface LoanDetailsViewProps {
  details: LoanDetails;
  disbursement: DisbursementState;
  /** What reaches the customer's account after deductions. */
  amountToReceive: number;
  totalToRepay?: number;
  /** e.g. "•••• 2237" */
  accountLabel?: string;
  onDone: () => void;
  onViewLoan: () => void;
}

const copy: Record<
  DisbursementState,
  { title: string; body: (amount: string, account: string) => string }
> = {
  sending: {
    title: "Sending your money",
    body: (amount, account) =>
      `Your loan is approved. We are sending ${amount} to ${account}.`,
  },
  sent: {
    title: "Loan approved",
    body: (amount, account) => `${amount} has been sent to ${account}.`,
  },
  failed: {
    title: "Transfer not completed",
    body: () =>
      "Your loan was created, but the money could not be sent to your account. Please do not apply again. Contact the bank and quote the reference below.",
  },
  skipped: {
    title: "Transfer not completed",
    body: () =>
      "Your loan was created, but no account was selected to receive it. Please do not apply again. Contact the bank and quote the reference below.",
  },
};

export function LoanDetailsView({
  details,
  disbursement,
  amountToReceive,
  totalToRepay,
  accountLabel,
  onDone,
  onViewLoan,
}: LoanDetailsViewProps) {
  const { title, body } = copy[disbursement];
  const problem = disbursement === "failed" || disbursement === "skipped";
  const sending = disbursement === "sending";

  return (
    <div className="pt-4">
      <div className="flex flex-col items-center text-center" aria-live="polite">
        <div
          className={cn(
            "grid h-20 w-20 place-items-center rounded-full",
            sending && "bg-brand-soft text-brand-ink",
            disbursement === "sent" && "bg-emerald-50 text-emerald-600",
            problem && "bg-amber-50 text-amber-600"
          )}
        >
          {sending ? (
            <Loader2 className="h-9 w-9 animate-spin" aria-hidden />
          ) : problem ? (
            <AlertTriangle className="h-9 w-9" aria-hidden />
          ) : (
            <span className="grid h-12 w-12 place-items-center rounded-full bg-emerald-600 text-white">
              <Check className="h-7 w-7" strokeWidth={3} aria-hidden />
            </span>
          )}
        </div>
        <h2 className="mt-4 text-2xl font-bold tracking-tight">{title}</h2>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-gray-600">
          {body(formatETB(amountToReceive), accountLabel || "your account")}
        </p>
      </div>

      <Panel className="mt-6">
        <DetailRow
          label={problem ? "Amount to receive" : "You receive"}
          value={formatETB(amountToReceive)}
          strong
        />
        {accountLabel && <DetailRow label="Paid into" value={accountLabel} />}
        <DetailRow label="Loan amount" value={formatETB(details.loanAmount)} />
        {typeof totalToRepay === "number" && totalToRepay > 0 && (
          <DetailRow label="Total to repay" value={formatETB(totalToRepay)} />
        )}
        <DetailRow label="Due date" value={formatDate(details.dueDate)} />
        <div className="mt-1 border-t border-gray-100 pt-2">
          <p className="text-xs text-gray-500">Reference</p>
          <p className="mt-0.5 select-all break-all font-mono text-xs text-gray-700">
            {details.id}
          </p>
        </div>
      </Panel>

      <div className="mt-6 space-y-2">
        <BrandButton block size="lg" onClick={onDone} disabled={sending}>
          Done
        </BrandButton>
        <BrandButton block variant="outline" size="lg" onClick={onViewLoan} disabled={sending}>
          View loan
        </BrandButton>
      </div>
    </div>
  );
}
