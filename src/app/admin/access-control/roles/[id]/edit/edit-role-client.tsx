'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RoleForm } from '@/components/user/role-form';
import type { Role, LoanProvider } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';

export function EditRoleClient({ role }: { role: Role }) {
    const router = useRouter();
    const { toast } = useToast();
    const { currentUser } = useAuth();
    const [providers, setProviders] = useState<LoanProvider[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const canUpdate = !!currentUser?.permissions?.['access-control']?.update;

    useEffect(() => {
        fetch('/api/providers')
            .then((res) => (res.ok ? res.json() : []))
            .then(setProviders)
            .catch(() => {});
    }, []);

    const themeColor = React.useMemo(() => {
        if (currentUser?.role === 'Admin' || currentUser?.role === 'Super Admin') {
            return providers.find((p) => p.name === 'NIb Bank')?.colorHex || '#fdb913';
        }
        return providers.find((p) => p.name === currentUser?.providerName)?.colorHex || '#fdb913';
    }, [currentUser, providers]);

    const goBack = () => router.push('/admin/access-control');

    const handleSave = async (roleData: Omit<Role, 'id'>) => {
        if (!canUpdate) {
            toast({ title: 'Not authorized', description: 'Not authorized to perform this action.', variant: 'destructive' });
            return;
        }
        setIsSubmitting(true);
        try {
            const response = await fetch('/api/roles', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...roleData, id: role.id }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to save role.');
            }

            toast({
                title: 'Role Updated',
                description: `${roleData.name} has been successfully updated.`,
            });
            router.push('/admin/access-control');
            router.refresh();
        } catch (error: any) {
            toast({ title: 'Error', description: error.message, variant: 'destructive' });
            setIsSubmitting(false);
        }
    };

    return (
        <div className="flex-1 space-y-4 p-8 pt-6">
            <div className="flex items-center gap-4">
                <Button variant="outline" size="icon" onClick={goBack}>
                    <ArrowLeft className="h-4 w-4" />
                    <span className="sr-only">Back to Access Control</span>
                </Button>
                <h2 className="text-3xl font-bold tracking-tight">Edit Role</h2>
            </div>
            <Card>
                <CardHeader>
                    <CardTitle>{role.name}</CardTitle>
                    <CardDescription>
                        Update the role name and its permissions across the application.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <RoleForm
                        role={role}
                        primaryColor={themeColor}
                        isSubmitting={isSubmitting}
                        submitLabel="Save Changes"
                        onCancel={goBack}
                        onSave={handleSave}
                    />
                </CardContent>
            </Card>
        </div>
    );
}
