
import type { LoanProvider, FeeRule, PenaltyRule, Tax } from '@/lib/types';
import { ApplyClient } from './client';
import prisma from '@/lib/prisma';
import { notFound } from 'next/navigation';
import { MiniAppShell } from '@/components/miniapp/shell';
import { forBorrower } from '@/lib/miniapp/payload';

const safeJsonParse = (jsonString: string | null | undefined, defaultValue: any) => {
    if (!jsonString) return defaultValue;
    try {
        return JSON.parse(jsonString);
    } catch (e) {
        return defaultValue;
    }
};

async function getProvider(providerId: string): Promise<LoanProvider | null> {
    const provider = await prisma.loanProvider.findUnique({
        where: { id: providerId },
        include: {
            products: {
                where: {
                    status: 'Active'
                },
                orderBy: {
                    name: 'asc'
                }
            }
        }
    });

    if (!provider) return null;

    // Icons are not drawn on this page, and uploaded ones are large inline images.
    return {
        id: provider.id,
        name: provider.name,
        icon: '',
        colorHex: provider.colorHex,
        displayOrder: provider.displayOrder,
        accountNumber: provider.accountNumber,
        startingCapital: provider.startingCapital,
        initialBalance: provider.initialBalance,
        allowCrossProviderLoans: provider.allowCrossProviderLoans,
        nplThresholdDays: provider.nplThresholdDays,
        products: provider.products.map(prod => ({
            ...forBorrower(prod),
            serviceFee: safeJsonParse(prod.serviceFee, { type: 'percentage', value: 0 }) as FeeRule,
            dailyFee: safeJsonParse(prod.dailyFee, { type: 'percentage', value: 0 }) as FeeRule,
            penaltyRules: safeJsonParse(prod.penaltyRules, []) as PenaltyRule[],
        }))
    } as LoanProvider;
}

async function getTaxConfigs(): Promise<Tax[] | null> {
    return await prisma.tax.findMany();
}


export default async function ApplyPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
    const sp = await searchParams;
    const rawProviderId = sp?.providerId;
    const providerId = Array.isArray(rawProviderId) ? rawProviderId[0] : rawProviderId;

    if (!providerId || typeof providerId !== 'string') {
        notFound();
    }
    
    const [selectedProvider, taxConfigs] = await Promise.all([
        getProvider(providerId),
        getTaxConfigs()
    ]);


    if (!selectedProvider) {
        return (
            <MiniAppShell title="Apply" backHref="/loan">
                <div className="flex flex-col items-center px-4 pt-16 text-center">
                    <h2 className="text-lg font-semibold">This lender is not available</h2>
                    <p className="mt-2 max-w-sm text-sm text-gray-500">
                        The lender you chose could not be found. It may no longer offer loans here.
                    </p>
                    <a
                        href="/loan"
                        className="mt-6 inline-flex h-11 items-center rounded-xl bg-brand px-5 text-sm font-semibold text-brand-fg"
                    >
                        Back to loans
                    </a>
                </div>
            </MiniAppShell>
        )
    }

    return <ApplyClient provider={selectedProvider} taxConfigs={taxConfigs} />;
}
