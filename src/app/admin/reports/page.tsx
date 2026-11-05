import { Suspense } from 'react';
import { ReportsClient } from '@/components/admin/reports/reports-client';
import type { LoanProvider as LoanProviderType } from '@/lib/types';
import prisma from '@/lib/prisma';
import { getUserFromSession } from '@/lib/user';
import { requireServerPermission } from '@/lib/require-permission';

export const dynamic = 'force-dynamic';

// What the screen reads of a provider. Not whole rows: the ~300 KB `icon` would
// be serialized into the page.
const PROVIDER_FIELDS = { id: true, name: true, displayOrder: true, colorHex: true, startingCapital: true } as const;

/** The providers a user may pick on the reports screen. */
async function getProviders(user: NonNullable<Awaited<ReturnType<typeof getUserFromSession>>>): Promise<LoanProviderType[]> {
    const isSuperAdminOrRecon = user.role === 'Super Admin' || user.role === 'Reconciliation';
    const everyProvider = async () =>
        (await prisma.loanProvider.findMany({ orderBy: { displayOrder: 'asc' }, select: PROVIDER_FIELDS })) as unknown as LoanProviderType[];
    if (isSuperAdminOrRecon) return everyProvider();

    if (user.loanProviderId) {
        const provider = await prisma.loanProvider.findUnique({ where: { id: user.loanProviderId }, select: PROVIDER_FIELDS });
        return provider ? ([provider] as unknown as LoanProviderType[]) : [];
    }

    // A user who can read reports but is not bound to a provider picks from all
    // of them (common for Auditor/Loan Manager).
    if (user.role !== 'Loan Provider') return everyProvider();

    return [];
}

export default async function AdminReportsPage() {
    await requireServerPermission('reports');
    const user = await getUserFromSession();
    if (!user) {
        return <div>Not authenticated</div>;
    }

    const providers = await getProviders(user);
    // The client reads the view from the URL (useSearchParams).
    return (
        <Suspense fallback={null}>
            <ReportsClient providers={providers} />
        </Suspense>
    );
}
