import { requireServerPermission } from '@/lib/require-permission';
import { NewRoleClient } from './new-role-client';

export const dynamic = 'force-dynamic';

export default async function NewRolePage() {
    await requireServerPermission('access-control', 'create');

    return <NewRoleClient />;
}
