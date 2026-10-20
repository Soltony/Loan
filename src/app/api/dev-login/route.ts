import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createLegacySession } from '@/lib/session';

/**
 * TEST ONLY: open the mini-app as any phone number, without the super app.
 *
 *   GET /api/dev-login?phone=251911223344
 *   GET /api/dev-login?phone=251911223344&account=7000101737506
 *
 * Works only under `npm run dev` (NODE_ENV is not "production") AND with MINIAPP_TEST_LOGIN=true
 * in .env; otherwise it answers 404. It sets the same `session` cookie as /api/auth/connect and
 * opens /loan for that phone. `account` links that bank account to the phone and makes it the
 * active one, for when the get-accounts service is unreachable.
 *
 * The super-app token in the session is a placeholder, so anything that calls the super app
 * itself will fail.
 */
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === 'production' || process.env.MINIAPP_TEST_LOGIN !== 'true') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const phone = req.nextUrl.searchParams.get('phone')?.trim() ?? '';
  const account = req.nextUrl.searchParams.get('account')?.trim() ?? '';
  if (!/^\d{9,15}$/.test(phone)) {
    return NextResponse.json({ error: 'Pass ?phone= with digits only, e.g. ?phone=251911223344' }, { status: 400 });
  }
  if (account && !/^\d{1,19}$/.test(account)) {
    return NextResponse.json({ error: 'account must contain digits only' }, { status: 400 });
  }

  console.warn(`[dev-login] TEST LOGIN as ${phone}${account ? ` with account ${account}` : ''}`);

  if (account) {
    await prisma.$transaction([
      prisma.phoneAccount.updateMany({ where: { phoneNumber: phone }, data: { isActive: false } }),
      prisma.phoneAccount.upsert({
        where: { phoneNumber_accountNumber: { phoneNumber: phone, accountNumber: account } },
        create: { phoneNumber: phone, accountNumber: account, isActive: true },
        update: { isActive: true },
      }),
    ]);
  }

  await createLegacySession(phone, 'dev-login-test-token');
  return NextResponse.redirect(new URL(`/loan?borrowerId=${encodeURIComponent(phone)}`, req.nextUrl.origin));
}
