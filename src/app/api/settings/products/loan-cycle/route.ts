import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getUserFromSession } from '@/lib/user';
import { hasPermissionForEntity } from '@/lib/permissions';

// Read by the Settings Loan Cycle tab only (loan checks read the table
// directly), so it needs a staff session like the rest of Settings.
export async function GET(req: NextRequest) {
  const user = await getUserFromSession();
  if (!user?.id) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!hasPermissionForEntity(user, 'LoanCycleConfig', 'read')) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const productId = searchParams.get('productId');
  if (!productId) return NextResponse.json({ error: 'productId is required' }, { status: 400 });

  if (user.loanProviderId) {
    const product = await prisma.loanProduct.findUnique({ where: { id: productId }, select: { providerId: true } });
    if (product?.providerId !== user.loanProviderId) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const config = await prisma.loanCycleConfig.findUnique({ where: { productId } });
  return NextResponse.json(config);
}
