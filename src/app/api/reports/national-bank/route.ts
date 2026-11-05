import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { emptyPage, reportBorrowerScope, reportContext, serverError } from '@/lib/reports/http';
import {
  DEFAULT_NATIONAL_BANK_SORT,
  NATIONAL_BANK_SORT_COLUMNS,
  nationalBankReport,
} from '@/lib/reports/national-bank';
import { reportPaging, reportPeriod, reportProvider, reportSort } from '@/lib/reports/params';

export const dynamic = 'force-dynamic';

/** GET /api/reports/national-bank — the National Bank of Ethiopia return. */
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
    const page = await nationalBankReport(
      prisma,
      {
        providerId,
        period: reportPeriod(params),
        search: params.get('search')?.trim() || undefined,
        scope,
      },
      paging,
      reportSort(params, NATIONAL_BANK_SORT_COLUMNS, DEFAULT_NATIONAL_BANK_SORT),
    );
    return NextResponse.json(page);
  } catch (error) {
    return serverError('National Bank report', error);
  }
}
