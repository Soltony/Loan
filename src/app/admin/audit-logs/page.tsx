
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRequirePermission } from '@/hooks/use-require-permission';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable, DateTimeCell, SearchInput, StatusBadge, type DataTableColumn, type StatusTone } from '@/components/admin/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileJson, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

interface AuditLog {
    id: string;
    actorId: string;
    actor?: { id: string; fullName: string; email: string } | null;
    action: string;
    entity: string | null;
    entityId: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
    createdAt: string;
    details?: string | null;
}

// (details page moved to its own route)

const ITEMS_PER_PAGE = 20;

export default function AuditLogsPage() {
    useRequirePermission('audit-logs');
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [pageSize, setPageSize] = useState(ITEMS_PER_PAGE);
    const [loadError, setLoadError] = useState<unknown>(null);
    const [reloadKey, setReloadKey] = useState(0);
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');

    // Filter / search state
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [actionFilter, setActionFilter] = useState('');
    const [entityFilter, setEntityFilter] = useState('');
    const [filterDateFrom, setFilterDateFrom] = useState('');
    const [filterDateTo, setFilterDateTo] = useState('');
    const [distinctActions, setDistinctActions] = useState<string[]>([]);
    const [distinctEntities, setDistinctEntities] = useState<string[]>([]);

    const router = useRouter();
    const { toast } = useToast();

    // Fetch distinct actions & entities for filter dropdowns
    useEffect(() => {
        const fetchMeta = async () => {
            try {
                const res = await fetch('/api/audit-logs?meta=1');
                if (res.ok) {
                    const data = await res.json();
                    setDistinctActions(data.actions || []);
                    setDistinctEntities(data.entities || []);
                }
            } catch { /* ignore */ }
        };
        fetchMeta();
    }, []);

    // Reset to page 1 when any filter changes
    const handleFilterChange = useCallback((setter: React.Dispatch<React.SetStateAction<string>>, value: string) => {
        setter(value);
        setPage(1);
    }, []);

    const clearFilters = () => {
        setDebouncedSearch('');
        setActionFilter('');
        setEntityFilter('');
        setFilterDateFrom('');
        setFilterDateTo('');
        setPage(1);
    };

    const hasActiveFilters = debouncedSearch || actionFilter || entityFilter || filterDateFrom || filterDateTo;

    const exportLogs = async (exportFormat: 'csv' | 'json') => {
        if (!fromDate || !toDate) {
            toast({ title: 'Missing dates', description: 'Please select From and To dates.', variant: 'destructive' });
            return;
        }

        const url = `/api/audit-logs/export?from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}&tz=${encodeURIComponent('Africa/Nairobi')}&format=${encodeURIComponent(exportFormat)}`;
        // Trigger browser download
        window.location.href = url;
    };

    useEffect(() => {
        const fetchLogs = async () => {
            setIsLoading(true);
            try {
                const params = new URLSearchParams({
                    page: String(page),
                    limit: String(pageSize),
                });
                if (debouncedSearch) params.set('search', debouncedSearch);
                if (actionFilter) params.set('action', actionFilter);
                if (entityFilter) params.set('entity', entityFilter);
                if (filterDateFrom) params.set('dateFrom', filterDateFrom);
                if (filterDateTo) params.set('dateTo', filterDateTo);

                const response = await fetch(`/api/audit-logs?${params.toString()}`);
                if (!response.ok) {
                    throw new Error('Failed to fetch audit logs.');
                }
                const data = await response.json();
                setLogs(data.logs);
                setTotalPages(data.totalPages);
                setTotal(data.total ?? data.logs.length);
                setLoadError(null);
            } catch (error: any) {
                setLoadError(error);
                toast({
                    title: 'Error',
                    description: error.message,
                    variant: 'destructive',
                });
            } finally {
                setIsLoading(false);
            }
        };

        fetchLogs();
    }, [page, pageSize, reloadKey, debouncedSearch, actionFilter, entityFilter, filterDateFrom, filterDateTo, toast]);

    // change request payload fetching moved to the dedicated detail page
    
    // Same reading as before: outcomes and creations green, failures and
    // deletions red, updates blue, logins amber.
    const actionTone = (action: string): StatusTone => {
        if (action.includes('SUCCESS') || action.includes('CREATE')) return 'success';
        if (action.includes('FAILURE') || action.includes('DELETE')) return 'danger';
        if (action.includes('UPDATE')) return 'info';
        if (action.includes('LOGIN')) return 'warning';
        return 'neutral';
    };

    const columns: DataTableColumn<AuditLog>[] = [
        {
            id: 'actor',
            header: 'Actor',
            cell: (log) => (
                <div className="flex flex-col">
                    <span className="text-sm font-medium">{log.actor?.fullName || 'Unknown user'}</span>
                    <span className="text-xs text-muted-foreground font-mono break-all">{log.actor?.email || log.actorId}</span>
                </div>
            ),
        },
        { id: 'action', header: 'Action', cell: (log) => <StatusBadge status={log.action} label={log.action} tone={actionTone(log.action)} /> },
        {
            id: 'entity',
            header: 'Entity',
            cell: (log) =>
                log.entity ? (
                    <div className="flex flex-col">
                        <span className="font-medium">{log.entity}</span>
                        <span className="text-xs text-muted-foreground font-mono">{log.entityId}</span>
                    </div>
                ) : (
                    <span className="text-muted-foreground">—</span>
                ),
        },
        { id: 'date', header: 'Date', cell: (log) => <DateTimeCell value={log.createdAt} /> },
        { id: 'ip', header: 'IP Address', className: 'font-mono text-xs', cell: (log) => log.ipAddress || 'N/A' },
        {
            id: 'details',
            header: 'Details',
            align: 'right',
            cell: (log) => (
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Open log entry"
                    onClick={() => router.push(`/admin/audit-logs/${log.id}`)}
                    className="h-8 w-8"
                >
                    <FileJson className="h-4 w-4" />
                </Button>
            ),
        },
    ];

    return (
        <>
            <div className="flex-1 space-y-4 p-8 pt-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-3xl font-bold tracking-tight">Audit Logs</h2>
                        <p className="text-muted-foreground">
                            A chronological record of system activities.
                        </p>
                    </div>
                    <div className="flex items-end gap-2">
                        <div className="flex flex-col gap-1">
                            <span className="text-xs text-muted-foreground">From</span>
                            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-[160px]" />
                        </div>
                        <div className="flex flex-col gap-1">
                            <span className="text-xs text-muted-foreground">To</span>
                            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-[160px]" />
                        </div>
                        <Button
                            variant="outline"
                            onClick={() => void exportLogs('csv')}
                            disabled={!fromDate || !toDate}
                        >
                            Export CSV
                        </Button>
                        <Button
                            variant="outline"
                            onClick={() => void exportLogs('json')}
                            disabled={!fromDate || !toDate}
                        >
                            Export JSON
                        </Button>
                    </div>
                </div>

                {/* ── Filter & Search Bar ── */}
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex flex-col gap-4 md:flex-row md:items-end">
                            {/* Search */}
                            <div className="flex-1 min-w-[200px]">
                                <label className="text-xs text-muted-foreground mb-1 block">Search</label>
                                <SearchInput
                                    label="Search audit logs"
                                    placeholder="Search by actor, action, entity, IP..."
                                    value={debouncedSearch}
                                    onChange={(value) => handleFilterChange(setDebouncedSearch, value)}
                                    className="max-w-none"
                                />
                            </div>

                            {/* Action filter */}
                            <div className="w-full md:w-[200px]">
                                <label className="text-xs text-muted-foreground mb-1 block">Action</label>
                                <Select value={actionFilter} onValueChange={(v) => handleFilterChange(setActionFilter, v)}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="All actions" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {distinctActions.map((a) => (
                                            <SelectItem key={a} value={a}>{a}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Entity filter */}
                            <div className="w-full md:w-[200px]">
                                <label className="text-xs text-muted-foreground mb-1 block">Entity</label>
                                <Select value={entityFilter} onValueChange={(v) => handleFilterChange(setEntityFilter, v)}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="All entities" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {distinctEntities.map((e) => (
                                            <SelectItem key={e} value={e}>{e}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Date range filter */}
                            <div className="w-full md:w-[160px]">
                                <label className="text-xs text-muted-foreground mb-1 block">From</label>
                                <Input
                                    type="date"
                                    value={filterDateFrom}
                                    onChange={(e) => handleFilterChange(setFilterDateFrom, e.target.value)}
                                />
                            </div>
                            <div className="w-full md:w-[160px]">
                                <label className="text-xs text-muted-foreground mb-1 block">To</label>
                                <Input
                                    type="date"
                                    value={filterDateTo}
                                    onChange={(e) => handleFilterChange(setFilterDateTo, e.target.value)}
                                />
                            </div>

                            {/* Clear filters */}
                            {hasActiveFilters && (
                                <Button variant="ghost" size="sm" onClick={clearFilters} className="h-10 gap-1">
                                    <X className="h-4 w-4" />
                                    Clear
                                </Button>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Activity History</CardTitle>
                        <CardDescription>
                            This log contains all significant actions performed by users and the system.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <DataTable
                            caption="Audit log"
                            columns={columns}
                            rows={logs}
                            rowKey={(log) => log.id}
                            isLoading={isLoading && logs.length === 0}
                            isFetching={isLoading}
                            error={loadError}
                            onRetry={() => setReloadKey((k) => k + 1)}
                            emptyMessage={hasActiveFilters ? 'No audit logs match the filters.' : 'No audit logs found.'}
                            onRowClick={(log) => router.push(`/admin/audit-logs/${log.id}`)}
                            maxHeight="65vh"
                            paging={{
                                page,
                                pageSize,
                                total,
                                totalPages: Math.max(1, totalPages),
                                onPageChange: setPage,
                                onPageSizeChange: (size) => {
                                    setPageSize(size);
                                    setPage(1);
                                },
                                pageSizes: [20, 50, 100],
                            }}
                        />
                    </CardContent>
                </Card>
            </div>
            {/* navigation to full detail page */}
        </>
    );
}
