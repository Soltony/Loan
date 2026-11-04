import { NextResponse } from 'next/server';
import { MiniAppAuthError, requireMiniAppAuthContext } from '@/lib/miniapp-auth';
import { borrowerDataInProgress, storedDataStamps, within } from '@/lib/borrower-data-sync';

// While data is being fetched, one call waits this long for it to land before answering.
const WAIT_MS = 20_000;

/**
 * GET ?accountNumber=
 *
 * For the signed-in borrower's account: { busy, customerInfoFetchedAt, figuresComputedAt }.
 * busy = customer info or statement figures are still being fetched (see borrower-data-sync.ts).
 * While busy, the call waits up to 20 s for them to land, so the dashboard asks about three times a
 * minute rather than polling; when a stamp changes, scoring has new data and the limit is redone.
 */
export async function GET(req: Request) {
  try {
    const ctx = await requireMiniAppAuthContext();
    const accountNumber = new URL(req.url).searchParams.get('accountNumber')?.trim();
    if (!accountNumber) {
      return NextResponse.json({ error: 'accountNumber required' }, { status: 400 });
    }
    const borrowerId = String(ctx.borrowerId);

    const work = borrowerDataInProgress(borrowerId, accountNumber);
    if (work) await within(work.catch(() => undefined), WAIT_MS);

    return NextResponse.json(
      {
        busy: borrowerDataInProgress(borrowerId, accountNumber) !== null,
        ...(await storedDataStamps(borrowerId, accountNumber)),
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err: any) {
    if (err instanceof MiniAppAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[phone-accounts][data-status] error', err);
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 });
  }
}
