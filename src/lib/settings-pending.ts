import prisma from '@/lib/prisma';

// Settings items that may have only one change waiting for approval at a time.
// pending-changes/route.ts refuses a second request (409); the Settings page
// reads the same list so its "Pending Approval" state survives a reload.
// LoanProduct's status column can't carry this: a pending term change sets it
// to 'Disabled', which looks the same as a product an admin switched off.
export const ONE_PENDING_CHANGE_PER_ENTITY = new Set<string>([
  'LoanProvider',
  'LoanProduct',
  'EligibilityList',   // entityId = product id
  'LoanCycleConfig',   // entityId = product id
  'TermsAndConditions', // entityId = active terms id, or the provider id for a first version
]);

export type SettingsPendingState = {
  /** Product ids with a LoanProduct change (fees, limits, deletion…) waiting. */
  products: string[];
  /** Product ids with an eligibility list waiting. */
  eligibility: string[];
  /** Product ids with a loan-cycle change waiting. */
  loanCycles: string[];
  /** Provider ids with a new terms version waiting. */
  terms: string[];
  /** Provider ids with a provider change waiting. */
  providers: string[];
};

export async function getSettingsPendingState(): Promise<SettingsPendingState> {
  const open = await prisma.pendingChange.findMany({
    where: { status: 'PENDING', entityType: { in: Array.from(ONE_PENDING_CHANGE_PER_ENTITY) } },
    select: { entityType: true, entityId: true, payload: true },
  });

  const state: SettingsPendingState = { products: [], eligibility: [], loanCycles: [], terms: [], providers: [] };
  for (const change of open) {
    if (!change.entityId) continue;
    switch (change.entityType) {
      case 'LoanProduct': state.products.push(change.entityId); break;
      case 'EligibilityList': state.eligibility.push(change.entityId); break;
      case 'LoanCycleConfig': state.loanCycles.push(change.entityId); break;
      case 'LoanProvider': state.providers.push(change.entityId); break;
      case 'TermsAndConditions': {
        // The id may be a terms row, so take the provider from the payload.
        try {
          const providerId = JSON.parse(change.payload)?.updated?.providerId;
          if (providerId) state.terms.push(String(providerId));
        } catch {
          // Unreadable payload: nothing to show.
        }
        break;
      }
    }
  }
  return state;
}
