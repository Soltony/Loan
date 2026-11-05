

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { auditRequestContext, createAuditLog } from '@/lib/audit-log';

const safeParseJson = (jsonString: string, defaultValue: any = []) => {
    try {
        return JSON.parse(jsonString);
    } catch (e) {
        return defaultValue;
    }
}

export async function GET(req: NextRequest) {
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

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session?.userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    
    try {
        const body = await req.json();
        const { providerId, parameters, appliedProductIds } = body;
        
        const newHistory = await prisma.$transaction(async (tx) => {
            // Step 1: Create the main history record
            const historyRecord = await tx.scoringConfigurationHistory.create({
                data: {
                    providerId,
                    parameters: JSON.stringify(parameters),
                }
            });

            // Step 2: Create the join-table records for applied products
            if (appliedProductIds && appliedProductIds.length > 0) {
                await tx.scoringConfigurationProduct.createMany({
                    data: appliedProductIds.map((id: string) => ({
                        configId: historyRecord.id,
                        productId: id,
                        assignedBy: session.userId,
                    }))
                });
            }

            // Step 3: Fetch the complete record to return to the client
            return await tx.scoringConfigurationHistory.findUnique({
                where: { id: historyRecord.id },
                include: {
                    appliedProducts: {
                        select: {
                            product: {
                                select: {
                                    name: true,
                                },
                            },
                        },
                    },
                }
            });
        });

        // Format for consistency on the client
        const formattedHistory = {
            ...newHistory,
            parameters: parameters, // Return the object, not the string
        };

        // The parameters themselves are kept on the history record; the entry says who applied them where.
        await createAuditLog({
            actorId: session.userId,
            action: 'SCORING_HISTORY_SAVED',
            entity: 'ScoringConfigurationHistory',
            entityId: newHistory?.id,
            details: {
                providerId,
                appliedProductIds: appliedProductIds ?? [],
                parameterCount: Array.isArray(parameters) ? parameters.length : null,
            },
            ...auditRequestContext(req),
        });

        return NextResponse.json(formattedHistory, { status: 201 });
    } catch (error) {
        console.error('Error creating scoring history:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}


export async function DELETE(req: NextRequest) {
    const session = await getSession();
    if (!session?.userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
        return NextResponse.json({ error: 'History ID is required' }, { status: 400 });
    }
    
    try {
        const existing = await prisma.scoringConfigurationHistory.findUnique({
            where: { id },
            select: {
                providerId: true,
                savedAt: true,
                parameters: true,
                appliedProducts: { select: { productId: true } },
            },
        });

        // Use a transaction to delete the related products first, then the history item
        await prisma.$transaction(async (tx) => {
            await tx.scoringConfigurationProduct.deleteMany({
                where: { configId: id }
            });
            await tx.scoringConfigurationHistory.delete({
                where: { id },
            });
        });

        // The record is gone, so its parameters are kept here.
        await createAuditLog({
            actorId: session.userId,
            action: 'SCORING_HISTORY_DELETED',
            entity: 'ScoringConfigurationHistory',
            entityId: id,
            details: {
                providerId: existing?.providerId ?? null,
                savedAt: existing?.savedAt ?? null,
                appliedProductIds: existing?.appliedProducts.map((p) => p.productId) ?? [],
                parameters: existing ? safeParseJson(existing.parameters, []) : null,
            },
            ...auditRequestContext(req),
        });

        return NextResponse.json({ message: 'History record deleted successfully' });
    } catch (error) {
        console.error('Error deleting scoring history:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
