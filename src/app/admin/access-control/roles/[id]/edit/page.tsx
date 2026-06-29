import { notFound } from 'next/navigation';
import { requireServerPermission } from '@/lib/require-permission';
import prisma from '@/lib/prisma';
import { EditRoleClient } from './edit-role-client';
import type { Role } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface PageProps {
    params: Promise<{ id: string }>;
}

async function getRole(id: string): Promise<Role | null> {
    const role = await prisma.role.findUnique({ where: { id } });
    if (!role) {
        return null;
    }
    return {
        ...role,
        permissions: JSON.parse(role.permissions),
    };
}

export default async function EditRolePage({ params }: PageProps) {
    await requireServerPermission('access-control', 'update');

    const { id } = await params;
    const role = await getRole(id);

    if (!role) {
        notFound();
    }

    return <EditRoleClient role={role} />;
}
