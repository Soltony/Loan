import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getUserFromSession } from '@/lib/user';
import { hasPermissionForEntity } from '@/lib/permissions';

// GET the latest active T&C for a provider. Only the Settings Agreement tab
// calls this (borrower pages read the table on the server), so it needs a
// staff session.
export async function GET(req: NextRequest) {
    const user = await getUserFromSession();
    if (!user?.id) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    if (!hasPermissionForEntity(user, 'TermsAndConditions', 'read')) {
        return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const providerId = searchParams.get('providerId');

    if (!providerId) {
        return NextResponse.json({ error: 'Provider ID is required' }, { status: 400 });
    }
    if (user.loanProviderId && user.loanProviderId !== providerId) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    try {
        const terms = await prisma.termsAndConditions.findFirst({
            where: {
                providerId: providerId,
                isActive: true,
            },
            orderBy: {
                version: 'desc',
            },
        });

        return NextResponse.json(terms);
    } catch (error) {
        console.error('Error fetching terms and conditions:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
