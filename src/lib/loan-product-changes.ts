// Shared helpers for classifying LoanProduct UPDATE pending-changes.
//
// Some product edits (e.g. uploading new salary mappings or an eligibility list)
// only affect who can apply for *new* loans — they do not change the terms of any
// existing loan contract. Those "safe" edits must still flow through the
// maker-checker approval process, but they should NOT disable the loan product
// while pending or after approval. Term changes (amount, duration, fees, tiers…)
// continue to disable the product so an admin re-reviews and re-enables it.

// Fields that don't change existing loan terms. Editing only these must keep the
// product in its current status. Mirrors `safeFieldsWithActiveLoans` used by the
// active-loan guard in the approvals route.
export const SAFE_LOAN_PRODUCT_FIELDS = new Set<string>([
  "salaryAdvanceMappings",   // Just controls who can apply for NEW loans
  "status",                  // Enable/disable is handled via its own direct flow
  "eligibilityFilter",       // Controls eligibility for NEW loans
  "eligibilityUploadId",     // Related to eligibility for NEW loans
  "dataProvisioningEnabled", // Data provisioning settings
  "dataProvisioningConfigId",
]);

/**
 * Given a LoanProduct UPDATE pending-change payload ({ original, updated }),
 * decide whether every actual change is "safe" — i.e. the product should remain
 * in its current status rather than being disabled.
 *
 * Returns true only when no non-safe scalar field changed and the loan amount
 * tiers were not modified. A payload with no detectable change is treated as
 * safe (there is nothing that would justify disabling the product).
 */
export function isSafeOnlyProductUpdate(payload: any): boolean {
  const updated = payload?.updated ?? {};
  const original = payload?.original ?? {};

  // Non-scalar relations are compared/handled separately.
  const { loanAmountTiers: updatedTiers, eligibilityUpload: _eu, ...updatedRest } =
    updated;

  for (const key of Object.keys(updatedRest)) {
    if (key === "id") continue;
    const oldVal = JSON.stringify(original[key] ?? null);
    const newVal = JSON.stringify(updatedRest[key] ?? null);
    if (oldVal !== newVal && !SAFE_LOAN_PRODUCT_FIELDS.has(key)) {
      return false;
    }
  }

  // A change to loan amount tiers is a term change → not safe.
  const originalTiers = original?.loanAmountTiers;
  const tiersChanged =
    JSON.stringify(originalTiers ?? null) !== JSON.stringify(updatedTiers ?? null);
  if (tiersChanged) return false;

  return true;
}
