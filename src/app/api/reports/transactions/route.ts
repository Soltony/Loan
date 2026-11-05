import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { emptyPage, reportBorrowerScope, reportContext, serverError } from '@/lib/reports/http';
import { reportPaging, reportPeriod, reportProvider, reportSort } from '@/lib/reports/params';
import {
  DEFAULT_TRANSACTION_SORT,
  TRANSACTION_SORT_COLUMNS,
  transactionsReport,
  transactionType,
} from '@/lib/reports/transactions';

export const dynamic = 'force-dynamic';

/** GET /api/reports/transactions — ledger transactions of loans (`type`: disbursement or repayment). */
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
    const page = await transactionsReport(
      prisma,
      {
        providerId,
        period: reportPeriod(params),
        search: params.get('search')?.trim() || undefined,
        type: transactionType(params.get('type')),
        scope,
      },
      paging,
      reportSort(params, TRANSACTION_SORT_COLUMNS, DEFAULT_TRANSACTION_SORT),
    );
    return NextResponse.json(page);
  } catch (error) {
    return serverError('transactions report', error);
  }
}
