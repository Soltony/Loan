export function formatCurrency(amount: number | null | undefined) {
  const n = typeof amount === "number" && Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function clampNonNegative(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, n);
}

export function roundCurrency(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Repayment components that leave the collection GL. `key` matches
// LedgerAccount.category and is what gets stored on the transfer record.
// Principal is deliberately absent: collected principal is not moved out
// through this register.
export const TRANSFER_COMPONENTS = [
  { key: "Penalty", label: "Penalty" },
  { key: "Interest", label: "Interest" },
  { key: "ServiceFee", label: "Service Fee" },
  { key: "Tax", label: "Tax" },
] as const;

export type TransferComponent = (typeof TRANSFER_COMPONENTS)[number]["key"];

export const TRANSFER_COMPONENT_KEYS = TRANSFER_COMPONENTS.map((c) => c.key) as [
  TransferComponent,
  ...TransferComponent[],
];

export function componentLabel(component: string | null | undefined) {
  return TRANSFER_COMPONENTS.find((c) => c.key === component)?.label ?? component ?? "Tax";
}

// Only tax transfers post to the ledger: tax is a liability this ledger tracks
// until it is remitted. The other components are recognised as collected (and
// as income) at repayment time, so moving them inside the CBS is register-only.
export function componentPostsJournal(component: string) {
  return component === "Tax";
}

// Maker-checker lifecycle, mirroring Manual Repayment:
//   PENDING_APPROVAL -> APPROVED | REJECTED
//   APPROVED -> PENDING_REVERSAL -> REVERSED (or back to APPROVED if declined)
// "SIMULATED" is how tax transfers were stored before maker-checker existed;
// those rows are treated exactly like APPROVED.
export const TRANSFER_STATUSES = [
  "PENDING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "PENDING_REVERSAL",
  "REVERSED",
] as const;
export type CollectionTransferStatus = (typeof TRANSFER_STATUSES)[number] | "SIMULATED";

export const TRANSFER_STATUS_LABELS: Record<CollectionTransferStatus, string> = {
  PENDING_APPROVAL: "Pending Approval",
  APPROVED: "Approved",
  SIMULATED: "Approved",
  REJECTED: "Rejected",
  PENDING_REVERSAL: "Reversal Pending",
  REVERSED: "Reversed",
};

export function transferStatusLabel(status: string) {
  return TRANSFER_STATUS_LABELS[status as CollectionTransferStatus] ?? status;
}

/** Approved and still standing: counts as transferred (a pending reversal has not taken effect yet). */
export function countsAsTransferred(status: string) {
  return status === "APPROVED" || status === "SIMULATED" || status === "PENDING_REVERSAL";
}

/** May have a reversal requested on it. */
export function isReversible(status: string) {
  return status === "APPROVED" || status === "SIMULATED";
}

/** Database statuses behind a status filter value ("APPROVED" also matches legacy rows). */
export function expandStatusFilter(status: string): string[] {
  return status === "APPROVED" ? ["APPROVED", "SIMULATED"] : [status];
}

type UserSummary = { id: string; fullName: string; email: string };

export type CollectionTransfer = {
  id: string;
  providerId: string;
  provider?: { id: string; name: string } | null;
  component: TransferComponent;
  transferAmount: number;
  sourceAccountName?: string | null;
  destinationAccountName: string;
  transferReference: string;
  transferDate: string;
  status: CollectionTransferStatus;
  journalEntryId?: string | null;
  notes?: string | null;
  createdAt: string;
  recordedByUserId: string;
  recordedByUser?: UserSummary | null;
  checkedByUser?: UserSummary | null;
  checkedAt?: string | null;
  rejectionReason?: string | null;
  reversalRequestedByUserId?: string | null;
  reversalRequestedByUser?: UserSummary | null;
  reversalRequestedAt?: string | null;
  reversedByUser?: UserSummary | null;
  reversalReason?: string | null;
  reversedAt?: string | null;
};

export type ComponentBalance = {
  component: TransferComponent;
  // Ledger account whose balance bounds what can be submitted for this component.
  sourceLedgerName: string | null;
  // collected = transferred + pending + available
  collected: number;
  transferred: number;
  pending: number;
  available: number;
  postsJournal: boolean;
};

export type AccountSuggestions = { sources: string[]; destinations: string[] };

export type CollectionTransferSummary = {
  providerId: string;
  components: ComponentBalance[];
  suggestions: Partial<Record<TransferComponent, AccountSuggestions>>;
};

// Rows recorded before the source account was captured were all tax transfers
// out of the Tax Receivable holding account.
export function sourceAccountLabel(t: Pick<CollectionTransfer, "sourceAccountName" | "component">) {
  return t.sourceAccountName?.trim() || (t.component === "Tax" ? "Tax Receivable (collected tax)" : "—");
}
