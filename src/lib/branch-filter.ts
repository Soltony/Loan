import prisma from './prisma';

export type BranchScopedUser = {
  role?: string;
  branchCode?: number | null;
  // May arrive already parsed (number[]) or as the raw DB JSON string.
  managedBranchCodes?: number[] | string | null;
};

export function parseManagedBranchCodes(raw: string | null | undefined): number[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const codes = parsed
      .map((v) => (typeof v === 'number' ? v : parseInt(String(v), 10)))
      .filter((n) => Number.isFinite(n) && n > 0);
    return codes.length > 0 ? codes : null;
  } catch {
    return null;
  }
}

function normalizeManagedBranchCodes(
  value: number[] | string | null | undefined,
): number[] {
  if (Array.isArray(value)) {
    return value.filter((n) => Number.isFinite(n) && n > 0);
  }
  return parseManagedBranchCodes(value) ?? [];
}

/**
 * Branch codes a user is scoped to.
 *  - `Branch`/`District` => the codes they are allowed to see. A branch-scoped
 *    user with no codes assigned resolves to `[]` (sees NOTHING) — never `null`
 *    (which would mean "no restriction").
 *  - any other role => `null` (unrestricted).
 */
export function getBranchCodesFromUser(user: BranchScopedUser): number[] | null {
  if (user.role === 'Branch') {
    return user.branchCode != null ? [user.branchCode] : [];
  }
  if (user.role === 'District') {
    return normalizeManagedBranchCodes(user.managedBranchCodes);
  }
  return null;
}

/** @deprecated Use getBranchCodesFromUser */
export function getBranchCodeFromUser(user: BranchScopedUser): number | null {
  const codes = getBranchCodesFromUser(user);
  return codes?.length === 1 ? codes[0] : null;
}

export function isBranchScopedUser(user: BranchScopedUser): boolean {
  return user.role === 'Branch' || user.role === 'District';
}

/** Parse `branchCode` query param. Returns undefined for all/missing (district: all managed branches). */
export function parseBranchCodeQueryParam(
  raw: string | null | undefined
): number | undefined {
  if (!raw || raw === 'all') return undefined;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * Resolve which branch codes apply for the current user, optionally narrowed to one branch.
 * Returns null when user is not branch-scoped. Returns [] when request is out of scope.
 */
export function getEffectiveBranchCodes(
  user: BranchScopedUser,
  requestedBranchCode?: number | null
): number[] | null {
  const userCodes = getBranchCodesFromUser(user);
  if (userCodes == null) return null;

  // Single-branch users are always locked to their branch.
  if (user.role === 'Branch') return userCodes;

  if (requestedBranchCode != null) {
    return userCodes.includes(requestedBranchCode) ? [requestedBranchCode] : [];
  }

  return userCodes;
}

/** Recursively find a `Branchcode`/`branchcode` key (it lives under `detail` in CBS payloads). */
export function extractBranchCode(value: unknown): number | null {
  if (value == null || typeof value !== 'object') return null;
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (key.toLowerCase() === 'branchcode') {
      const n = typeof v === 'number' ? v : parseInt(String(v), 10);
      if (Number.isFinite(n)) return n;
    } else if (v && typeof v === 'object') {
      const nested = extractBranchCode(v);
      if (nested != null) return nested;
    }
  }
  return null;
}

export async function getBorrowerIdsForBranchCode(branchCode: number): Promise<string[]> {
  return getBorrowerIdsForBranchCodes([branchCode]);
}

/**
 * The branch code at the start of a `"branchcode": <code>` snippet (any key
 * casing, number or quoted). Exact: `"Branchcode":409` is 409, never 4.
 */
export function branchCodeFromSnippet(snippet: string | null | undefined): number | null {
  const match = /^"branchcode"\s*:\s*"?\s*(\d+)/i.exec(snippet ?? '');
  if (!match) return null;
  const n = Number.parseInt(match[1], 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Each provisioned-data row that names a branch, as `"branchcode": <code>…` —
 * the first `"branchcode"` key in the JSON text, which is the first one
 * extractBranchCode meets walking the object. One scan of the table, and only
 * a few dozen characters per row come back instead of the whole JSON.
 *
 * It replaces eight `LIKE '%…%'` patterns per branch code ORed together: each
 * pattern rescans every JSON blob, which took 16 s for a District user with
 * five branches (3 s for one branch) on every page they opened, the dashboard
 * after sign-in first. The explicit CI collation keeps the key match
 * case-insensitive on any database collation.
 */
async function branchSnippets(): Promise<Array<{ borrowerId: string; snippet: string | null }>> {
  return prisma.$queryRaw<Array<{ borrowerId: string; snippet: string | null }>>`
    SELECT [borrowerId],
           SUBSTRING([data], CHARINDEX(N'"branchcode"', [data] COLLATE Latin1_General_CI_AS), 64) AS [snippet]
    FROM [dbo].[ProvisionedData]
    WHERE CHARINDEX(N'"branchcode"', [data] COLLATE Latin1_General_CI_AS) > 0`;
}

async function loadBorrowerIdsForBranchCodes(branchCodes: number[]): Promise<string[]> {
  const wanted = new Set(branchCodes);
  const borrowerIds = new Set<string>();
  for (const row of await branchSnippets()) {
    const code = branchCodeFromSnippet(row.snippet);
    if (code != null && wanted.has(code)) borrowerIds.add(row.borrowerId);
  }
  return [...borrowerIds];
}

/**
 * Branch scopes are read on every request a Branch/District user makes (the
 * reports screen alone sends two or three at once), and change only when
 * customer data is re-fetched, so each set of codes is kept briefly. A
 * request in flight is shared, not repeated.
 */
const BRANCH_SCOPE_TTL_MS = 60_000;
const branchScopeCache = new Map<string, { at: number; borrowerIds: Promise<string[]> }>();

export async function getBorrowerIdsForBranchCodes(branchCodes: number[]): Promise<string[]> {
  if (branchCodes.length === 0) return [];
  const key = [...new Set(branchCodes)].sort((a, b) => a - b).join(',');
  const now = Date.now();
  let entry = branchScopeCache.get(key);
  if (!entry || now - entry.at >= BRANCH_SCOPE_TTL_MS) {
    const borrowerIds = loadBorrowerIdsForBranchCodes(branchCodes);
    entry = { at: now, borrowerIds };
    branchScopeCache.set(key, entry);
    // A failed read is not kept.
    borrowerIds.catch(() => {
      if (branchScopeCache.get(key)?.borrowerIds === borrowerIds) branchScopeCache.delete(key);
    });
  }
  // Callers get their own copy of the list.
  return [...(await entry.borrowerIds)];
}

function intersectBorrowerIds(existing: string[], branchBorrowerIds: string[]): string[] {
  const set = new Set(branchBorrowerIds);
  return existing.filter((id) => set.has(id));
}

export function applyBorrowerIdsToLoanWhere(
  whereClause: Record<string, unknown>,
  borrowerIds: string[] | null
): boolean {
  if (borrowerIds === null) return true;
  if (borrowerIds.length === 0) return false;

  const existing = (whereClause.borrowerId as { in?: string[] } | undefined)?.in;
  if (existing?.length) {
    const intersected = intersectBorrowerIds(existing, borrowerIds);
    if (intersected.length === 0) return false;
    whereClause.borrowerId = { in: intersected };
  } else {
    whereClause.borrowerId = { in: borrowerIds };
  }

  return true;
}

/** Apply branch/district filter to a loan-level Prisma where clause. Returns false when no rows match. */
export async function applyBranchFilterToLoanWhere(
  whereClause: Record<string, unknown>,
  branchCode: number | null
): Promise<boolean> {
  if (branchCode == null) return true;
  const borrowerIds = await getBorrowerIdsForBranchCode(branchCode);
  return applyBorrowerIdsToLoanWhere(whereClause, borrowerIds);
}

export async function applyUserBranchFilterToLoanWhere(
  whereClause: Record<string, unknown>,
  user: BranchScopedUser,
  requestedBranchCode?: number | null
): Promise<boolean> {
  const borrowerIds = await resolveBranchBorrowerIdsForUser(user, requestedBranchCode);
  return applyBorrowerIdsToLoanWhere(whereClause, borrowerIds);
}

/** Apply branch filter to nested `loan` relation filters (journal entries, payments, etc.). */
export function applyBranchFilterToNestedLoan(
  whereClause: Record<string, unknown>,
  borrowerIds: string[],
  loanKey = 'loan'
): void {
  const loan = (whereClause[loanKey] as Record<string, unknown> | undefined) ?? {};
  const existing = (loan.borrowerId as { in?: string[] } | undefined)?.in;

  if (borrowerIds.length === 0) {
    whereClause[loanKey] = { ...loan, borrowerId: { in: [] } };
    return;
  }

  if (existing?.length) {
    whereClause[loanKey] = {
      ...loan,
      borrowerId: { in: intersectBorrowerIds(existing, borrowerIds) },
    };
  } else {
    whereClause[loanKey] = { ...loan, borrowerId: { in: borrowerIds } };
  }
}

export async function resolveBranchBorrowerIdsForUser(
  user: BranchScopedUser,
  requestedBranchCode?: number | null
): Promise<string[] | null> {
  const branchCodes = getEffectiveBranchCodes(user, requestedBranchCode);
  if (branchCodes == null) return null;
  if (branchCodes.length === 0) return [];
  return getBorrowerIdsForBranchCodes(branchCodes);
}

/** @deprecated Use resolveBranchBorrowerIdsForUser */
export async function resolveBranchBorrowerIds(
  branchCode: number | null
): Promise<string[] | null> {
  if (branchCode == null) return null;
  return getBorrowerIdsForBranchCode(branchCode);
}
