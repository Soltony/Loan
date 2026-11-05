

import { CreditScoreEngineClient, type PendingScoringChange } from '@/components/admin/credit-score-engine-client';
import prisma from '@/lib/prisma';
import type { LoanProvider, ScoringParameter } from '@/lib/types';
import { getUserFromSession } from '@/lib/user';
import { requireServerPermission } from '@/lib/require-permission';


async function getProviders(userId: string): Promise<LoanProvider[]> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { loanProvider: true }
    });

    const whereClause = (user?.role === 'Super Admin' || user?.role === 'Admin')
        ? {}
        : { id: user?.loanProvider?.id };

    const providers = await prisma.loanProvider.findMany({
        where: whereClause,
        include: {
            products: {
                // We need eligibilityUploadId to filter these out of the general uploads list,
                // and the tiers to warn when they stop below the highest possible score.
                select: {
                    id: true,
                    name: true,
                    status: true,
                    isSalaryAdvance: true,
                    eligibilityUploadId: true,
                    loanAmountTiers: { select: { fromScore: true, toScore: true } },
                }
            },
            dataProvisioningConfigs: {
                 include: {
                    uploads: {
                        orderBy: {
                            uploadedAt: 'desc'
                        }
                    }
                }
            }
        },
        orderBy: {
            displayOrder: 'asc'
        }
    });

    const safeJsonParse = (jsonString: string | null | undefined, defaultValue: any) => {
        if (!jsonString) return defaultValue;
        try {
            return JSON.parse(jsonString);
        } catch (e) {
            return defaultValue;
        }
    };
    
    // Casting here after ensuring the structure aligns.
    // The product data is partial but sufficient for the client component's needs.
    return providers.map(p => ({
        ...p,
        dataProvisioningConfigs: (p.dataProvisioningConfigs || []).map(config => ({
            ...config,
            columns: safeJsonParse(config.columns as string, [])
        }))
    })) as LoanProvider[];
}

async function getScoringParameters(providerIds: string[]): Promise<ScoringParameter[]> {
    const parameters = await prisma.scoringParameter.findMany({
        where: {
            providerId: {
                in: providerIds,
            }
        },
        include: {
            rules: true,
        },
    });
    return parameters as ScoringParameter[];
}

// Scoring changes awaiting approval, so the editor can say so instead of letting a second one in.
async function getPendingScoringChanges(providerIds: string[]): Promise<PendingScoringChange[]> {
    if (providerIds.length === 0) return [];
    const changes = await prisma.pendingChange.findMany({
        where: { entityType: 'ScoringRules', status: 'PENDING', entityId: { in: providerIds } },
        select: { id: true, entityId: true, createdAt: true, createdBy: { select: { fullName: true } } },
        orderBy: { createdAt: 'desc' },
    });
    return changes.map(change => ({
        id: change.id,
        providerId: change.entityId as string,
        createdAt: change.createdAt.toISOString(),
        submittedBy: change.createdBy?.fullName ?? null,
    }));
}

export default async function CreditScoreEnginePage() {
    await requireServerPermission('scoring-engine');
    // Session fetching will be replaced with a real auth solution
    const user = await getUserFromSession();
    
    if (!user?.id) {
        return <div>Not authenticated</div>;
    }

    const providers = await getProviders(user.id);
    const providerIds = providers.map(p => p.id);
    const [scoringParameters, pendingChanges] = await Promise.all([
        getScoringParameters(providerIds),
        getPendingScoringChanges(providerIds),
    ]);

    return (
        <CreditScoreEngineClient
            initialProviders={providers}
            initialScoringParameters={scoringParameters}
            initialPendingChanges={pendingChanges}
        />
    );
}
