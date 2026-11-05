import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  collectionTotals,
  collectionsReport,
  COLLECTION_SORT_COLUMNS,
  DEFAULT_COLLECTION_SORT,
} from '@/lib/reports/collections';
import { emptyPage, reportBorrowerScope, reportContext, serverError } from '@/lib/reports/http';
import { reportPaging, reportPeriod, reportProvider, reportSort, reportTzOffset } from '@/lib/reports/params';

export const dynamic = 'force-dynamic';

/** GET /api/reports/collections — collections per provider and day, with the period's totals. */
export async function GET(req: NextRequest) {
  const context = await reportContext(req);
  if (context instanceof NextResponse) return context;
  const { user, params } = context;

  const paging = reportPaging(params);
  const empty = () => emptyPage(paging, { totals: collectionTotals([]) });
  const providerId = reportProvider(user, params.get('providerId'));
  if (providerId === 'none') return empty();

  try {
    const scope = await reportBorrowerScope(user, params);
    if (scope?.length === 0) return empty();
    const page = await collectionsReport(
      prisma,
      { providerId, period: reportPeriod(params), tzOffset: reportTzOffset(params), scope },
      paging,
      reportSort(params, COLLECTION_SORT_COLUMNS, DEFAULT_COLLECTION_SORT),
    );
    return NextResponse.json(page);
  } catch (error) {
    return serverError('collections report', error);
  }
}
