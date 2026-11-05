'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useRequirePermission } from '@/hooks/use-require-permission';
import { PlusCircle, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    DataTable,
    SearchInput,
    StatusBadge,
    useClientTable,
    type DataTableColumn,
    type SortValue,
} from '@/components/admin/data-table';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AddUserDialog } from '@/components/user/add-user-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { User, Role, LoanProvider, Permissions } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { allMenuItems, menuPermissionKey, permissionModuleLabel } from '@/lib/menu-items';

const PERMISSION_MODULES = allMenuItems.map(item => menuPermissionKey(item)).concat(['products']);
const ITEMS_PER_PAGE = 10;

const USER_SORTERS: Record<string, (user: User) => SortValue> = {
    name: (u) => u.fullName,
    email: (u) => u.email,
    role: (u) => u.role,
    provider: (u) => u.providerName,
    status: (u) => u.status,
};

const ROLE_SORTERS: Record<string, (role: Role) => SortValue> = {
    name: (r) => r.name,
};

/** Rows whose text contains every word of the search. */
function matchesSearch(search: string, ...fields: Array<string | null | undefined>): boolean {
    const haystack = fields.filter(Boolean).join(' ').toLowerCase();
    return search
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .every((word) => haystack.includes(word));
}


function UsersTab() {
    useRequirePermission('access-control');
    const [users, setUsers] = useState<User[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [roles, setRoles] = useState<Role[]>([]);
    const [providers, setProviders] = useState<LoanProvider[]>([]);
    const { currentUser } = useAuth();
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [search, setSearch] = useState('');
    const [loadError, setLoadError] = useState<unknown>(null);
    const { toast } = useToast();

    const canCreate = !!currentUser?.permissions?.['access-control']?.create;
    const canUpdate = !!currentUser?.permissions?.['access-control']?.update;
    
    const themeColor = React.useMemo(() => {
        if (currentUser?.role === 'Admin' || currentUser?.role === 'Super Admin') {
            return providers.find(p => p.name === 'NIb Bank')?.colorHex || '#fdb913';
        }
        return providers.find(p => p.name === currentUser?.providerName)?.colorHex || '#fdb913';
    }, [currentUser, providers]);

    const fetchInitialData = async () => {
        try {
            setIsLoading(true);
            const [usersResponse, rolesResponse, providersResponse] = await Promise.all([
                fetch('/api/users'),
                fetch('/api/roles'),
                fetch('/api/providers')
            ]);
            if (!usersResponse.ok) throw new Error('Failed to fetch users');
            if (!rolesResponse.ok) throw new Error('Failed to fetch roles');
            if (!providersResponse.ok) throw new Error('Failed to fetch providers');
            
            const usersData = await usersResponse.json();
            const rolesData = await rolesResponse.json();
            const providersData = await providersResponse.json();

            setUsers(usersData);
            setRoles(rolesData);
            setProviders(providersData);
            setLoadError(null);
        } catch (error) {
            setLoadError(error);
            toast({
                title: 'Error',
                description: 'Could not load initial data.',
                variant: 'destructive',
            });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchInitialData();
    }, []);

    const handleOpenDialog = (user: User | null = null) => {
        setEditingUser(user);
        setIsDialogOpen(true);
    };

    const handleCloseDialog = () => {
        setEditingUser(null);
        setIsDialogOpen(false);
    };

    const handleSaveUser = async (userData: Omit<User, 'id'> & { id?: string; password?: string }) => {
        if (editingUser && !canUpdate) {
            toast({ title: 'Not authorized', description: 'Not authorized to perform this action.', variant: 'destructive' });
            return;
        }
        if (!editingUser && !canCreate) {
            toast({ title: 'Not authorized', description: 'Not authorized to perform this action.', variant: 'destructive' });
            return;
        }
        const method = editingUser ? 'PUT' : 'POST';
        const endpoint = '/api/users';
        const body = JSON.stringify(editingUser ? { ...userData, id: editingUser.id } : userData);

        try {
            const response = await fetch(endpoint, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body,
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to save user.');
            }
            
            toast({
                title: `User ${editingUser ? 'Updated' : 'Added'}`,
                description: `${userData.fullName} has been successfully ${editingUser ? 'updated' : 'added'}.`,
            });
            fetchInitialData();
        } catch (error: any) {
            toast({
                title: 'Error',
                description: error.message,
                variant: 'destructive',
            });
        }
    };
    
    const handleToggleStatus = async (user: User) => {
        if (!canUpdate) {
            toast({ title: 'Not authorized', description: 'Not authorized to perform this action.', variant: 'destructive' });
            return;
        }
        const newStatus = user.status === 'Active' ? 'Inactive' : 'Active';
        try {
            const response = await fetch('/api/users', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: user.id, status: newStatus }),
            });
            
             if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to update status.');
            }
            
            toast({
                title: `User ${newStatus === 'Active' ? 'Activated' : 'Deactivated'}`,
                description: `${user.fullName}'s status has been changed to ${newStatus}.`,
            });
            fetchInitialData();
        } catch (error: any) {
             toast({
                title: 'Error',
                description: error.message,
                variant: 'destructive',
            });
        }
    };

    const filteredUsers = useMemo(
        () => users.filter((u) => matchesSearch(search, u.fullName, u.email, u.role, u.providerName, u.status)),
        [users, search],
    );
    const table = useClientTable(filteredUsers, { sorters: USER_SORTERS, pageSize: ITEMS_PER_PAGE });

    const columns: DataTableColumn<User>[] = [
        { id: 'name', header: 'Full Name', sortKey: 'name', className: 'font-medium', cell: (user) => user.fullName },
        { id: 'email', header: 'Email', sortKey: 'email', cell: (user) => user.email },
        {
            id: 'role',
            header: 'Role',
            sortKey: 'role',
            cell: (user) => {
                const isAdmin = user.role === 'Admin' || user.role === 'Super Admin';
                return (
                    <Badge variant={isAdmin ? 'default' : 'secondary'} style={isAdmin ? { backgroundColor: themeColor, color: 'white' } : {}}>
                        {user.role}
                    </Badge>
                );
            },
        },
        { id: 'provider', header: 'Provider', sortKey: 'provider', cell: (user) => user.providerName || '—' },
        {
            id: 'status',
            header: 'Status',
            sortKey: 'status',
            cell: (user) => <StatusBadge status={user.status} tone={user.status === 'Active' ? 'success' : 'danger'} />,
        },
        {
            id: 'actions',
            header: 'Actions',
            align: 'right',
            cell: (user) => (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => handleOpenDialog(user)} disabled={!canUpdate}>Edit</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleToggleStatus(user)} disabled={!canUpdate}>
                            {user.status === 'Active' ? 'Deactivate' : 'Activate'}
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            ),
        },
    ];

    return (
        <>
            <div className="flex items-center justify-between space-y-2 mb-4">
                <div/>
                {canCreate ? (
                    <Button onClick={() => handleOpenDialog()} style={{ backgroundColor: themeColor }} className="text-white">
                        <PlusCircle className="mr-2 h-4 w-4" /> Add User
                    </Button>
                ) : null}
            </div>
            <Card>
                <CardHeader>
                    <CardTitle>Users</CardTitle>
                    <CardDescription>Manage registered users and their roles.</CardDescription>
                </CardHeader>
                <CardContent>
                    <DataTable
                        caption="Users"
                        columns={columns}
                        rows={table.rows}
                        rowKey={(user) => user.id}
                        isLoading={isLoading && users.length === 0}
                        isFetching={isLoading}
                        error={loadError}
                        onRetry={() => void fetchInitialData()}
                        emptyMessage={search ? 'No users match your search.' : 'No users yet.'}
                        sort={table.sort}
                        onSortChange={table.onSortChange}
                        paging={table.paging}
                        toolbar={
                            <SearchInput
                                label="Search users"
                                placeholder="Search by name, email, role or provider..."
                                value={search}
                                onChange={(value) => {
                                    setSearch(value);
                                    table.resetPage();
                                }}
                            />
                        }
                    />
                </CardContent>
            </Card>
            <AddUserDialog
                isOpen={isDialogOpen}
                onClose={handleCloseDialog}
                onSave={handleSaveUser}
                user={editingUser}
                roles={roles}
                providers={providers}
                primaryColor={themeColor}
            />
        </>
    );
}

function RolesTab() {
    const [roles, setRoles] = useState<Role[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [providers, setProviders] = useState<LoanProvider[]>([]);
    const { currentUser } = useAuth();
    const [deletingRoleId, setDeletingRoleId] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [loadError, setLoadError] = useState<unknown>(null);
    const { toast } = useToast();
    const router = useRouter();

    const canCreate = !!currentUser?.permissions?.['access-control']?.create;
    const canUpdate = !!currentUser?.permissions?.['access-control']?.update;
    const canDelete = !!currentUser?.permissions?.['access-control']?.delete;

    const themeColor = React.useMemo(() => {
        if (currentUser?.role === 'Admin' || currentUser?.role === 'Super Admin') {
            return providers.find(p => p.name === 'NIb Bank')?.colorHex || '#fdb913';
        }
        return providers.find(p => p.name === currentUser?.providerName)?.colorHex || '#fdb913';
    }, [currentUser, providers]);

    const fetchRolesAndProviders = async () => {
        try {
            setIsLoading(true);
            const [rolesResponse, providersResponse] = await Promise.all([
                fetch('/api/roles'),
                fetch('/api/providers')
            ]);
            if (!rolesResponse.ok) throw new Error('Failed to fetch roles');
            if (!providersResponse.ok) throw new Error('Failed to fetch providers');
            const rolesData = await rolesResponse.json();
            const providersData = await providersResponse.json();
            setRoles(rolesData);
            setProviders(providersData);
            setLoadError(null);
        } catch (error) {
            setLoadError(error);
            toast({
                title: 'Error',
                description: 'Could not load role data.',
                variant: 'destructive',
            });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchRolesAndProviders();
    }, []);

    const handleDeleteRole = async () => {
        if (!deletingRoleId) return;
        if (!canDelete) {
            toast({ title: 'Not authorized', description: 'Not authorized to perform this action.', variant: 'destructive' });
            setDeletingRoleId(null);
            return;
        }
        try {
            const response = await fetch('/api/roles', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: deletingRoleId }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to delete role.');
            }
            
            toast({
                title: 'Role Deleted',
                description: 'The role has been successfully deleted.',
            });
            fetchRolesAndProviders();
        } catch (error: any) {
            toast({
                title: 'Error',
                description: error.message,
                variant: 'destructive',
            });
        } finally {
            setDeletingRoleId(null);
        }
    };
    
    const filteredRoles = useMemo(() => roles.filter((r) => matchesSearch(search, r.name)), [roles, search]);
    const table = useClientTable(filteredRoles, { sorters: ROLE_SORTERS, pageSize: ITEMS_PER_PAGE });

    const columns: DataTableColumn<Role>[] = [
        { id: 'name', header: 'Role Name', sortKey: 'name', className: 'font-medium min-w-[150px]', cell: (role) => role.name },
        ...PERMISSION_MODULES.map(
            (module): DataTableColumn<Role> => ({
                id: `perm-${module}`,
                header: <span className="capitalize">{permissionModuleLabel(module)}</span>,
                align: 'center',
                cell: (role) => {
                    const access = (role.permissions as Permissions)[module.toLowerCase()];
                    return (
                        <div className="flex justify-center items-center space-x-2">
                            <span title="Create" className={cn(access?.create ? 'text-green-500' : 'text-muted-foreground/30')}>C</span>
                            <span title="Read" className={cn(access?.read ? 'text-green-500' : 'text-muted-foreground/30')}>R</span>
                            <span title="Update" className={cn(access?.update ? 'text-green-500' : 'text-muted-foreground/30')}>U</span>
                            <span title="Delete" className={cn(access?.delete ? 'text-green-500' : 'text-muted-foreground/30')}>D</span>
                        </div>
                    );
                },
            }),
        ),
        {
            id: 'actions',
            header: 'Actions',
            align: 'right',
            cell: (role) => (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => router.push(`/admin/access-control/roles/${role.id}/edit`)} disabled={!canUpdate}>Edit</DropdownMenuItem>
                        <DropdownMenuItem className="text-red-600" onClick={() => setDeletingRoleId(role.id)} disabled={!canDelete}>Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            ),
        },
    ];

    return (
        <>
            <div className="flex items-center justify-between space-y-2 mb-4">
                <div />
                {canCreate ? (
                    <Button onClick={() => router.push('/admin/access-control/roles/new')} style={{ backgroundColor: themeColor }} className="text-white">
                        <PlusCircle className="mr-2 h-4 w-4" /> Add Role
                    </Button>
                ) : null}
            </div>
            <Card>
                <CardHeader>
                    <CardTitle>Roles</CardTitle>
                    <CardDescription>Define roles to control user access and permissions across the application.</CardDescription>
                </CardHeader>
                <CardContent>
                    <DataTable
                        caption="Roles"
                        columns={columns}
                        rows={table.rows}
                        rowKey={(role) => role.id}
                        isLoading={isLoading && roles.length === 0}
                        isFetching={isLoading}
                        error={loadError}
                        onRetry={() => void fetchRolesAndProviders()}
                        emptyMessage={search ? 'No roles match your search.' : 'No roles yet.'}
                        sort={table.sort}
                        onSortChange={table.onSortChange}
                        paging={table.paging}
                        toolbar={
                            <SearchInput
                                label="Search roles"
                                placeholder="Search roles..."
                                value={search}
                                onChange={(value) => {
                                    setSearch(value);
                                    table.resetPage();
                                }}
                            />
                        }
                    />
                </CardContent>
            </Card>
            <AlertDialog open={!!deletingRoleId} onOpenChange={(isOpen) => !isOpen && setDeletingRoleId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure you want to delete this role?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete the role and may affect users assigned to it.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteRole} style={{ backgroundColor: themeColor }} className="text-white" disabled={!canDelete}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

export default function AccessControlPage() {
    return (
        <div className="flex-1 space-y-4 p-8 pt-6">
            <h2 className="text-3xl font-bold tracking-tight">Access Control</h2>
            <Tabs defaultValue="users" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="users">Users</TabsTrigger>
                    <TabsTrigger value="roles">Roles</TabsTrigger>
                </TabsList>
                <TabsContent value="users">
                    <UsersTab />
                </TabsContent>
                <TabsContent value="roles">
                    <RolesTab />
                </TabsContent>
            </Tabs>
        </div>
    );
}
