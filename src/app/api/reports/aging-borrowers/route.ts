import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { agingClassFilter } from '@/lib/reports/aging';
import { AGING_SORT_COLUMNS, agingBorrowersReport, DEFAULT_AGING_SORT } from '@/lib/reports/aging-borrowers';
import { emptyPage, reportBorrowerScope, reportContext, serverError } from '@/lib/reports/http';
import { reportPaging, reportProvider, reportSort } from '@/lib/reports/params';

export const dynamic = 'force-dynamic';

/** GET /api/reports/aging-borrowers — overdue borrowers as of today, classed by their oldest overdue loan. */
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
    const page = await agingBorrowersReport(
      prisma,
      {
        providerId,
        search: params.get('search')?.trim() || undefined,
        classification: agingClassFilter(params.get('class')),
        scope,
      },
      paging,
      reportSort(params, AGING_SORT_COLUMNS, DEFAULT_AGING_SORT),
    );
    return NextResponse.json(page);
  } catch (error) {
    return serverError('borrower aging report', error);
  }
}
