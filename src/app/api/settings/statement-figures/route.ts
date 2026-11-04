import { NextRequest, NextResponse } from 'next/server';
import { getUserFromSession } from '@/lib/user';
import { hasPermission } from '@/lib/permissions';
import { createAuditLog } from '@/lib/audit-log';
import { openingBalanceWanted } from '@/lib/customer-data-api';
import { lookupStatementFigures } from '@/lib/statement-figures-lookup';

/**
 * GET /api/settings/statement-figures?q=<account number or phone number>
 *
 * The statement figures saved for an account (or every account of a phone), as scoring sees them.
 * Reads only what is saved; never fetches. Shows customer financial figures, so only people who may
 * create or change scoring settings can use it, and every lookup is written to the audit log.
 */
export async function GET(req: NextRequest) {
  const user = await getUserFromSession();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!hasPermission(user, 'scoring-engine', 'create') && !hasPermission(user, 'scoring-engine', 'update')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let q = (req.nextUrl.searchParams.get('q') ?? '').replace(/\s+/g, '');
  if (/^0?9\d{8}$/.test(q)) q = `251${q.slice(-9)}`; // 0911223344 -> 251911223344
  if (!/^\d{6,19}$/.test(q)) {
    return NextResponse.json({ error: 'Enter an account number or a phone number, digits only.' }, { status: 400 });
  }

  try {
    await createAuditLog({
      actorId: user.id,
      action: 'STATEMENT_FIGURES_VIEWED',
      entity: 'StatementFigures',
      details: { query: q },
    });
    const results = await lookupStatementFigures(q);
    return NextResponse.json({ query: q, results, withoutBalances: !openingBalanceWanted() });
  } catch (err) {
    console.error('[statement-figures][lookup] error', err);
    return NextResponse.json({ error: 'Could not look up the figures.' }, { status: 500 });
  }
}
