'use client';

import { AuthProvider } from '@/hooks/use-auth';
import type { AuthenticatedUser } from '@/hooks/use-auth';
import { ReportExportProvider } from '@/components/admin/report-export-provider';

interface AdminProvidersProps {
    children: React.ReactNode;
    initialUser: AuthenticatedUser | null;
}

export function AdminProviders({ children, initialUser }: AdminProvidersProps) {
    return (
        <AuthProvider initialUser={initialUser}>
            <ReportExportProvider>
                {children}
            </ReportExportProvider>
        </AuthProvider>
    );
}
