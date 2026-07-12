import { NextResponse } from 'next/server';
import { MiniAppAuthError, requireMiniAppAuthContext } from '@/lib/miniapp-auth';
import { readTinForBorrower, writeTinForBorrower } from '@/lib/borrower-tin';

/**
 * GET /api/borrower-tin
 * Returns whether the authenticated borrower already has a TIN on file.
 * Response: { hasTin: boolean, tin: string | null }
 */
export async function GET() {
  try {
    const ctx = await requireMiniAppAuthContext();
    const tin = await readTinForBorrower(ctx.borrowerId);
    return NextResponse.json({ hasTin: Boolean(tin), tin: tin ?? null });
  } catch (err: any) {
    if (err instanceof MiniAppAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[borrower-tin][GET] error', err);
    return NextResponse.json({ error: 'Failed to check TIN Number.' }, { status: 500 });
  }
}

/**
 * POST /api/borrower-tin  { tin: string, providerId?: string }
 * Saves the TIN for the authenticated borrower (merged into ProvisionedData.data JSON).
 */
export async function POST(req: Request) {
  try {
    const ctx = await requireMiniAppAuthContext();
    const body = await req.json().catch(() => ({}));

    const rawTin = body?.tin;
    if (rawTin === null || rawTin === undefined || String(rawTin).trim() === '') {
      return NextResponse.json({ error: 'TIN Number is required.' }, { status: 400 });
    }

    const providerId =
      body?.providerId && String(body.providerId).trim() !== '' ? String(body.providerId) : null;

    const { tin } = await writeTinForBorrower(ctx.borrowerId, String(rawTin), providerId);
    return NextResponse.json({ ok: true, tin });
  } catch (err: any) {
    if (err instanceof MiniAppAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[borrower-tin][POST] error', err);
    return NextResponse.json({ error: String(err?.message ?? 'Failed to save TIN Number.') }, { status: 500 });
  }
}
