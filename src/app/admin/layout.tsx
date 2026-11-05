import { AdminProviders } from '@/app/admin/admin-providers';
import { ProtectedLayout } from '@/components/admin/protected-layout';
import type { LoanProvider as LoanProviderType } from '@/lib/types';
import { getUserFromSession } from '@/lib/user';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * The providers the admin shell needs (it reads their name and brand colour).
 * Not whole rows: a provider's `icon` is a ~300 KB data URL, and these props are
 * serialized into every admin page the user opens.
 */
async function getProviders(): Promise<LoanProviderType[]> {
    const providers = await prisma.loanProvider.findMany({
        orderBy: {
            displayOrder: 'asc'
        },
        select: { id: true, name: true, colorHex: true, displayOrder: true },
    });
    return providers as unknown as LoanProviderType[];
}

export default async function AdminLayout({children}: {children: React.ReactNode}) {
  const providers = await getProviders();
  const user = await getUserFromSession();
  
  return (
    <AdminProviders initialUser={user}>
        <ProtectedLayout providers={providers}>
            {children}
        </ProtectedLayout>
    </AdminProviders>
  );
}
