
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import prisma from '@/lib/prisma';
import type { User as PrismaUser, Role as PrismaRole, LoanProvider as PrismaLoanProvider } from '@prisma/client';
import type { User as AuthUser, Permissions } from '@/lib/types';
import { parseManagedBranchCodes } from '@/lib/branch-filter';


export async function GET(req: NextRequest) {
  try {
    const session = await getSession();

    if (!session?.userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      include: {
        role: true,
        loanProvider: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Exclude the raw (string) managedBranchCodes from the spread so it does not
    // clash with the parsed number[] shape on the AuthUser type.
    const { password, managedBranchCodes: _rawManagedBranchCodes, ...userWithoutPassword } = user;

    const authUser: AuthUser = {
      ...userWithoutPassword,
      role: user.role.name as AuthUser['role'],
      providerName: user.loanProvider?.name,
      permissions: JSON.parse(user.role.permissions as string) as Permissions,
      managedBranchCodes: parseManagedBranchCodes(user.managedBranchCodes),
    };


    return NextResponse.json(authUser, { status: 200 });

  } catch (error) {
    console.error('Get User Error:', error);
    return NextResponse.json({ error: 'An internal server error occurred.' }, { status: 500 });
  }
}
