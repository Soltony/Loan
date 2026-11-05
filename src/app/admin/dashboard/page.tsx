import { DashboardClient } from '@/components/admin/dashboard-client';
import { parseBranchCodeQueryParam } from '@/lib/branch-filter';
import { getDashboardData, parseDashboardDay, parseDashboardPeriod } from '@/lib/dashboard-data';
import { getUserFromSession } from '@/lib/user';

export const dynamic = 'force-dynamic';

export default async function AdminDashboard({
    searchParams,
}: {
    searchParams?: Promise<{ branch?: string; month?: string; year?: string; day?: string }>;
}) {
    const user = await getUserFromSession();
    if (!user) {
        return <div>Not authenticated</div>;
    }

    const sp = (await searchParams) ?? {};
    const requestedBranch = parseBranchCodeQueryParam(sp.branch);
    const range = parseDashboardPeriod(sp.month, sp.year);
    const day = parseDashboardDay(sp.day);

    const data = await getDashboardData(user.id, requestedBranch, range, day);
    if (!data) {
        return <div>Loading dashboard...</div>;
    }

    return <DashboardClient dashboardData={data} />;
}
