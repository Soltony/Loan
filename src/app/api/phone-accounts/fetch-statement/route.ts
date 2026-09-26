import { NextResponse } from 'next/server';
import { MiniAppAuthError, requireMiniAppAuthContext } from '@/lib/miniapp-auth';
import { refreshStatementFigures } from '@/lib/statement-figures';

/**
 * POST { phoneNumber, accountNumber }
 *
 * Makes sure the account's statement figures are at most a day old and returns them. This
 * normally runs in the background after /api/phone-accounts/fetch-customer; this route waits for
 * it instead, which can take minutes on the first statement fetch of the day. Only the figures
 * are stored (in the borrower's customer-info copy), never the transactions.
 */
export async function POST(req: Request) {
  try {
    const ctx = await requireMiniAppAuthContext();
    const { phoneNumber, accountNumber } = await req.json();
    if (!phoneNumber || !accountNumber) return NextResponse.json({ error: 'phoneNumber and accountNumber required' }, { status: 400 });

    if (String(phoneNumber) !== String(ctx.borrowerId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const result = await refreshStatementFigures(String(phoneNumber), String(accountNumber).trim());
    if (result.ok) {
      return NextResponse.json({ ok: true, [result.outcome]: true, figures: result.figures });
    }
    switch (result.reason) {
      case 'disabled':
        return NextResponse.json({ error: 'Statement fetching is switched off (STATEMENT_FIGURES_ENABLED).' }, { status: 503 });
      case 'no-customer-info':
        return NextResponse.json({ error: 'Fetch the customer info for this account first (/api/phone-accounts/fetch-customer).' }, { status: 409 });
      case 'account-changed':
        return NextResponse.json({ error: 'The active account changed while the statement was being fetched.' }, { status: 409 });
      case 'recent-failure':
        return NextResponse.json({ error: 'The last statement fetch for this account failed. Try again in 30 minutes.' }, { status: 503 });
      case 'busy':
        return NextResponse.json({ error: 'Too many statements are being fetched right now. Try again shortly.' }, { status: 503 });
      default:
        return NextResponse.json({ error: 'Upstream error', status: result.status, body: result.body }, { status: 502 });
    }
  } catch (err: any) {
    if (err instanceof MiniAppAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[phone-accounts][fetch-statement] error', err);
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 });
  }
}
