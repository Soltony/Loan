import { SettingsClient } from '@/components/admin/settings-client';
import { requireServerPermission } from '@/lib/require-permission';
import type { LoanProvider as LoanProviderType, Tax } from '@/lib/types';
import prisma from '@/lib/prisma';
import { getUserFromSession } from '@/lib/user';
import { getSettingsPendingState } from '@/lib/settings-pending';

const safeJsonParse = (jsonString: string | null | undefined, defaultValue: any) => {
    if (!jsonString) return defaultValue;
    try {
        return JSON.parse(jsonString);
    } catch {
        return defaultValue;
    }
};

// Staff tied to a provider see only that provider. Bank-level staff (no
// provider link, e.g. Super Admin and the Maker role) see every provider.
async function getProviders(loanProviderId: string | null | undefined): Promise<LoanProviderType[]> {
    const providers = await prisma.loanProvider.findMany({
        where: loanProviderId ? { id: loanProviderId } : {},
        include: {
            products: {
                include: {
                    loanAmountTiers: true,
                    // Metadata only: the tab shows who uploaded the list and when.
                    eligibilityUpload: {
                        select: { id: true, configId: true, fileName: true, rowCount: true, uploadedBy: true, uploadedAt: true },
                    },
                },
                orderBy: { name: 'asc' }
            },
            // The Eligibility tab only needs each data source's name and columns,
            // not its upload history.
            dataProvisioningConfigs: {
                select: { id: true, providerId: true, name: true, columns: true },
            },
        },
        orderBy: {
            displayOrder: 'asc'
        }
    });

    return providers.map(p => ({
        ...p,
        dataProvisioningConfigs: p.dataProvisioningConfigs.map(c => ({
            ...c,
            columns: safeJsonParse(c.columns, []),
        })),
        // Settings never shows product icons, and a custom icon is a ~300 KB
        // data URL per product, so leave it out of the page payload.
        products: p.products.map(prod => ({
            ...prod,
            icon: '',
            serviceFee: safeJsonParse(prod.serviceFee, { type: 'percentage', value: 0 }),
            dailyFee: safeJsonParse(prod.dailyFee, { type: 'percentage', value: 0 }),
            penaltyRules: safeJsonParse(prod.penaltyRules, []),
        }))
    })) as unknown as LoanProviderType[];
}

// Every fee calculation applies all tax rows, so show all of them.
async function getTaxConfigs(): Promise<Tax[]> {
    const taxes = await prisma.tax.findMany({ orderBy: { name: 'asc' } });
    return taxes.map(t => ({ ...t, appliedTo: t.appliedTo || '[]' }));
}

export default async function AdminSettingsPage() {
    await requireServerPermission('settings');
    const user = await getUserFromSession();
    if (!user) {
        return <div>Not authenticated</div>;
    }
    const [providers, taxConfigs, pending] = await Promise.all([
        getProviders(user.loanProviderId),
        getTaxConfigs(),
        getSettingsPendingState(),
    ]);

    return <SettingsClient initialProviders={providers} initialTaxConfigs={taxConfigs} initialPending={pending} />;
}
