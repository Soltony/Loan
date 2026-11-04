import { NextRequest, NextResponse } from 'next/server';
import { getUserFromSession } from '@/lib/user';
import { hasPermission } from '@/lib/permissions';
import { createAuditLog } from '@/lib/audit-log';
import { previewStatementParameter } from '@/lib/statement-parameters';

/**
 * POST /api/settings/statement-parameters/preview  { definition, accountNumber }
 *
 * "Try it": computes a (not yet saved) statement parameter for one account and returns the value
 * with the transactions it matched. Shows customer transactions, so only people who may create or
 * change scoring settings can use it, and every use is written to the audit log.
 */
export async function POST(req: NextRequest) {
  const user = await getUserFromSession();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!hasPermission(user, 'scoring-engine', 'create') && !hasPermission(user, 'scoring-engine', 'update')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { definition, accountNumber } = await req.json();
    const account = String(accountNumber ?? '').trim();

    await createAuditLog({
      actorId: user.id,
      action: 'STATEMENT_PARAMETER_PREVIEW',
      entity: 'StatementParameter',
      details: { accountNumber: account, name: definition?.name ?? null },
    });

    const result = await previewStatementParameter(definition, account);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result);
  } catch (err) {
    console.error('[statement-parameters][preview] error', err);
    return NextResponse.json({ error: 'Could not compute the preview.' }, { status: 500 });
  }
}
