import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { loanStatusFilter } from '@/lib/reports/borrowers';
import { emptyPage, reportBorrowerScope, reportContext, serverError } from '@/lib/reports/http';
import { DEFAULT_LOAN_SORT, LOAN_SORT_COLUMNS, loansReport } from '@/lib/reports/loans';
import { reportPaging, reportPeriod, reportProvider, reportSort } from '@/lib/reports/params';

export const dynamic = 'force-dynamic';

/** GET /api/reports/loans — the loan book (Provider Loans and Borrower Performance). */
export async function GET(req: NextRequest) {
  const context = await reportContext(req);
  if (context instanceof NextResponse) return context;
  const { user, params } = context;

  const paging = reportPaging(params);
  const providerId = reportProvider(user, params.get('providerId'));
  if (providerId === 'none') return emptyPage(paging);

  try {
    const scope = await reportBorrowerScope(user, params);
    if (scope?.length === 0) return emptyPage(paging);
    const page = await loansReport(
      prisma,
      {
        providerId,
        period: reportPeriod(params),
        search: params.get('search')?.trim() || undefined,
        status: loanStatusFilter(params.get('status')),
        scope,
      },
      paging,
      reportSort(params, LOAN_SORT_COLUMNS, DEFAULT_LOAN_SORT),
    );
    return NextResponse.json(page);
  } catch (error) {
    return serverError('loans report', error);
  }
}
