import { NextRequest, NextResponse } from 'next/server';
import { getUserFromSession } from '@/lib/user';
import { hasPermission } from '@/lib/permissions';
import { createAuditLog } from '@/lib/audit-log';
import {
  DATA_FETCH_LIMITS,
  loadDataFetchSettings,
  saveDataFetchSettings,
  validateDataFetchSettings,
} from '@/lib/data-fetch-settings';

/**
 * GET/PUT /api/settings/data-fetch
 *
 * How customer data is fetched: months of statement, how often statements and customer info are
 * fetched again, and how old figures may be before scoring stops using them. Saved directly (like
 * the disbursement control) with the scoring-engine permission, and written to the audit log.
 */
export async function GET() {
  const user = await getUserFromSession();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!hasPermission(user, 'scoring-engine', 'read')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return NextResponse.json({ settings: await loadDataFetchSettings(), limits: DATA_FETCH_LIMITS });
}

export async function PUT(req: NextRequest) {
  const user = await getUserFromSession();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!hasPermission(user, 'scoring-engine', 'update')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const checked = validateDataFetchSettings(await req.json());
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });

    const before = await loadDataFetchSettings();
    const settings = await saveDataFetchSettings(checked.settings, user.id);

    await createAuditLog({
      actorId: user.id,
      action: 'DATA_FETCH_SETTINGS_UPDATED',
      entity: 'DataFetchSetting',
      entityId: 'global',
      details: { before, after: settings },
      ipAddress: req.headers.get('x-forwarded-for') || 'N/A',
      userAgent: req.headers.get('user-agent') || 'N/A',
    });

    return NextResponse.json({ settings });
  } catch (err) {
    console.error('[settings][data-fetch] error', err);
    return NextResponse.json({ error: 'Could not save the settings.' }, { status: 500 });
  }
}
