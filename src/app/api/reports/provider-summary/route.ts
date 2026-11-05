import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { reportBorrowerScope, reportContext, serverError } from '@/lib/reports/http';
import { reportPeriod } from '@/lib/reports/params';
import { providerSummary } from '@/lib/reports/provider-summary';

export const dynamic = 'force-dynamic';

/** GET /api/reports/provider-summary — disbursed, collected, utilization and aging of one provider. */
export async function GET(req: NextRequest) {
  const context = await reportContext(req);
  if (context instanceof NextResponse) return context;
  const { user, params } = context;

  const providerId = params.get('providerId');
  if (!providerId || providerId === 'all' || providerId === 'none') {
    return NextResponse.json({ error: 'Provider ID is required' }, { status: 400 });
  }
  // A user tied to a provider sees only that provider's figures.
  if (user.loanProviderId && user.loanProviderId !== providerId) {
    return NextResponse.json(
      { error: 'Forbidden: You can only access reports for your own provider.' },
      { status: 403 },
    );
  }

  try {
    const scope = await reportBorrowerScope(user, params);
    return NextResponse.json(await providerSummary(prisma, providerId, reportPeriod(params), scope));
  } catch (error) {
    return serverError('provider summary', error);
  }
}
