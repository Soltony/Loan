import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getUserFromSession } from '@/lib/user';
import { hasPermissionForEntity } from '@/lib/permissions';

// History records are written only when a checker approves a ScoringRules change
// (see the ScoringRules case in /api/approvals), so this route is read-only.

const safeParseJson = (jsonString: string, defaultValue: any = []) => {
    try {
        return JSON.parse(jsonString);
    } catch (e) {
        return defaultValue;
    }
}

export async function GET(req: NextRequest) {
    // /api/scoring-history is outside the proxy's protected prefixes, so the route checks itself.
    const user = await getUserFromSession();
    if (!user?.id) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const canView = (['read', 'create', 'update'] as const).some((action) => hasPermissionForEntity(user, 'ScoringRules', action));
    if (!canView) {
        return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const providerId = searchParams.get('providerId');

    if (!providerId) {
        return NextResponse.json({ error: 'Provider ID is required' }, { status: 400 });
    }

    try {
        const history = await prisma.scoringConfigurationHistory.findMany({
            where: { providerId },
            orderBy: { savedAt: 'desc' },
            include: {
                appliedProducts: {
                    select: {
                        product: {
                            select: {
                                name: true
                            }
                        }
                    }
                }
            }
        });

        const formattedHistory = history.map(item => ({
            ...item,
            parameters: safeParseJson(item.parameters, []),
        }));

        return NextResponse.json(formattedHistory);
    } catch (error) {
        console.error('Error fetching scoring history:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
