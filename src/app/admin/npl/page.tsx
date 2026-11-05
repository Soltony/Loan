
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRequirePermission } from '@/hooks/use-require-permission';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    DataTable,
    Money,
    SearchInput,
    formatMoney,
    useClientTable,
    type DataTableColumn,
    type SortValue,
} from '@/components/admin/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatTile } from '@/components/ui/stat-tile';
import { Loader2, RefreshCw, Download, Users, Banknote, Landmark, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { updateNplStatus } from '@/actions/npl';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuth } from '@/hooks/use-auth';
import { branchLabel } from '@/lib/branches';
import { format } from 'date-fns';
import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

interface NplEntry {
    borrowerId: string;
    borrowerName: string;
    accountNumber: string;
    providerName: string;
    daysOverdue: number;
    principalOutstanding: number;
    interestOutstanding: number;
    serviceFeeOutstanding: number;
    penaltyOutstanding: number;
    totalOutstanding: number;
}

interface Provider {
    id: string;
    name: string;
}

/** How each sortable column reads its value. */
const NPL_SORTERS: Record<string, (entry: NplEntry) => SortValue> = {
    borrowerId: (e) => e.borrowerId,
    borrowerName: (e) => e.borrowerName,
    accountNumber: (e) => e.accountNumber,
    providerName: (e) => e.providerName,
    daysOverdue: (e) => e.daysOverdue,
    principalOutstanding: (e) => e.principalOutstanding,
    interestOutstanding: (e) => e.interestOutstanding,
    serviceFeeOutstanding: (e) => e.serviceFeeOutstanding,
    penaltyOutstanding: (e) => e.penaltyOutstanding,
    totalOutstanding: (e) => e.totalOutstanding,
};

export default function NplManagementPage() {
    useRequirePermission('npl');
    const { canModule } = usePermissions();
    const canRunNplUpdate = canModule('npl', 'update');
    const { currentUser } = useAuth();
    const isDistrictUser = currentUser?.role === 'District';
    const managedBranchCodes = currentUser?.managedBranchCodes ?? [];
    const [branchFilter, setBranchFilter] = useState('all');

    const [entries, setEntries] = useState<NplEntry[]>([]);
    const [providers, setProviders] = useState<Provider[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isUpdating, setIsUpdating] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [loadError, setLoadError] = useState<unknown>(null);
    const { toast } = useToast();

    // Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [providerFilter, setProviderFilter] = useState('all');
    const [daysOverdueMin, setDaysOverdueMin] = useState('');
    const [daysOverdueMax, setDaysOverdueMax] = useState('');

    const fetchBorrowers = async () => {
        setIsLoading(true);
        try {
            const nplUrl = branchFilter !== 'all'
                ? `/api/npl-borrowers?branchCode=${encodeURIComponent(branchFilter)}`
                : '/api/npl-borrowers';
            const response = await fetch(nplUrl);
            if (!response.ok) throw new Error('Failed to fetch NPL borrowers');
            const data = await response.json();
            setEntries(data);
            setLoadError(null);

            // Extract unique providers for filter
            const responseProviders = await fetch('/api/providers');
            if (responseProviders.ok) {
                const providersData = await responseProviders.json();
                setProviders(providersData);
            }
        } catch (error) {
            setLoadError(new Error('Could not load NPL data.'));
            toast({
                title: 'Error',
                description: 'Could not load NPL data.',
                variant: 'destructive',
            });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchBorrowers();
        // Re-fetch when a District user switches the branch filter.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [branchFilter]);

    const handleRunNplUpdate = async () => {
        if (!canRunNplUpdate) {
            toast({ title: 'Not authorized', description: 'You are not authorized to run NPL updates.', variant: 'destructive' });
            return;
        }
        setIsUpdating(true);
        try {
            const result = await updateNplStatus();
            if (result.success) {
                toast({
                    title: 'NPL Status Updated',
                    description: `${result.updatedCount} borrower(s) have been updated.`,
                });
                await fetchBorrowers(); // Refresh the list
            } else {
                throw new Error(result.message);
            }
        } catch (error: any) {
            toast({
                title: 'Error Running NPL Update',
                description: error.message,
                variant: 'destructive',
            });
        } finally {
            setIsUpdating(false);
        }
    };

    const filteredEntries = useMemo(() => {
        return entries.filter(entry => {
            const matchesSearch = 
                entry.borrowerId.toLowerCase().includes(searchQuery.toLowerCase()) ||
                entry.borrowerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                entry.accountNumber.toLowerCase().includes(searchQuery.toLowerCase());
            
            const matchesProvider = providerFilter === 'all' || entry.providerName === providerFilter;
            
            const min = daysOverdueMin === '' ? -Infinity : parseInt(daysOverdueMin);
            const max = daysOverdueMax === '' ? Infinity : parseInt(daysOverdueMax);
            const matchesDays = entry.daysOverdue >= min && entry.daysOverdue <= max;

            return matchesSearch && matchesProvider && matchesDays;
        });
    }, [entries, searchQuery, providerFilter, daysOverdueMin, daysOverdueMax]);

    const table = useClientTable(filteredEntries, {
        sorters: NPL_SORTERS,
        initialSort: { by: 'daysOverdue', dir: 'desc' },
        pageSize: 50,
    });
    const sortedEntries = table.sortedRows;

    // Headline figures for the rows currently in view, so the cards always
    // describe what the table below is showing.
    const summary = useMemo(() => {
        const totals = filteredEntries.reduce(
            (acc, entry) => {
                acc.principal += entry.principalOutstanding;
                acc.interest += entry.interestOutstanding;
                acc.serviceFee += entry.serviceFeeOutstanding;
                acc.penalty += entry.penaltyOutstanding;
                acc.total += entry.totalOutstanding;
                acc.overdueDays += entry.daysOverdue;
                acc.maxOverdue = Math.max(acc.maxOverdue, entry.daysOverdue);
                return acc;
            },
            { principal: 0, interest: 0, serviceFee: 0, penalty: 0, total: 0, overdueDays: 0, maxOverdue: 0 },
        );
        const count = filteredEntries.length;
        return {
            ...totals,
            count,
            charges: totals.interest + totals.serviceFee + totals.penalty,
            avgOverdue: count > 0 ? Math.round(totals.overdueDays / count) : 0,
            providerCount: new Set(filteredEntries.map((e) => e.providerName)).size,
        };
    }, [filteredEntries]);

    const isFiltered = filteredEntries.length !== entries.length;

    const columns: DataTableColumn<NplEntry>[] = [
        { id: 'borrowerId', header: 'Borrower ID', sortKey: 'borrowerId', className: 'font-mono text-xs', cell: (e) => e.borrowerId },
        { id: 'borrowerName', header: 'Customer Name', sortKey: 'borrowerName', className: 'font-medium', cell: (e) => e.borrowerName },
        { id: 'accountNumber', header: 'Account Number', sortKey: 'accountNumber', className: 'font-mono', cell: (e) => e.accountNumber },
        { id: 'providerName', header: 'Loan Provider', sortKey: 'providerName', cell: (e) => e.providerName },
        {
            id: 'daysOverdue',
            header: 'Days Overdue',
            sortKey: 'daysOverdue',
            align: 'right',
            className: 'tabular-nums',
            cell: (e) => e.daysOverdue.toLocaleString(),
        },
        {
            id: 'principal',
            header: 'Principal Outstanding',
            sortKey: 'principalOutstanding',
            align: 'right',
            cell: (e) => <Money value={e.principalOutstanding} />,
            footer: <Money value={summary.principal} bold />,
        },
        {
            id: 'interest',
            header: 'Interest Outstanding',
            sortKey: 'interestOutstanding',
            align: 'right',
            cell: (e) => <Money value={e.interestOutstanding} />,
            footer: <Money value={summary.interest} bold />,
        },
        {
            id: 'serviceFee',
            header: 'Service Fee Outstanding',
            sortKey: 'serviceFeeOutstanding',
            align: 'right',
            cell: (e) => <Money value={e.serviceFeeOutstanding} />,
            footer: <Money value={summary.serviceFee} bold />,
        },
        {
            id: 'penalty',
            header: 'Penalty Outstanding',
            sortKey: 'penaltyOutstanding',
            align: 'right',
            cell: (e) => <Money value={e.penaltyOutstanding} />,
            footer: <Money value={summary.penalty} bold />,
        },
        {
            id: 'total',
            header: 'Total Outstanding',
            sortKey: 'totalOutstanding',
            align: 'right',
            cell: (e) => <Money value={e.totalOutstanding} bold />,
            footer: <Money value={summary.total} bold />,
        },
    ];

    const handleExcelExport = async () => {
        setIsExporting(true);
        try {
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('NPL Report');

            worksheet.columns = [
                { header: 'Borrower ID', key: 'borrowerId', width: 20 },
                { header: 'Customer Name', key: 'borrowerName', width: 25 },
                { header: 'Account Number', key: 'accountNumber', width: 20 },
                { header: 'Loan Provider', key: 'providerName', width: 20 },
                { header: 'Days Overdue', key: 'daysOverdue', width: 15 },
                { header: 'Principal Outstanding', key: 'principalOutstanding', width: 20 },
                { header: 'Interest Outstanding', key: 'interestOutstanding', width: 20 },
                { header: 'Service Fee Outstanding', key: 'serviceFeeOutstanding', width: 20 },
                { header: 'Penalty Outstanding', key: 'penaltyOutstanding', width: 20 },
                { header: 'Total Outstanding', key: 'totalOutstanding', width: 20 },
            ];

            // Use the currently displayed (filtered and sorted) data
            sortedEntries.forEach(entry => {
                worksheet.addRow({
                    ...entry,
                    // Ensure numbers are numbers for Excel
                    principalOutstanding: Number(entry.principalOutstanding.toFixed(2)),
                    interestOutstanding: Number(entry.interestOutstanding.toFixed(2)),
                    serviceFeeOutstanding: Number(entry.serviceFeeOutstanding.toFixed(2)),
                    penaltyOutstanding: Number(entry.penaltyOutstanding.toFixed(2)),
                    totalOutstanding: Number(entry.totalOutstanding.toFixed(2)),
                });
            });

            // Auto-adjust column widths (simple version)
            worksheet.columns.forEach(column => {
                let maxLength = 0;
                column.eachCell!({ includeEmpty: true }, cell => {
                    const columnLength = cell.value ? cell.value.toString().length : 10;
                    if (columnLength > maxLength) {
                        maxLength = columnLength;
                    }
                });
                column.width = maxLength < 10 ? 10 : maxLength + 2;
            });

            const buffer = await workbook.xlsx.writeBuffer();
            const fileName = `NPL_Report_${format(new Date(), 'yyyyMMdd')}.xlsx`;
            saveAs(new Blob([buffer]), fileName);

            toast({
                title: 'Export Successful',
                description: 'NPL report has been exported to Excel.',
            });
        } catch (error) {
            console.error('Export failed:', error);
            toast({
                title: 'Export Failed',
                description: 'Could not export NPL data to Excel.',
                variant: 'destructive',
            });
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className="flex-1 space-y-4 p-8 pt-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">NPL</h2>
                    <p className="text-muted-foreground">
                        View and manage borrowers with Non-Performing Loans.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        onClick={handleExcelExport}
                        disabled={isExporting || sortedEntries.length === 0}
                    >
                        {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                        {isExporting ? 'Exporting...' : 'Export to Excel'}
                    </Button>
                    {canRunNplUpdate && (
                        <Button onClick={handleRunNplUpdate} disabled={isUpdating}>
                            {isUpdating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                            Run NPL Status Update
                        </Button>
                    )}
                </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatTile
                    label="NPL Borrowers"
                    value={summary.count.toLocaleString()}
                    hint={
                        isFiltered
                            ? `of ${entries.length.toLocaleString()} flagged, matching the current filters`
                            : `Across ${summary.providerCount} provider(s)`
                    }
                    icon={Users}
                    tone="info"
                    loading={isLoading}
                />
                <StatTile
                    label="Total Outstanding"
                    value={formatMoney(summary.total)}
                    hint="Principal, interest, fees and penalty"
                    icon={Banknote}
                    tone={summary.total > 0 ? 'danger' : 'success'}
                    loading={isLoading}
                />
                <StatTile
                    label="Principal at Risk"
                    value={formatMoney(summary.principal)}
                    hint={`Plus ${formatMoney(summary.charges)} in interest, fees & penalty`}
                    icon={Landmark}
                    tone="warning"
                    loading={isLoading}
                />
                <StatTile
                    label="Longest Overdue"
                    value={`${summary.maxOverdue.toLocaleString()} day(s)`}
                    hint={`${summary.avgOverdue.toLocaleString()} day(s) overdue on average`}
                    icon={AlertTriangle}
                    tone={summary.maxOverdue > 0 ? 'danger' : 'success'}
                    loading={isLoading}
                />
            </div>

            <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-2">
                    <SearchInput
                        className="flex-1 min-w-[300px]"
                        label="Search NPL borrowers"
                        placeholder="Search by ID, name or account..."
                        value={searchQuery}
                        onChange={(value) => {
                            setSearchQuery(value);
                            table.resetPage();
                        }}
                    />
                    <Select
                        value={providerFilter}
                        onValueChange={(value) => {
                            setProviderFilter(value);
                            table.resetPage();
                        }}
                    >
                        <SelectTrigger className="w-[200px]">
                            <SelectValue placeholder="All Providers" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Providers</SelectItem>
                            {providers.map(p => (
                                <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {isDistrictUser && (
                        <Select value={branchFilter} onValueChange={setBranchFilter}>
                            <SelectTrigger className="w-[240px]">
                                <SelectValue placeholder="All Branches" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Branches</SelectItem>
                                {managedBranchCodes.map((code: number) => (
                                    <SelectItem key={code} value={String(code)}>{branchLabel(code)}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                    <div className="flex items-center gap-2">
                        <Input
                            placeholder="Min Days Overdue"
                            type="number"
                            value={daysOverdueMin}
                            onChange={(e) => {
                                setDaysOverdueMin(e.target.value);
                                table.resetPage();
                            }}
                            className="w-[150px]"
                        />
                        <span>-</span>
                        <Input
                            placeholder="Max Days Overdue"
                            type="number"
                            value={daysOverdueMax}
                            onChange={(e) => {
                                setDaysOverdueMax(e.target.value);
                                table.resetPage();
                            }}
                            className="w-[150px]"
                        />
                    </div>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>NPL Borrowers</CardTitle>
                        <CardDescription>This list contains all borrowers who have been flagged due to overdue loans based on their provider's NPL threshold.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <DataTable
                            caption="NPL borrowers"
                            columns={columns}
                            rows={table.rows}
                            rowKey={(entry, idx) => `${entry.borrowerId}-${entry.providerName}-${idx}`}
                            isLoading={isLoading && entries.length === 0}
                            isFetching={isLoading}
                            error={loadError}
                            onRetry={() => void fetchBorrowers()}
                            emptyMessage="No NPL data found matching your filters."
                            sort={table.sort}
                            onSortChange={table.onSortChange}
                            paging={table.paging}
                            footerLabel={isFiltered ? 'Total (filtered)' : 'Total'}
                        />
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
