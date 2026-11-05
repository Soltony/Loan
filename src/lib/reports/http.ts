import { NextResponse, type NextRequest } from 'next/server';
import {
  isBranchScopedUser,
  parseBranchCodeQueryParam,
  resolveBranchBorrowerIdsForUser,
  type BranchScopedUser,
} from '../branch-filter';
import type { User } from '../types';
import { getUserFromSession } from '../user';
import { reportPage, type Paging } from './params';

/**
 * The borrowers a request may see: `null` = no branch restriction, `[]` =
 * none. Branch users are locked to their branch; District users may narrow to
 * one of theirs (`branchCode`). The list can be long: see scope.ts.
 */
export function reportBorrowerScope(user: BranchScopedUser, params: URLSearchParams): Promise<string[] | null> {
  return resolveBranchBorrowerIdsForUser(user, parseBranchCodeQueryParam(params.get('branchCode')));
}

/** The user a report route answers, and the request's query. */
export interface ReportContext {
  user: User;
  params: URLSearchParams;
}

/** The signed-in user with read access to reports, or the response refusing the request. */
export async function reportContext(req: NextRequest): Promise<ReportContext | NextResponse> {
  const user = await getUserFromSession();
  if (!user || !user.permissions?.['reports']?.read) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }
  return { user, params: new URL(req.url).searchParams };
}

/** An empty page, for a request that can match nothing (no provider, or no borrowers in the branch scope). */
export function emptyPage(paging: Paging, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ...reportPage([], 0, paging), ...extra });
}

/** District and Branch users do not manage provider funds: Fund Utilization is not theirs to see. */
export function canSeeFundUtilization(user: User): boolean {
  return !isBranchScopedUser(user as { role?: string });
}

export function serverError(label: string, error: unknown) {
  console.error(`Failed to build the ${label}:`, error);
  return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
}
