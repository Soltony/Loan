/**
 * The CBS reference (FT number) a repayment was posted under, read back from the
 * journal entry description each repayment channel writes:
 *
 *   CBS NPL auto-collection  "CBS NPL collection for loan … (correlationId=… cbsTxn=FT26198YH98D)"
 *   Manual resolution        "Manual resolution for pending payment … (FT: FT26107QP2Z8)"
 *                            (older rows: "Manual repayment resolution for pending payment … (FT: …)")
 *   Manual repayment         "Manual repayment <id> — Bank Transfer (Ref: FT123456789)" — the
 *                            reference the Maker keyed in. It is not always an FT: a cash
 *                            receipt or a cheque number is just as valid, and the column
 *                            shows whatever the branch recorded.
 *   SuperApp callback        "SuperApp repayment … via TxRef <uuid>" — the FT is on the
 *                            PaymentTransaction row the gateway callback stored for that TxRef.
 *
 * The description is exact. Matching a repayment to a pending payment by loan and
 * amount is not: it stamped one FT onto every same-amount repayment on a loan,
 * which is what made the repayment report list the same FT several times.
 *
 * A manual resolution also names the pending payment it resolved. That payment's
 * transactionId holds the FT as ops keep it — an FT typed wrong at resolution is
 * corrected there, while the description keeps the typo — so prefer it.
 */
export type RepaymentReference =
  | { kind: "cbs"; ft: string }
  | { kind: "manual"; ft: string; pendingPaymentId?: string }
  | { kind: "manualRepayment"; reference: string; manualRepaymentId?: string }
  | { kind: "superapp"; txnRef: string }
  | { kind: "unknown" };

/**
 * A CBS transfer reference: "FT", the two-digit year and day of year, then five
 * letters or digits — the shape of every FT on the Salary Advance GL statement.
 * Manual resolutions are keyed in by hand, and the ones that broke the reports
 * were an account number and FTs missing a digit.
 */
const CBS_FT_REFERENCE = /^FT\d{5}[A-Z0-9]{5}$/;

/** The FT in canonical form (trimmed, upper case), or null when it is not shaped like one. */
export function normalizeFtReference(input: string | null | undefined): string | null {
  const ft = String(input ?? "").trim().toUpperCase();
  return CBS_FT_REFERENCE.test(ft) ? ft : null;
}

const CBS_TXN = /cbsTxn=([A-Za-z0-9-]+)/i;
const MANUAL_FT = /\(FT:\s*([^)]+?)\s*\)/i;
const MANUAL_PENDING_PAYMENT = /pending payment\s+([A-Za-z0-9]+)/i;
const SUPERAPP_TXREF = /TxRef\s*[:#]?\s*([A-Za-z0-9-]+)/i;
/**
 * Anchored at the start so the "Reversal: manual repayment …" journal, whose free-text
 * reason carries no reference, is not mistaken for a posting. The id must look like a
 * cuid, which keeps the legacy "Manual repayment resolution for pending payment …"
 * description (a manual *resolution*, matched by MANUAL_FT below) out of this branch.
 */
const MANUAL_REPAYMENT = /^Manual repayment\s+([a-z0-9]{16,})\b/i;
/** Anchored at the end, so a reference containing ")" is still captured whole. */
const MANUAL_REPAYMENT_REF = /\(Ref:\s*(\S.*?)\s*\)\s*$/i;

export function parseRepaymentReference(
  description: string | null | undefined,
): RepaymentReference {
  const text = String(description ?? "");

  const cbs = text.match(CBS_TXN);
  if (cbs) return { kind: "cbs", ft: cbs[1] };

  // Checked before the FT forms: a manual repayment carries its reference inline,
  // and the reference is immutable once posted (an error is reversed, never edited),
  // so the description is the whole answer and needs no lookup.
  const manualRepayment = text.match(MANUAL_REPAYMENT);
  if (manualRepayment) {
    const ref = text.match(MANUAL_REPAYMENT_REF);
    if (ref) {
      return { kind: "manualRepayment", reference: ref[1], manualRepaymentId: manualRepayment[1] };
    }
  }

  const manual = text.match(MANUAL_FT);
  if (manual) {
    const pendingPayment = text.match(MANUAL_PENDING_PAYMENT);
    return pendingPayment
      ? { kind: "manual", ft: manual[1], pendingPaymentId: pendingPayment[1] }
      : { kind: "manual", ft: manual[1] };
  }

  const txRef = text.match(SUPERAPP_TXREF);
  if (txRef) return { kind: "superapp", txnRef: txRef[1] };

  return { kind: "unknown" };
}

/**
 * Ids of the pending payments these manual resolutions resolved. Their current
 * transactionId is the `ftByPendingPayment` lookup referenceFor expects.
 */
export function manualResolutionIds(references: RepaymentReference[]): string[] {
  return Array.from(
    new Set(references.flatMap((r) => (r.kind === "manual" && r.pendingPaymentId ? [r.pendingPaymentId] : []))),
  );
}

/** The FT to show for a repayment, given the FT lookups for its channel. */
export function referenceFor(
  reference: RepaymentReference,
  lookups: { ftByTxnRef: Map<string, string>; ftByPendingPayment: Map<string, string> },
): string | null {
  switch (reference.kind) {
    case "cbs":
      return reference.ft;
    case "manual":
      return (reference.pendingPaymentId && lookups.ftByPendingPayment.get(reference.pendingPaymentId)) || reference.ft;
    case "manualRepayment":
      return reference.reference;
    case "superapp":
      return lookups.ftByTxnRef.get(reference.txnRef) ?? null;
    default:
      return null;
  }
}
