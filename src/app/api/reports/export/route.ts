import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { agingClassFilter } from '@/lib/reports/aging';
import { loanStatusFilter } from '@/lib/reports/borrowers';
import { buildReportWorkbook, EXPORT_SHEETS, exportFileName, parseSheets } from '@/lib/reports/export';
import { canSeeFundUtilization, reportBorrowerScope, reportContext } from '@/lib/reports/http';
import { localDay, reportPeriod, reportProvider, reportTzOffset } from '@/lib/reports/params';

export const dynamic = 'force-dynamic';

/** GET /api/reports/export — the reports (or the chosen sheets) as an Excel workbook built here. */
export async function GET(req: NextRequest) {
  const context = await reportContext(req);
  if (context instanceof NextResponse) return context;
  const { user, params } = context;

  const allowed = EXPORT_SHEETS.filter((sheet) => sheet !== 'utilization' || canSeeFundUtilization(user));
  const sheets = parseSheets(params.get('sheets'), allowed);
  const providerId = reportProvider(user, params.get('providerId'));
  const tzOffset = reportTzOffset(params);
  if (providerId === 'none') return NextResponse.json({ error: 'No data to export.' }, { status: 404 });

  try {
    const scope = await reportBorrowerScope(user, params);
    if (scope?.length === 0) {
      return NextResponse.json({ error: 'No data to export for the selected filters.' }, { status: 404 });
    }
    const providers = await prisma.loanProvider.findMany({
      where: providerId ? { id: providerId } : {},
      orderBy: { displayOrder: 'asc' },
      select: { id: true, name: true, startingCapital: true },
    });

    const workbook = await buildReportWorkbook(prisma, {
      sheets,
      providers,
      providerId,
      period: reportPeriod(params),
      search: params.get('search')?.trim() || undefined,
      tzOffset,
      scope,
      status: loanStatusFilter(params.get('status')),
      classification: agingClassFilter(params.get('class')),
      params,
    });
    if (workbook.worksheets.length === 0) {
      return NextResponse.json({ error: 'No data to export for the selected filters.' }, { status: 404 });
    }

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const filename = exportFileName(sheets, params.get('timeframe') || 'overall', localDay(new Date(), tzOffset));
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Failed to export reports:', error);
    return NextResponse.json({ error: 'Could not generate the Excel file.' }, { status: 500 });
  }
}
