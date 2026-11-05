

'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import ExcelJS from 'exceljs';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { PlusCircle, Trash2, Loader2, Edit, ChevronDown, Settings2, Save, Pencil, ChevronRight, ChevronLeft, Search, X, Clock, AlertTriangle, Undo2 } from 'lucide-react';
import type { LoanProvider, LoanProduct, FeeRule, PenaltyRule, LoanAmountTier, TermsAndConditions, DataProvisioningUpload, Tax, LoanCycleConfig } from '@/lib/types';
import type { SettingsPendingState } from '@/lib/settings-pending';
import { AddProviderDialog } from '@/components/loan/add-provider-dialog';
import { AddProductDialog } from '@/components/loan/add-product-dialog';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog as UIDialog,
  DialogContent as UIDialogContent,
  DialogHeader as UIDialogHeader,
  DialogTitle as UIDialogTitle,
  DialogFooter as UIDialogFooter,
  DialogClose as UIDialogClose,
  DialogDescription as UIDialogDescription,
} from '@/components/ui/dialog';
import { useAuth } from '@/hooks/use-auth';
import { postPendingChange } from '@/lib/fetch-utils';
import { isSafeOnlyProductUpdate } from '@/lib/loan-product-changes';
import { produce } from 'immer';
import { IconDisplay } from '@/components/icons';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '../ui/textarea';
import { Skeleton } from '../ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { Badge } from '../ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { format } from 'date-fns';
import Link from 'next/link';
import { usePermissions } from '@/hooks/use-permissions';


// Helper to safely parse JSON fields that might be strings
const safeParseJson = (data: any, field: string, defaultValue: any) => {
    if (data && typeof data[field] === 'string') {
        try {
            return JSON.parse(data[field]);
        } catch (e) {
            return defaultValue;
        }
    }
    return data?.[field] ?? defaultValue;
};

// Provider rows as stored: no nested products, configs or terms. A provider
// payload used to carry every product (salary mappings, icons…), megabytes
// per approval request.
const providerScalars = (prov: any) => {
    if (!prov) return prov;
    const rest = { ...prov };
    for (const key of ['products', 'dataProvisioningConfigs', 'termsAndConditions', 'ledgerAccounts']) delete rest[key];
    return rest;
};

// ---------------------------------------------------------------------------
// Approval payload helpers
// ---------------------------------------------------------------------------

// Builds { original, updated } holding only the fields that differ, plus
// id/name/providerId so the approvals list can label the request. Approval
// applies every field in `updated`, so sending the whole product let unrelated,
// unsubmitted edits from another tab ride along unseen by the checker.
// `baseline` is what the form would show for the saved item (defaults to
// `original`); comparing against it keeps untouched fields out, while the
// stored value goes into `original` for the checker.
const buildChangePayload = (
    context: { id: string; name?: string; providerId?: string },
    original: Record<string, any>,
    candidate: Record<string, any>,
    keys: readonly string[],
    baseline: Record<string, any> = original,
) => {
    const before: Record<string, any> = {};
    const after: Record<string, any> = {};
    for (const key of keys) {
        if (candidate[key] === undefined) continue;
        if (JSON.stringify(baseline?.[key] ?? null) !== JSON.stringify(candidate[key] ?? null)) {
            before[key] = original?.[key] ?? null;
            after[key] = candidate[key];
        }
    }
    const ctx = Object.fromEntries(Object.entries(context).filter(([, v]) => v !== undefined));
    return {
        changedKeys: Object.keys(after),
        payload: { original: { ...ctx, ...before }, updated: { ...ctx, ...after } },
    };
};

const toNumberOrNull = (value: unknown): number | null => {
    if (value === '' || value === null || value === undefined) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
};

// Excel cells can hold dates, rich text, formulas or hyperlinks. React can't
// render those objects, and String() turns them into "[object Object]".
const cellToText = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return format(value, 'yyyy-MM-dd');
    if (typeof value === 'object') {
        const v = value as any;
        if (Array.isArray(v.richText)) return v.richText.map((part: any) => part.text ?? '').join('');
        if ('result' in v) return cellToText(v.result);
        if ('text' in v) return cellToText(v.text);
        if ('error' in v) return String(v.error);
        return JSON.stringify(v);
    }
    return String(value);
};

// Minimal CSV line splitter that honours double quotes ("12,000").
const splitCsvLine = (line: string): string[] => {
    const out: string[] = [];
    let current = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (quoted && line[i + 1] === '"') { current += '"'; i++; }
            else quoted = !quoted;
        } else if (ch === ',' && !quoted) {
            out.push(current.trim());
            current = '';
        } else {
            current += ch;
        }
    }
    out.push(current.trim());
    return out;
};

// ---------------------------------------------------------------------------
// Pending approvals: loaded on the server, updated as the admin submits.
// ---------------------------------------------------------------------------
type PendingKind = keyof SettingsPendingState;
type PendingApi = {
    isPending: (kind: PendingKind, id: string | null | undefined) => boolean;
    markPending: (kind: PendingKind, id: string) => void;
};
const PendingContext = React.createContext<PendingApi>({ isPending: () => false, markPending: () => {} });
const usePending = () => React.useContext(PendingContext);

const PendingBadge = () => (
    <Badge variant="outline" className="gap-1 border-amber-500 text-amber-700 dark:text-amber-400">
        <Clock className="h-3 w-3" /> Pending approval
    </Badge>
);

// Opens a single provider's accordion straight away; with one provider the
// extra click on every tab is pure friction.
const defaultOpenProviders = (providers: LoanProvider[]) => (providers.length === 1 ? [providers[0].id] : []);

// Fields the Providers & Products form submits. Fees, penalties and tiers
// belong to the Fee tab; eligibility and status have their own flows.
const PRODUCT_TERM_FIELDS = [
    'minLoan', 'maxLoan', 'duration', 'allowConcurrentLoans', 'isSalaryAdvance', 'advancePercent',
    'installments', 'repaymentIntervalDays', 'penaltyPerInstallment', 'salaryAdvanceMappings',
] as const;

// One shape for both the saved product and the form, so untouched fields
// compare equal and only real edits reach the approval request.
const normalizeProductTerms = (p: any) => {
    const isSalary = !!p.isSalaryAdvance;
    const duration = toNumberOrNull(p.duration);
    const installments = isSalary ? toNumberOrNull(p.installments) : null;
    return {
        allowConcurrentLoans: !!p.allowConcurrentLoans,
        isSalaryAdvance: isSalary,
        duration,
        minLoan: isSalary ? undefined : toNumberOrNull(p.minLoan),
        maxLoan: isSalary ? undefined : toNumberOrNull(p.maxLoan),
        advancePercent: isSalary ? toNumberOrNull(p.advancePercent) : undefined,
        installments: isSalary ? installments : undefined,
        repaymentIntervalDays: isSalary && duration && installments ? Math.floor(duration / installments) : undefined,
        // Per-installment penalties default on when a product becomes a salary
        // advance; afterwards the Fee tab's switch owns this field.
        penaltyPerInstallment: isSalary ? true : undefined,
        salaryAdvanceMappings: isSalary ? (p.salaryAdvanceMappings ?? null) : undefined,
    };
};

// Returns a message for the first problem, or null when the terms are valid.
const validateProductTerms = (t: ReturnType<typeof normalizeProductTerms>): string | null => {
    if (t.duration === null || !Number.isInteger(t.duration) || t.duration <= 0) {
        return 'Loan duration must be a whole number of days greater than 0.';
    }
    if (!t.isSalaryAdvance) {
        if (t.minLoan === null || t.minLoan === undefined || t.minLoan < 0) return 'Min loan amount must be 0 or more.';
        if (t.maxLoan === null || t.maxLoan === undefined || t.maxLoan <= 0) return 'Max loan amount must be greater than 0.';
        if (t.minLoan > t.maxLoan) return 'Min loan amount cannot be greater than the max loan amount.';
        return null;
    }
    if (t.advancePercent !== null && t.advancePercent !== undefined
        && (!Number.isInteger(t.advancePercent) || t.advancePercent < 1 || t.advancePercent > 100)) {
        return 'Advance percent must be a whole number from 1 to 100.';
    }
    if (!t.installments || !Number.isInteger(t.installments) || t.installments <= 0) {
        return 'Salary-advance products need a whole number of installments greater than 0.';
    }
    if (t.installments > t.duration) return 'Installments cannot be more than the loan duration in days.';
    return null;
};

const ProductSettingsForm = ({ product, providerColor, onDelete, onUpdate }: {
    product: LoanProduct;
    providerColor?: string;
    onDelete: () => void;
    onUpdate: (updatedProduct: Partial<LoanProduct>) => void;
}) => {
    const { entityActions } = usePermissions();
    const { isPending, markPending } = usePending();
    const [isSaving, setIsSaving] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    // Unsubmitted edits live here, not in the shared provider state, so they
    // can't look saved, leak into another tab's request, or survive "Discard".
    const [edits, setEdits] = useState<Partial<LoanProduct>>({});
    const stageEdit = (update: Partial<LoanProduct>) => setEdits(prev => ({ ...prev, ...update }));
    const hasEdits = Object.keys(edits).length > 0;
    const [statusToConfirm, setStatusToConfirm] = useState<boolean | null>(null);
    const [isStatusSaving, setIsStatusSaving] = useState(false);
    const { toast } = useToast();
    const productPending = isPending('products', product.id);

    // Upload mode: 'replace' replaces all mappings, 'append' merges with existing
    const [salaryUploadMode, setSalaryUploadMode] = useState<'replace' | 'append'>('append');
    // Salary mappings management dialog state
    const [isMappingsDialogOpen, setIsMappingsDialogOpen] = useState(false);
    const [mappingsSearchQuery, setMappingsSearchQuery] = useState('');
    const [editingMappingIndex, setEditingMappingIndex] = useState<number | null>(null);
    const [editingAccountNumber, setEditingAccountNumber] = useState('');
    const [editingSalary, setEditingSalary] = useState('');
    const [mappingsPage, setMappingsPage] = useState(1);
    const MAPPINGS_PAGE_SIZE = 10;

    const productActions = entityActions('LoanProduct');
    // Submitting a product edit is an UPDATE request, which the server allows
    // with `update` only; `create` alone used to unlock a form that then 403'd.
    const canEditProduct = !!productActions.update;
    const canDeleteProduct = !!productActions.delete;
    // Fields lock while a change waits for approval; the status switch doesn't.
    const canEditFields = canEditProduct && !productPending;

    const formData = useMemo(() => ({
        ...product,
        ...edits,
        // A cleared input stages null; show it empty rather than the saved value.
        installments: ('installments' in edits ? edits.installments : product.installments) ?? '',
    }), [product, edits]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        stageEdit({ [name]: value === '' ? null : value } as Partial<LoanProduct>);
    };

    const handleSwitchChange = (name: keyof LoanProduct, checked: boolean) => {
        if (!canEditProduct) {
            toast({ title: 'Not authorized', description: 'You only have read access for Settings.', variant: 'destructive' });
            return;
        }
        if (name === 'status') {
            // Takes effect at once for borrowers, so confirm first.
            setStatusToConfirm(checked);
        } else {
            stageEdit({ [name]: checked } as Partial<LoanProduct>);
        }
    }

    const handleFileSalaryUpload = async (input: HTMLInputElement) => {
        const file = input.files?.[0];
        // Clear the picker so choosing the same file again still triggers onChange.
        const reset = () => { input.value = ''; };
        if (!file) return;

        const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
        const ext = (file.name || '').split('.').pop()?.toLowerCase();
        // ExcelJS reads .xlsx only; legacy .xls failed with a parser error.
        if (!ext || !['csv', 'xlsx'].includes(ext)) {
            toast({ title: 'Invalid file type', description: 'Use a .csv or .xlsx file.', variant: 'destructive' });
            return reset();
        }
        if (file.size > MAX_FILE_SIZE) {
            toast({ title: 'File too large', description: 'Maximum file size is 10MB.', variant: 'destructive' });
            return reset();
        }

        const headerKind = (header: string): 'accountNumber' | 'salary' | null => {
            const norm = header.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (norm.includes('account') || norm.includes('acct')) return 'accountNumber';
            if (norm.includes('salary') || norm.includes('amount') || norm.includes('pay')) return 'salary';
            return null;
        };

        try {
            // Raw [account, salary] text pairs, header row excluded.
            const rows: Array<[string, string]> = [];
            if (ext === 'xlsx') {
                const workbook = new ExcelJS.Workbook();
                await workbook.xlsx.load(await file.arrayBuffer());
                const sheet = workbook.worksheets[0];
                if (!sheet) throw new Error('The workbook has no sheets.');
                let accountCol = 0;
                let salaryCol = 0;
                sheet.getRow(1).eachCell((cell, col) => {
                    const kind = headerKind(cell.text || '');
                    if (kind === 'accountNumber' && !accountCol) accountCol = col;
                    if (kind === 'salary' && !salaryCol) salaryCol = col;
                });
                if (!accountCol || !salaryCol) throw new Error('The first row needs an account number column and a salary column.');
                for (let r = 2; r <= sheet.rowCount; r++) {
                    const row = sheet.getRow(r);
                    // cell.text keeps the displayed digits instead of objects or float noise.
                    rows.push([row.getCell(accountCol).text, row.getCell(salaryCol).text]);
                }
            } else {
                const lines = (await file.text()).split(/\r?\n/).filter(l => l.trim() !== '');
                const headers = lines.length ? splitCsvLine(lines[0]) : [];
                const accountCol = headers.findIndex(h => headerKind(h) === 'accountNumber');
                const salaryCol = headers.findIndex(h => headerKind(h) === 'salary');
                if (accountCol < 0 || salaryCol < 0) throw new Error('The header row needs an account number column and a salary column.');
                for (const line of lines.slice(1)) {
                    const cols = splitCsvLine(line);
                    rows.push([cols[accountCol] ?? '', cols[salaryCol] ?? '']);
                }
            }

            let skipped = 0;
            const mappings: Array<{ accountNumber: string; salary: number }> = [];
            for (const [accountText, salaryText] of rows) {
                const accountNumber = String(accountText || '').trim();
                if (!accountNumber) continue; // blank row
                const salary = Number(String(salaryText || '').replace(/,/g, '').trim());
                if (!Number.isFinite(salary) || salary <= 0) { skipped++; continue; }
                mappings.push({ accountNumber, salary });
            }

            if (mappings.length === 0) {
                toast({
                    title: 'No valid rows found',
                    description: skipped
                        ? `${skipped} row(s) had a missing or invalid salary.`
                        : 'The file must contain at least one row with an account number and a salary.',
                    variant: 'destructive',
                });
                return reset();
            }
            const skippedNote = skipped ? ` Skipped ${skipped} row(s) with a missing or invalid salary.` : '';

            if (salaryUploadMode === 'append') {
                const merged = new Map(parsedMappings.map(m => [String(m.accountNumber), m]));
                let added = 0;
                let updated = 0;
                for (const m of mappings) {
                    if (merged.has(m.accountNumber)) updated++; else added++;
                    merged.set(m.accountNumber, m);
                }
                const finalMappings = Array.from(merged.values());
                stageEdit({ salaryAdvanceMappings: JSON.stringify(finalMappings) });
                toast({
                    title: 'Mappings staged',
                    description: `Added ${added}, updated ${updated}. Total: ${finalMappings.length}.${skippedNote} Submit for approval to apply.`,
                });
            } else {
                stageEdit({ salaryAdvanceMappings: JSON.stringify(mappings) });
                toast({
                    title: 'Mappings staged',
                    description: `The list will be replaced with ${mappings.length} mapping(s).${skippedNote} Submit for approval to apply.`,
                });
            }
        } catch (err: any) {
            console.error('Failed to parse salary mapping file', err);
            toast({
                title: 'Failed to read file',
                description: err?.message || 'Check the file format and try again.',
                variant: 'destructive',
            });
        }
        reset();
    }

    // Parse salary mappings for display and management
    const parsedMappings = useMemo(() => {
        if (!formData.salaryAdvanceMappings) return [];
        try {
            return JSON.parse(formData.salaryAdvanceMappings as string) as Array<{ accountNumber: string; salary: number }>;
        } catch {
            return [];
        }
    }, [formData.salaryAdvanceMappings]);

    // Filter and paginate mappings (preserve original indices so edit/delete work after searching)
    const filteredMappingEntries = useMemo(() => {
        const query = mappingsSearchQuery.trim().toLowerCase();
        return parsedMappings
            .map((m, originalIndex) => ({ mapping: m, originalIndex }))
            .filter(({ mapping }) => {
                if (!query) return true;
                return (
                    String(mapping.accountNumber).toLowerCase().includes(query) ||
                    String(mapping.salary).includes(query)
                );
            });
    }, [parsedMappings, mappingsSearchQuery]);

    const paginatedMappingEntries = useMemo(() => {
        const start = (mappingsPage - 1) * MAPPINGS_PAGE_SIZE;
        return filteredMappingEntries.slice(start, start + MAPPINGS_PAGE_SIZE);
    }, [filteredMappingEntries, mappingsPage]);

    const totalMappingsPages = Math.ceil(filteredMappingEntries.length / MAPPINGS_PAGE_SIZE);

    // Handle editing a mapping
    const handleStartEditMapping = (originalIndex: number) => {
        const mapping = parsedMappings[originalIndex];
        if (mapping) {
            setEditingMappingIndex(originalIndex);
            setEditingAccountNumber(String(mapping.accountNumber));
            setEditingSalary(String(mapping.salary));
        }
    };

    const handleCancelEditMapping = () => {
        setEditingMappingIndex(null);
        setEditingAccountNumber('');
        setEditingSalary('');
    };

    const handleSaveEditMapping = () => {
        if (editingMappingIndex === null) return;
        if (!editingAccountNumber.trim()) {
            toast({ title: 'Invalid account number', description: 'Account number cannot be empty.', variant: 'destructive' });
            return;
        }
        
        const salary = Number(editingSalary);
        if (!Number.isFinite(salary) || salary <= 0) {
            toast({ title: 'Invalid salary', description: 'Salary must be a number greater than 0.', variant: 'destructive' });
            return;
        }

        const newMappings = [...parsedMappings];
        const accountNumber = editingAccountNumber.trim();
        const exists = newMappings.some((m, i) => i !== editingMappingIndex && String(m.accountNumber) === accountNumber);
        if (exists) {
            toast({ title: 'Duplicate account', description: 'This account number already exists in the list.', variant: 'destructive' });
            return;
        }

        newMappings[editingMappingIndex] = { accountNumber, salary };

        stageEdit({ salaryAdvanceMappings: JSON.stringify(newMappings) });
        toast({ title: 'Mapping updated', description: `Account ${editingAccountNumber} has been updated.` });
        handleCancelEditMapping();
    };

    // Handle deleting a mapping
    const handleDeleteMapping = (originalIndex: number) => {
        const mapping = parsedMappings[originalIndex];
        if (!mapping) return;
        
        const newMappings = parsedMappings.filter((_, i) => i !== originalIndex);
        stageEdit({ salaryAdvanceMappings: JSON.stringify(newMappings) });
        toast({ title: 'Mapping removed', description: `Account ${mapping.accountNumber} has been removed from the list.` });

        if (editingMappingIndex === originalIndex) {
            handleCancelEditMapping();
        }
        
        // Adjust page if needed
        if (paginatedMappingEntries.length === 1 && mappingsPage > 1) {
            setMappingsPage(mappingsPage - 1);
        }
    };

    // Handle adding a new mapping manually
    const [isAddingMapping, setIsAddingMapping] = useState(false);
    const [newMappingAccount, setNewMappingAccount] = useState('');
    const [newMappingSalary, setNewMappingSalary] = useState('');

    const handleAddMapping = () => {
        if (!newMappingAccount.trim()) {
            toast({ title: 'Invalid account number', description: 'Account number cannot be empty.', variant: 'destructive' });
            return;
        }
        
        const exists = parsedMappings.some(m => String(m.accountNumber) === newMappingAccount.trim());
        if (exists) {
            toast({ title: 'Duplicate account', description: 'This account number already exists in the list.', variant: 'destructive' });
            return;
        }
        const salary = Number(newMappingSalary);
        if (!Number.isFinite(salary) || salary <= 0) {
            toast({ title: 'Invalid salary', description: 'Salary must be a number greater than 0.', variant: 'destructive' });
            return;
        }

        const newMappings = [...parsedMappings, { accountNumber: newMappingAccount.trim(), salary }];

        stageEdit({ salaryAdvanceMappings: JSON.stringify(newMappings) });
        toast({ title: 'Mapping added', description: `Account ${newMappingAccount} has been added.` });
        setNewMappingAccount('');
        setNewMappingSalary('');
        setIsAddingMapping(false);
        // Go to last page to show new entry
        setMappingsPage(Math.ceil(newMappings.length / MAPPINGS_PAGE_SIZE));
    };

    const handleStatusChange = async (checked: boolean) => {
        if (!canEditProduct) {
            toast({ title: 'Not authorized', description: 'You only have read access for Settings.', variant: 'destructive' });
            return;
        }
        const previousStatus = product.status;
        const newStatus = checked ? 'Active' : 'Disabled';
        setIsStatusSaving(true);
        onUpdate({ status: newStatus });
        try {
            const response = await fetch('/api/settings/products', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: product.id, status: newStatus })
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Failed to update status.');
            }
            toast({ title: 'Status updated', description: `${product.name} is now ${newStatus === 'Active' ? 'enabled' : 'disabled'}.` });
        } catch (error: any) {
            toast({ title: 'Error', description: error.message, variant: 'destructive' });
            onUpdate({ status: previousStatus });
        } finally {
            setIsStatusSaving(false);
        }
    };

    const submitForApproval = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!canEditFields) {
            toast({ title: 'Not authorized', description: 'You only have read access for Products.', variant: 'destructive' });
            return;
        }

        const candidate = normalizeProductTerms(formData);
        const problem = validateProductTerms(candidate);
        if (problem) {
            toast({ title: 'Check the product settings', description: problem, variant: 'destructive' });
            return;
        }

        const { changedKeys, payload } = buildChangePayload(
            { id: product.id, name: product.name, providerId: product.providerId },
            product,
            candidate,
            PRODUCT_TERM_FIELDS,
            normalizeProductTerms(product),
        );
        if (changedKeys.length === 0) {
            toast({ title: 'Nothing to submit', description: 'You have not changed any of this product\'s settings.' });
            return;
        }

        setIsSaving(true);
        try {
            await postPendingChange({
                entityType: 'LoanProduct',
                entityId: product.id,
                changeType: 'UPDATE',
                payload: JSON.stringify(payload)
            }, 'Failed to submit product changes for approval.');

            // Safe-only changes (e.g. salary mappings) keep the product enabled;
            // term changes disable it while pending (same rule as the server).
            markPending('products', product.id);
            if (!isSafeOnlyProductUpdate(payload)) onUpdate({ status: 'Disabled' });

            toast({ title: 'Submitted for approval', description: `Changes to ${product.name} are waiting for a checker.` });
        } catch (error: any) {
            toast({ title: 'Error', description: error.message, variant: 'destructive' });
        } finally {
            setIsSaving(false);
        }
    }

    return (
       <>
       <Collapsible open={isOpen} onOpenChange={setIsOpen} className="space-y-2">
            <CollapsibleTrigger asChild>
                <button className="flex items-center justify-between w-full space-x-4 px-4 py-2 border rounded-lg bg-background hover:bg-muted/50 transition-colors">
                    <div className="flex flex-wrap items-center gap-2 text-left">
                        <h4 className="text-sm font-semibold">{product.name}</h4>
                        <Badge variant={product.status === 'Active' ? 'default' : 'destructive'} className={cn(product.status === 'Active' && 'bg-green-600')}>{product.status}</Badge>
                        {productPending && <PendingBadge />}
                        {hasEdits && !productPending && <Badge variant="secondary">Unsaved changes</Badge>}
                    </div>
                    <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform duration-200', isOpen && 'rotate-180')} />
                </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
                 <form onSubmit={submitForApproval} className="p-4 border rounded-lg bg-background space-y-6">
                    {productPending && (
                        <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
                            <Clock className="mt-0.5 h-4 w-4 shrink-0" />
                            A change to this product is waiting for approval. Its settings are locked until a checker approves or rejects it.
                        </p>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="flex items-center space-x-2">
                            <Switch
                                id={`status-${product.id}`}
                                checked={product.status === 'Active'}
                                onCheckedChange={(checked) => handleSwitchChange('status', checked)}
                                disabled={!canEditProduct || isStatusSaving}
                                className="data-[state=checked]:bg-[--provider-color]"
                                style={{'--provider-color': providerColor} as React.CSSProperties}
                            />
                            <div>
                                <Label htmlFor={`status-${product.id}`}>{product.status === 'Active' ? 'Enabled' : 'Disabled'}</Label>
                                <p className="text-xs text-muted-foreground">Applies immediately, without approval.</p>
                            </div>
                        </div>
                        <div className="flex items-center space-x-2">
                            <Switch
                                id={`allowConcurrentLoans-${product.id}`}
                                checked={!!formData.allowConcurrentLoans}
                                onCheckedChange={(checked) => handleSwitchChange('allowConcurrentLoans', Boolean(checked))}
                                disabled={!canEditFields}
                                className="data-[state=checked]:bg-[--provider-color]"
                                style={{'--provider-color': providerColor} as React.CSSProperties}
                            />
                            <Label htmlFor={`allowConcurrentLoans-${product.id}`}>Combinable with Other Loans</Label>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor={`minLoan-${product.id}`}>Min Loan Amount</Label>
                            <Input
                                id={`minLoan-${product.id}`}
                                name="minLoan"
                                type="number"
                                value={formData.minLoan ?? ''}
                                onChange={handleChange}
                                placeholder="e.g., 500"
                                disabled={!canEditFields || !!formData.isSalaryAdvance}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor={`maxLoan-${product.id}`}>Max Loan Amount</Label>
                            <Input
                                id={`maxLoan-${product.id}`}
                                name="maxLoan"
                                type="number"
                                value={formData.maxLoan ?? ''}
                                onChange={handleChange}
                                placeholder="e.g., 2500"
                                disabled={!canEditFields || !!formData.isSalaryAdvance}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor={`duration-${product.id}`}>Loan Duration (days)</Label>
                            <Input
                                id={`duration-${product.id}`}
                                name="duration"
                                type="number"
                                value={formData.duration ?? ''}
                                onChange={handleChange}
                                placeholder="e.g., 30"
                                disabled={!canEditFields}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="">Salary Advance</Label>
                            <div className="flex items-center gap-2">
                                <Switch
                                    id={`isSalaryAdvance-${product.id}`}
                                    checked={!!formData.isSalaryAdvance}
                                    onCheckedChange={(checked) => handleSwitchChange('isSalaryAdvance', Boolean(checked))}
                                    disabled={!canEditFields}
                                    className="data-[state=checked]:bg-[--provider-color]"
                                    style={{'--provider-color': providerColor} as React.CSSProperties}
                                />
                                <span className="text-sm">Enable salary advance for this product</span>
                            </div>
                        </div>
                        {formData.isSalaryAdvance && (
                          <>
                            <div className="space-y-2">
                                <Label htmlFor={`advancePercent-${product.id}`}>Advance Percent</Label>
                                <Input
                                    id={`advancePercent-${product.id}`}
                                    name="advancePercent"
                                    type="number"
                                    value={formData.advancePercent ?? ''}
                                    onChange={handleChange}
                                    placeholder="e.g., 50"
                                    disabled={!canEditFields}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor={`installments-${product.id}`}>Installments</Label>
                                <Input
                                    id={`installments-${product.id}`}
                                    name="installments"
                                    type="number"
                                    value={formData.installments ?? ''}
                                    onChange={handleChange}
                                    placeholder="e.g., 12"
                                    disabled={!canEditFields}
                                />
                            </div>
                            {formData.installments && Number(formData.installments) > 0 && (
                              <div className="space-y-2">
                                <Label>Repayment Interval</Label>
                                <div className="text-sm text-muted-foreground">Every {Math.floor((Number(formData.duration) || 0) / Number(formData.installments)) || 0} days</div>
                              </div>
                            )}
                            <div className="space-y-4">
                                <Label>Salary Mapping Upload</Label>
                                <div className="space-y-3">
                                    {/* Upload Mode Selector */}
                                    <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-md">
                                        <span className="text-sm font-medium">Upload Mode:</span>
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input 
                                                type="radio" 
                                                name={`uploadMode-${product.id}`}
                                                checked={salaryUploadMode === 'append'} 
                                                onChange={() => setSalaryUploadMode('append')}
                                                disabled={!canEditFields}
                                                className="h-4 w-4"
                                            />
                                            <span className="text-sm">Add to existing list</span>
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input 
                                                type="radio" 
                                                name={`uploadMode-${product.id}`}
                                                checked={salaryUploadMode === 'replace'} 
                                                onChange={() => setSalaryUploadMode('replace')}
                                                disabled={!canEditFields}
                                                className="h-4 w-4"
                                            />
                                            <span className="text-sm">Replace entire list</span>
                                        </label>
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        {salaryUploadMode === 'append' 
                                            ? '• New entries will be added, existing account numbers will be updated with new salary values'
                                            : '• Warning: This will remove all existing mappings and replace with the new file'}
                                    </div>
                                    <div>
                                        <Input type="file" accept=".csv,.xlsx" onChange={(e) => handleFileSalaryUpload(e.currentTarget)} disabled={!canEditFields} className="max-w-sm cursor-pointer" />
                                        <div className="text-sm text-muted-foreground mt-1">A .csv or .xlsx file with an account number column and a salary column.</div>
                                    </div>
                                </div>
                                {formData.salaryAdvanceMappings && (
                                    <div className="flex items-center justify-between">
                                        <div className="text-sm text-muted-foreground">Current mappings: {parsedMappings.length} rows</div>
                                        <Button 
                                            type="button" 
                                            variant="outline" 
                                            size="sm"
                                            onClick={() => {
                                                setMappingsPage(1);
                                                setMappingsSearchQuery('');
                                                setIsMappingsDialogOpen(true);
                                            }}
                                        >
                                            <Settings2 className="h-4 w-4 mr-2" />
                                            Manage Mappings
                                        </Button>
                                    </div>
                                )}
                            </div>

                            {/* Salary Mappings Management Dialog */}
                            <UIDialog open={isMappingsDialogOpen} onOpenChange={(open) => {
                                setIsMappingsDialogOpen(open);
                                if (!open) {
                                    handleCancelEditMapping();
                                    setIsAddingMapping(false);
                                }
                            }}>
                                <UIDialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
                                    <UIDialogHeader>
                                        <UIDialogTitle>Manage Salary Mappings</UIDialogTitle>
                                        <UIDialogDescription>
                                            View, edit, or remove salary mappings. Total: {parsedMappings.length} entries. Edits are staged until you submit the product for approval.
                                        </UIDialogDescription>
                                    </UIDialogHeader>
                                    
                                    {/* Search and Add */}
                                    <div className="flex items-center gap-2 py-2">
                                        <div className="relative flex-1">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                            <Input 
                                                placeholder="Search by account number or salary..." 
                                                value={mappingsSearchQuery}
                                                onChange={(e) => {
                                                    setMappingsSearchQuery(e.target.value);
                                                    setMappingsPage(1);
                                                }}
                                                className="pl-9"
                                            />
                                            {mappingsSearchQuery && (
                                                <Button 
                                                    variant="ghost" 
                                                    size="icon" 
                                                    className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
                                                    onClick={() => setMappingsSearchQuery('')}
                                                >
                                                    <X className="h-3 w-3" />
                                                </Button>
                                            )}
                                        </div>
                                        {canEditFields && !isAddingMapping && (
                                            <Button variant="outline" size="sm" onClick={() => setIsAddingMapping(true)}>
                                                <PlusCircle className="h-4 w-4 mr-2" />
                                                Add Entry
                                            </Button>
                                        )}
                                    </div>

                                    {/* Add New Entry Form */}
                                    {isAddingMapping && (
                                        <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-md">
                                            <Input 
                                                placeholder="Account Number" 
                                                value={newMappingAccount}
                                                onChange={(e) => setNewMappingAccount(e.target.value)}
                                                className="flex-1"
                                            />
                                            <Input 
                                                type="number"
                                                placeholder="Salary" 
                                                value={newMappingSalary}
                                                onChange={(e) => setNewMappingSalary(e.target.value)}
                                                className="w-32"
                                            />
                                            <Button size="sm" onClick={handleAddMapping}>
                                                <Save className="h-4 w-4 mr-1" />
                                                Add
                                            </Button>
                                            <Button variant="ghost" size="sm" onClick={() => {
                                                setIsAddingMapping(false);
                                                setNewMappingAccount('');
                                                setNewMappingSalary('');
                                            }}>
                                                Cancel
                                            </Button>
                                        </div>
                                    )}

                                    {/* Mappings Table */}
                                    <div className="flex-1 overflow-auto border rounded-md">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead className="w-16">#</TableHead>
                                                    <TableHead>Account Number</TableHead>
                                                    <TableHead className="w-32">Salary</TableHead>
                                                    {canEditFields && <TableHead className="w-24 text-right">Actions</TableHead>}
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {paginatedMappingEntries.length === 0 ? (
                                                    <TableRow>
                                                        <TableCell colSpan={canEditFields ? 4 : 3} className="text-center text-muted-foreground py-8">
                                                            {mappingsSearchQuery ? 'No matching entries found.' : 'No salary mappings yet.'}
                                                        </TableCell>
                                                    </TableRow>
                                                ) : (
                                                    paginatedMappingEntries.map(({ mapping, originalIndex }, index) => {
                                                        const rowNumber = (mappingsPage - 1) * MAPPINGS_PAGE_SIZE + index + 1;
                                                        const isEditing = editingMappingIndex === originalIndex;
                                                        
                                                        return (
                                                            <TableRow key={originalIndex}>
                                                                <TableCell className="text-muted-foreground">{rowNumber}</TableCell>
                                                                <TableCell>
                                                                    {isEditing ? (
                                                                        <Input 
                                                                            value={editingAccountNumber}
                                                                            onChange={(e) => setEditingAccountNumber(e.target.value)}
                                                                            className="h-8"
                                                                        />
                                                                    ) : (
                                                                        <span className="font-mono">{mapping.accountNumber}</span>
                                                                    )}
                                                                </TableCell>
                                                                <TableCell>
                                                                    {isEditing ? (
                                                                        <Input 
                                                                            type="number"
                                                                            value={editingSalary}
                                                                            onChange={(e) => setEditingSalary(e.target.value)}
                                                                            className="h-8 w-28"
                                                                        />
                                                                    ) : (
                                                                        <span>{mapping.salary.toLocaleString()}</span>
                                                                    )}
                                                                </TableCell>
                                                                {canEditFields && (
                                                                    <TableCell className="text-right">
                                                                        {isEditing ? (
                                                                            <div className="flex items-center justify-end gap-1">
                                                                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleSaveEditMapping}>
                                                                                    <Save className="h-3.5 w-3.5 text-green-600" />
                                                                                </Button>
                                                                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCancelEditMapping}>
                                                                                    <X className="h-3.5 w-3.5" />
                                                                                </Button>
                                                                            </div>
                                                                        ) : (
                                                                            <div className="flex items-center justify-end gap-1">
                                                                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleStartEditMapping(originalIndex)}>
                                                                                    <Pencil className="h-3.5 w-3.5" />
                                                                                </Button>
                                                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDeleteMapping(originalIndex)}>
                                                                                    <Trash2 className="h-3.5 w-3.5" />
                                                                                </Button>
                                                                            </div>
                                                                        )}
                                                                    </TableCell>
                                                                )}
                                                            </TableRow>
                                                        );
                                                    })
                                                )}
                                            </TableBody>
                                        </Table>
                                    </div>

                                    {/* Pagination */}
                                    {totalMappingsPages > 1 && (
                                        <div className="flex items-center justify-between pt-2">
                                            <div className="text-sm text-muted-foreground">
                                                Showing {((mappingsPage - 1) * MAPPINGS_PAGE_SIZE) + 1} - {Math.min(mappingsPage * MAPPINGS_PAGE_SIZE, filteredMappingEntries.length)} of {filteredMappingEntries.length}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Button 
                                                    variant="outline" 
                                                    size="sm" 
                                                    disabled={mappingsPage === 1}
                                                    onClick={() => setMappingsPage(p => Math.max(1, p - 1))}
                                                >
                                                    <ChevronLeft className="h-4 w-4" />
                                                </Button>
                                                <span className="text-sm">Page {mappingsPage} of {totalMappingsPages}</span>
                                                <Button 
                                                    variant="outline" 
                                                    size="sm" 
                                                    disabled={mappingsPage >= totalMappingsPages}
                                                    onClick={() => setMappingsPage(p => Math.min(totalMappingsPages, p + 1))}
                                                >
                                                    <ChevronRight className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    )}

                                    <UIDialogFooter>
                                        <UIDialogClose asChild>
                                            <Button variant="outline">Close</Button>
                                        </UIDialogClose>
                                    </UIDialogFooter>
                                </UIDialogContent>
                            </UIDialog>
                          </>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2">
                        {canDeleteProduct && (
                            <Button variant="destructive" type="button" onClick={onDelete} disabled={isSaving || productPending} className="mr-auto">
                                <Trash2 className="h-4 w-4 mr-2" /> Delete
                            </Button>
                        )}
                        {hasEdits && !productPending && (
                            <Button type="button" variant="outline" onClick={() => setEdits({})} disabled={isSaving}>
                                <Undo2 className="h-4 w-4 mr-2" /> Discard changes
                            </Button>
                        )}
                        <Button
                            type="submit"
                            style={{ backgroundColor: providerColor }}
                            className="text-white"
                            disabled={!canEditFields || isSaving || !hasEdits}
                        >
                            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {productPending ? 'Pending Approval' : 'Submit for Approval'}
                        </Button>
                    </div>
                </form>
            </CollapsibleContent>
        </Collapsible>
        <AlertDialog open={statusToConfirm !== null} onOpenChange={(open) => { if (!open) setStatusToConfirm(null); }}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{statusToConfirm ? `Enable ${product.name}?` : `Disable ${product.name}?`}</AlertDialogTitle>
                    <AlertDialogDescription>
                        {statusToConfirm
                            ? 'Borrowers can apply for this product as soon as you confirm. The switch takes effect immediately, without approval.'
                            : 'Borrowers can no longer apply for this product. Loans already taken are not affected. The switch takes effect immediately, without approval.'}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        className={cn(!statusToConfirm && buttonVariants({ variant: 'destructive' }))}
                        onClick={() => {
                            const next = statusToConfirm;
                            setStatusToConfirm(null);
                            if (next !== null) handleStatusChange(next);
                        }}
                    >
                        {statusToConfirm ? 'Enable product' : 'Disable product'}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
       </>
    )
}

function ProvidersTab({ providers, onProvidersChange }: { 
    providers: LoanProvider[],
    onProvidersChange: (updater: React.SetStateAction<LoanProvider[]>) => void;
}) {
    const { currentUser } = useAuth();
    const { entityActions } = usePermissions();
    const [isProviderDialogOpen, setIsProviderDialogOpen] = useState(false);
    const [editingProvider, setEditingProvider] = useState<LoanProvider | null>(null);
    const [isAddProductDialogOpen, setIsAddProductDialogOpen] = useState(false);
    const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<{ type: 'provider' | 'product'; providerId: string; productId?: string } | null>(null);
    const { isPending, markPending } = usePending();

    const { toast } = useToast();

    const providerActions = entityActions('LoanProvider');
    const productActions = entityActions('LoanProduct');
    const canCreateProvider = !!providerActions.create;
    const canUpdateProvider = !!providerActions.update;
    const canDeleteProvider = !!providerActions.delete;
    const canCreateProduct = !!productActions.create;
    const canDeleteProduct = !!productActions.delete;

    // The user's own provider colour, else the first provider's. (This looked
    // for a provider named 'NIb Bank'; the row is 'NIB BANK', so it never matched.)
    const themeColor = useMemo(() => {
        const own = providers.find(p => p.name.toLowerCase() === currentUser?.providerName?.toLowerCase());
        return (own ?? providers[0])?.colorHex || '#fdb913';
    }, [currentUser, providers]);

    const providerIsPending = (provider: LoanProvider) =>
        isPending('providers', provider.id) || (provider as any).status === 'PENDING_APPROVAL';

    const deletingLabel = useMemo(() => {
        if (!deletingId) return '';
        const provider = providers.find(p => p.id === deletingId.providerId);
        if (deletingId.type === 'provider') return provider?.name ?? 'this provider';
        return provider?.products.find(p => p.id === deletingId.productId)?.name ?? 'this product';
    }, [deletingId, providers]);
    
    const handleOpenProviderDialog = (provider: LoanProvider | null = null) => {
        setEditingProvider(provider);
        setIsProviderDialogOpen(true);
    };

    const handleSaveProvider = async (providerData: Partial<Omit<LoanProvider, 'products' | 'dataProvisioningConfigs' | 'id' | 'initialBalance'>> & { id?: string }) => {
        const isEditing = !!providerData.id;
        if (isEditing && !canUpdateProvider) {
            toast({ title: 'Not authorized', description: 'You only have read access for Providers.', variant: 'destructive' });
            return;
        }
        if (!isEditing && !canCreateProvider) {
            toast({ title: 'Not authorized', description: 'You only have read access for Providers.', variant: 'destructive' });
            return;
        }
        try {
            const changeType = isEditing ? 'UPDATE' : 'CREATE';
            const entityId = isEditing ? providerData.id : undefined;

            let payload: Record<string, any>;
            if (isEditing && entityId) {
                const originalProvider = providerScalars(providers.find(p => p.id === entityId));
                if (!originalProvider) throw new Error('Provider not found');
                const fields = Object.keys(providerData).filter(k => k !== 'id');
                const diff = buildChangePayload(
                    { id: entityId, name: originalProvider.name },
                    originalProvider,
                    providerData,
                    fields,
                );
                if (diff.changedKeys.length === 0) {
                    toast({ title: 'Nothing to submit', description: 'You have not changed this provider.' });
                    return;
                }
                payload = diff.payload;
            } else {
                payload = { created: providerData };
            }

            await postPendingChange({
                entityType: 'LoanProvider',
                entityId,
                changeType,
                payload: JSON.stringify(payload)
            }, 'Failed to submit provider changes');

            if (isEditing && entityId) markPending('providers', entityId);

            toast({ title: 'Submitted for Approval', description: `Changes for ${providerData.name} have been submitted for review.` });
        } catch (error: any) {
             toast({ title: "Error", description: error.message, variant: 'destructive' });
        }
    };
    
    const handleOpenAddProductDialog = (providerId: string) => {
        setSelectedProviderId(providerId);
        setIsAddProductDialogOpen(true);
    };

    const handleAddProduct = async (newProductData: Omit<LoanProduct, 'id' | 'status' | 'serviceFee' | 'dailyFee' | 'penaltyRules' | 'providerId' > & { icon?: string }) => {
        if (!selectedProviderId) return;

        if (!canCreateProduct) {
            toast({ title: 'Not authorized', description: 'You only have read access for Products.', variant: 'destructive' });
            return;
        }

        try {
            await postPendingChange({
                entityType: 'LoanProduct',
                changeType: 'CREATE',
                payload: JSON.stringify({ created: { ...newProductData, providerId: selectedProviderId } })
            }, 'Failed to submit new product for approval');
            // Note: The product is not added to the local state, as it will only appear after approval.
            toast({ title: "Submitted for Approval", description: `${newProductData.name} has been submitted for review.` });
        } catch (error: any) {
             toast({ title: "Error", description: error.message, variant: 'destructive' });
        }
    };

    const handleUpdateProduct = (providerId: string, updatedProduct: Partial<LoanProduct> & { id: string }) => {
        onProvidersChange(produce(draft => {
            const provider = draft.find(p => p.id === providerId);
            if (provider) {
                const productIndex = provider.products.findIndex(p => p.id === updatedProduct.id);
                if (productIndex !== -1) {
                     provider.products[productIndex] = { ...provider.products[productIndex], ...updatedProduct };
                }
            }
        }));
    }

    
    const confirmDelete = () => {
        if (!deletingId) return;

        if (deletingId.type === 'provider') {
            handleDeleteProvider(deletingId.providerId);
        } else if (deletingId.type === 'product' && deletingId.productId) {
            handleDeleteProduct(deletingId.providerId, deletingId.productId);
        }
        setDeletingId(null);
    }
    
    const handleDeleteProvider = async (providerId: string) => {
        try {
             if (!canDeleteProvider) {
                 toast({ title: 'Not authorized', description: 'You only have read access for Providers.', variant: 'destructive' });
                 return;
             }
             const providerToDelete = providers.find(p => p.id === providerId);
             if (!providerToDelete) throw new Error('Provider not found');

             await postPendingChange({
                entityType: 'LoanProvider',
                entityId: providerId,
                changeType: 'DELETE',
                payload: JSON.stringify({ original: providerScalars(providerToDelete) })
            }, 'Could not submit deletion for approval.');

            markPending('providers', providerId);

            toast({ title: "Deletion Submitted", description: 'Provider deletion is pending approval.' });
        } catch (error: any) {
            toast({ title: "Error", description: error.message, variant: 'destructive' });
        }
    }
    
    const handleDeleteProduct = async (providerId: string, productId: string) => {
        try {
            if (!canDeleteProduct) {
                toast({ title: 'Not authorized', description: 'You only have read access for Products.', variant: 'destructive' });
                return;
            }
            const provider = providers.find(p => p.id === providerId);
            const productToDelete = provider?.products.find(p => p.id === productId);
            if (!productToDelete) throw new Error("Product not found");

             await postPendingChange({ 
                    entityType: 'LoanProduct',
                    entityId: productId,
                    changeType: 'DELETE',
                    // What the checker needs to recognise the product, not its
                    // full salary list (hundreds of KB).
                    payload: JSON.stringify({ original: {
                        id: productToDelete.id, name: productToDelete.name, providerId: productToDelete.providerId,
                        status: productToDelete.status, isSalaryAdvance: productToDelete.isSalaryAdvance,
                        minLoan: productToDelete.minLoan, maxLoan: productToDelete.maxLoan, duration: productToDelete.duration,
                    } })
                 }, 'Could not submit product deletion for approval.');

            // The server disables a product while its deletion is pending.
            markPending('products', productId);
            handleUpdateProduct(providerId, { id: productId, status: 'Disabled' });
            toast({ title: "Deletion Submitted", description: "Product deletion is pending approval." });
        } catch (error: any) {
             toast({ title: "Error", description: error.message, variant: 'destructive' });
        }
    }
    
    const addProviderButton = canCreateProvider && (
        <div className="mb-4 flex justify-end">
            <Button onClick={() => handleOpenProviderDialog(null)} style={{ backgroundColor: themeColor }} className="text-white">
                <PlusCircle className="mr-2 h-4 w-4" /> Add Provider
            </Button>
        </div>
    );

    if (providers.length === 0) {
        return (
            <>
                {addProviderButton}
                <Card>
                    <CardHeader>
                        <CardTitle>Providers &amp; Products</CardTitle>
                        <CardDescription>
                            {canCreateProvider
                                ? 'No providers available yet. Click "Add Provider" to create one.'
                                : 'No providers available. Please contact a Super Admin.'}
                        </CardDescription>
                    </CardHeader>
                </Card>
                <AddProviderDialog
                    isOpen={isProviderDialogOpen}
                    onClose={() => setIsProviderDialogOpen(false)}
                    onSave={handleSaveProvider}
                    provider={editingProvider}
                    primaryColor={themeColor}
                />
            </>
        );
    }

    return (
    <>
      {addProviderButton}
      <Accordion type="multiple" defaultValue={defaultOpenProviders(providers)} className="w-full space-y-4">
        {providers.map((provider) => (
          <AccordionItem value={provider.id} key={provider.id} className="border rounded-lg bg-card">
            <div className="flex items-center w-full p-4">
              <AccordionTrigger className="flex-1 p-0 hover:no-underline text-left" hideChevron>
                <div className="flex items-center gap-4">
                  <IconDisplay iconName={provider.icon} className="h-6 w-6" />
                  <div>
                    <div className="text-lg font-semibold">{provider.name}</div>
                    <div className="text-sm text-muted-foreground flex flex-wrap items-center gap-2">
                        {(provider.products || []).length} products
                        {providerIsPending(provider) && <PendingBadge />}
                    </div>
                  </div>
                </div>
              </AccordionTrigger>
              <div className="flex items-center gap-2 ml-auto pl-4">
                {canUpdateProvider && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="hover:bg-muted h-8 w-8"
                        aria-label={`Edit ${provider.name}`}
                        title="Edit provider"
                        disabled={providerIsPending(provider)}
                        onClick={(e) => { e.stopPropagation(); handleOpenProviderDialog(provider); }}
                    >
                        <Edit className="h-4 w-4" />
                    </Button>
                )}
                {canDeleteProvider && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="hover:bg-destructive hover:text-destructive-foreground h-8 w-8"
                        aria-label={`Delete ${provider.name}`}
                        title="Delete provider"
                        disabled={providerIsPending(provider)}
                        onClick={(e) => { e.stopPropagation(); setDeletingId({ type: 'provider', providerId: provider.id }); }}
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                )}
                <AccordionTrigger className="p-2" aria-label={`Show ${provider.name} products`} />
              </div>
            </div>
            <AccordionContent className="p-4 border-t">
              <div className="space-y-6">
                {(provider.products || []).length === 0 && (
                  <p className="text-sm text-muted-foreground">This provider has no products yet.</p>
                )}
                {(provider.products || []).map(product => (
                  <ProductSettingsForm
                    key={product.id}
                    product={product}
                    providerColor={provider.colorHex}
                    onDelete={() => setDeletingId({ type: 'product', providerId: provider.id, productId: product.id })}
                    onUpdate={(updatedFields) => handleUpdateProduct(provider.id, { id: product.id, ...updatedFields })}
                  />
                ))}
                {canCreateProduct && (
                    <Button 
                    variant="outline" 
                    className="w-full hover:text-white"
                    onClick={() => handleOpenAddProductDialog(provider.id)}
                    onMouseOver={(e) => { e.currentTarget.style.backgroundColor = provider.colorHex || themeColor; }}
                    onMouseOut={(e) => { e.currentTarget.style.backgroundColor = ''; }}
                    >
                    <PlusCircle className="mr-2 h-4 w-4" /> Add New Product
                    </Button>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
      <AddProviderDialog
        isOpen={isProviderDialogOpen}
        onClose={() => setIsProviderDialogOpen(false)}
        onSave={handleSaveProvider}
        provider={editingProvider}
        primaryColor={themeColor}
      />
      <AddProductDialog
        isOpen={isAddProductDialogOpen}
        onClose={() => setIsAddProductDialogOpen(false)}
        onAddProduct={handleAddProduct}
      />
      <AlertDialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Request deletion of {deletingLabel}?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingId?.type === 'product'
                ? 'This sends a deletion request to a checker. The product is disabled while the request is pending, and deletion cannot be undone once approved.'
                : 'This sends a deletion request to a checker. A provider that still has products cannot be deleted. Deletion cannot be undone once approved.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive hover:bg-destructive/90">Submit for Deletion</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
    );
}

type DailyFeeRule = FeeRule & { calculationBase?: 'principal' | 'compound' };

const FeeInput = ({ label, fee, onChange, isEnabled }: { label: string; fee: FeeRule; onChange: (fee: FeeRule) => void; isEnabled: boolean; }) => {
    return (
        <div className="flex flex-wrap items-center gap-2">
            <Label className={cn("w-28", !isEnabled && "text-muted-foreground/50")}>{label}</Label>
            <Select value={fee.type} onValueChange={(type: 'fixed' | 'percentage') => onChange({ ...fee, type })} disabled={!isEnabled}>
                <SelectTrigger className="w-32" disabled={!isEnabled} aria-label={`${label} type`}>
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="percentage">Percentage</SelectItem>
                    <SelectItem value="fixed">Fixed</SelectItem>
                </SelectContent>
            </Select>
            <div className="relative min-w-[8rem] flex-1">
                <Input
                    type="number"
                    min={0}
                    step="any"
                    value={fee.value ?? ''}
                    onChange={(e) => onChange({ ...fee, value: e.target.value === '' ? '' : Number(e.target.value) })}
                    placeholder="Enter value"
                    aria-label={`${label} value`}
                    className={cn(fee.type === 'percentage' ? "pr-8" : "")}
                    disabled={!isEnabled}
                />
                {fee.type === 'percentage' && <span className={cn("absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground", !isEnabled && "text-muted-foreground/50")}>%</span>}
            </div>
        </div>
    );
};

const DailyFeeInput = ({ label, fee, onChange, isEnabled }: { label: string; fee: DailyFeeRule; onChange: (fee: DailyFeeRule) => void; isEnabled: boolean; }) => {
    return (
        <div className="flex flex-col gap-2">
            <FeeInput
                label={label}
                fee={fee}
                isEnabled={isEnabled}
                onChange={(next) => onChange({
                    ...fee,
                    ...next,
                    calculationBase: next.type === 'fixed' ? undefined : fee.calculationBase || 'principal',
                })}
            />
            {isEnabled && fee.type === 'percentage' && (
                <div className="flex flex-wrap items-center gap-2 sm:pl-[120px]">
                    <Label className="w-32 text-sm text-muted-foreground">Calculation Base</Label>
                    <Select value={fee.calculationBase || 'principal'} onValueChange={(base: 'principal' | 'compound') => onChange({ ...fee, calculationBase: base })}>
                        <SelectTrigger className="min-w-[12rem] flex-1" aria-label="Daily fee calculation base">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="principal">Principal</SelectItem>
                            <SelectItem value="compound">Compound (Principal + Accrued)</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            )}
        </div>
    );
};

const PENALTY_GRID = 'grid grid-cols-2 gap-2 md:grid-cols-[5rem_5rem_minmax(10rem,1fr)_8rem_minmax(6rem,1fr)_2.5rem] md:items-center';

const PenaltyRuleRow = ({ rule, onChange, onRemove, isEnabled }: { rule: PenaltyRule, onChange: (rule: PenaltyRule) => void, onRemove: () => void, isEnabled: boolean }) => {
    return (
        <div className={cn(PENALTY_GRID, 'rounded-md border bg-background p-2 md:border-0 md:bg-transparent md:p-0')}>
            <Input
                type="number"
                min={0}
                value={rule.fromDay ?? ''}
                onChange={(e) => onChange({...rule, fromDay: e.target.value === '' ? '' : parseInt(e.target.value)})}
                placeholder="From day"
                aria-label="From day"
                disabled={!isEnabled}
            />
            <Input
                type="number"
                min={0}
                value={rule.toDay === Infinity ? '' : (rule.toDay ?? '')}
                onChange={(e) => onChange({...rule, toDay: e.target.value === '' ? null : parseInt(e.target.value)})}
                placeholder="To day (blank = no end)"
                aria-label="To day"
                disabled={!isEnabled}
            />
            <Select value={rule.type} onValueChange={(type: 'fixed' | 'percentageOfPrincipal' | 'percentageOfCompound') => onChange({ ...rule, type })} disabled={!isEnabled}>
                <SelectTrigger disabled={!isEnabled} aria-label="Penalty type">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="fixed">Fixed Amount</SelectItem>
                    <SelectItem value="percentageOfPrincipal">Percentage of Principal</SelectItem>
                    <SelectItem value="percentageOfCompound">Percentage of Compound</SelectItem>
                </SelectContent>
            </Select>
             <Select value={rule.frequency || 'daily'} onValueChange={(freq: 'daily' | 'one-time') => onChange({ ...rule, frequency: freq })} disabled={!isEnabled}>
                <SelectTrigger disabled={!isEnabled} aria-label="Penalty frequency">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="one-time">One Time</SelectItem>
                </SelectContent>
            </Select>
             <div className="relative">
                <Input
                    type="number"
                    min={0}
                    step="any"
                    value={rule.value ?? ''}
                    onChange={(e) => onChange({ ...rule, value: e.target.value === '' ? '' : Number(e.target.value) })}
                    placeholder="Value"
                    aria-label="Penalty value"
                    className={cn(rule.type !== 'fixed' ? "pr-8" : "")}
                    disabled={!isEnabled}
                />
                 {rule.type !== 'fixed' && <span className={cn("absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground", !isEnabled && "text-muted-foreground/50")}>%</span>}
            </div>
             <Button type="button" variant="ghost" size="icon" onClick={onRemove} className="justify-self-end text-destructive" disabled={!isEnabled} aria-label="Remove penalty rule"><Trash2 className="h-4 w-4" /></Button>
        </div>
    );
};

function LoanTiersForm({ product, onUpdate, locked }: {
    product: LoanProduct;
    onUpdate: (updatedProduct: Partial<LoanProduct>) => void;
    locked: boolean;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const tiers = product.loanAmountTiers || [];

    const handleTierChange = (index: number, field: keyof Omit<LoanAmountTier, 'id' | 'productId'>, value: string) => {
        if (locked) return;
        const newTiers = produce(tiers, draft => {
            draft[index] = { ...draft[index], [field]: value === '' ? '' : value } as any;
            // Keep ranges contiguous: the next tier starts one above this one's end.
            if (field === 'toScore' && index < draft.length - 1) {
                draft[index + 1] = { ...draft[index + 1], fromScore: (Number(value) || 0) + 1 };
            }
        });
        onUpdate({ loanAmountTiers: newTiers });
    };

    const handleAddTier = () => {
        if (locked) return;
        const lastTier = tiers[tiers.length - 1];
        const newFromScore = lastTier ? (Number(lastTier.toScore) || 0) + 1 : 0;
        const newTier: LoanAmountTier = {
            id: `tier-${Date.now()}`,
            productId: product.id,
            fromScore: newFromScore,
            toScore: newFromScore + 9,
            loanAmount: 0
        };
        onUpdate({ loanAmountTiers: [...tiers, newTier]});
    };

    const handleRemoveTier = (index: number) => {
        if (locked) return;
        onUpdate({ loanAmountTiers: tiers.filter((_, i) => i !== index) });
    };

    return (
         <Collapsible open={isOpen} onOpenChange={setIsOpen} className="space-y-2">
            <Card>
                <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer">
                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <CardTitle>Loan Amount Tiers</CardTitle>
                                <CardDescription>
                                    Loan amount a borrower can get for each credit-score range. {tiers.length ? `${tiers.length} tier(s) defined.` : 'No tiers defined.'}
                                </CardDescription>
                            </div>
                            <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform duration-200', isOpen && 'rotate-180')} />
                        </div>
                    </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <CardContent className="space-y-4 pt-0">
                         {tiers.map((tier, index) => (
                            <div key={tier.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-2 rounded-md bg-muted/50">
                                <Label htmlFor={`tier-from-${tier.id}`} className="w-20">From Score</Label>
                                <Input
                                    id={`tier-from-${tier.id}`}
                                    type="number"
                                    value={tier.fromScore ?? ''}
                                    onChange={(e) => handleTierChange(index, 'fromScore', e.target.value)}
                                    className="w-28"
                                    disabled={index > 0 || locked} // Only the first "from" is editable
                                />
                                <Label htmlFor={`tier-to-${tier.id}`} className="w-16">To Score</Label>
                                 <Input
                                    id={`tier-to-${tier.id}`}
                                    type="number"
                                    value={tier.toScore ?? ''}
                                    onChange={(e) => handleTierChange(index, 'toScore', e.target.value)}
                                    className="w-28"
                                    disabled={locked}
                                />
                                <Label htmlFor={`tier-amount-${tier.id}`} className="w-24">Loan Amount</Label>
                                 <Input
                                    id={`tier-amount-${tier.id}`}
                                    type="number"
                                    min={0}
                                    step="any"
                                    value={tier.loanAmount ?? ''}
                                    onChange={(e) => handleTierChange(index, 'loanAmount', e.target.value)}
                                    className="min-w-[8rem] flex-1"
                                    disabled={locked}
                                />
                                <Button type="button" variant="ghost" size="icon" onClick={() => handleRemoveTier(index)} className="text-destructive" disabled={locked} aria-label={`Remove tier ${index + 1}`}>
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        ))}
                         <Button type="button" variant="outline" onClick={handleAddTier} className="w-full" disabled={locked}>
                            <PlusCircle className="mr-2 h-4 w-4" /> Add Tier
                        </Button>
                    </CardContent>
                </CollapsibleContent>
            </Card>
        </Collapsible>
    );
}

// Fields the Fee & Tier tab submits.
const FEE_FIELDS = [
    'serviceFeeEnabled', 'serviceFee', 'dailyFeeEnabled', 'dailyFee',
    'penaltyRulesEnabled', 'penaltyRules', 'penaltyPerInstallment', 'loanAmountTiers',
] as const;

// Same shape for the saved product and the form, so untouched fields compare
// equal (e.g. a rule saved without `frequency` vs the form's 'daily' default).
const normalizeFeeConfig = (p: any) => {
    const fee = (f: any) => ({ type: f?.type || 'percentage', value: toNumberOrNull(f?.value) ?? 0 });
    const daily = p.dailyFee || {};
    return {
        serviceFeeEnabled: !!p.serviceFeeEnabled,
        serviceFee: fee(p.serviceFee),
        dailyFeeEnabled: !!p.dailyFeeEnabled,
        dailyFee: { ...fee(daily), calculationBase: (daily.type || 'percentage') === 'percentage' ? (daily.calculationBase || 'principal') : undefined },
        penaltyRulesEnabled: !!p.penaltyRulesEnabled,
        penaltyRules: (p.penaltyRules || []).map((r: any) => ({
            id: r.id,
            fromDay: toNumberOrNull(r.fromDay),
            toDay: r.toDay === Infinity ? null : toNumberOrNull(r.toDay),
            type: r.type,
            value: toNumberOrNull(r.value),
            frequency: r.frequency || 'daily',
        })),
        penaltyPerInstallment: p.isSalaryAdvance ? !!p.penaltyPerInstallment : undefined,
        loanAmountTiers: (p.loanAmountTiers || []).map((t: any) => ({
            fromScore: toNumberOrNull(t.fromScore),
            toScore: toNumberOrNull(t.toScore),
            loanAmount: toNumberOrNull(t.loanAmount),
        })),
    };
};

// Checks only the sections that changed, so a legacy value elsewhere doesn't
// block an unrelated edit. `raw` is the form state, to spot emptied inputs.
// Returns a message, or null when valid.
const findFeeConfigProblem = (
    c: ReturnType<typeof normalizeFeeConfig>,
    raw: any,
    changed: string[],
    maxLoan: number | null,
): string | null => {
    const has = (...keys: string[]) => keys.some(k => changed.includes(k));
    const checkFee = (label: string, enabled: boolean, fee: { type: string; value: number }, rawFee: any) => {
        if (!enabled) return null;
        if (rawFee?.value === '' || rawFee?.value === null || rawFee?.value === undefined) return `${label}: enter a value.`;
        if (fee.value < 0) return `${label} cannot be negative.`;
        if (fee.type === 'percentage' && fee.value > 100) return `${label} cannot be more than 100%.`;
        return null;
    };

    if (has('serviceFee', 'serviceFeeEnabled')) {
        const problem = checkFee('Service fee', c.serviceFeeEnabled, c.serviceFee, raw.serviceFee);
        if (problem) return problem;
    }
    if (has('dailyFee', 'dailyFeeEnabled')) {
        const problem = checkFee('Daily fee', c.dailyFeeEnabled, c.dailyFee, raw.dailyFee);
        if (problem) return problem;
    }
    if (c.penaltyRulesEnabled && has('penaltyRules', 'penaltyRulesEnabled')) {
        for (let i = 0; i < c.penaltyRules.length; i++) {
            const r = c.penaltyRules[i];
            const name = `Penalty rule ${i + 1}`;
            if (r.fromDay === null || !Number.isInteger(r.fromDay) || r.fromDay < 0) return `${name}: "From day" must be a whole number, 0 or more.`;
            if (r.toDay !== null && (!Number.isInteger(r.toDay) || r.toDay < r.fromDay)) return `${name}: "To day" must be blank or at least "From day".`;
            if (r.value === null || r.value < 0) return `${name}: enter a value of 0 or more.`;
            if (r.type !== 'fixed' && r.value > 100) return `${name}: a percentage cannot be more than 100.`;
        }
    }
    if (has('loanAmountTiers')) {
        for (let i = 0; i < c.loanAmountTiers.length; i++) {
            const t = c.loanAmountTiers[i];
            const name = `Tier ${i + 1}`;
            if (t.fromScore === null || t.toScore === null || t.loanAmount === null) return `${name}: fill in every field.`;
            if (!Number.isInteger(t.fromScore) || !Number.isInteger(t.toScore)) return `${name}: scores must be whole numbers.`;
            if (t.fromScore > t.toScore) return `${name}: "From Score" cannot be greater than "To Score".`;
            if (t.loanAmount <= 0) return `${name}: the loan amount must be greater than 0.`;
            // Salary-advance products store maxLoan 0, so only check a real maximum.
            if (maxLoan !== null && maxLoan > 0 && t.loanAmount > maxLoan) return `${name}: the loan amount cannot exceed the product maximum of ${maxLoan}.`;
            const prevTo = i > 0 ? c.loanAmountTiers[i - 1].toScore : null;
            if (prevTo !== null && t.fromScore <= prevTo) return `${name} overlaps the previous tier.`;
        }
    }
    return null;
};

function ProductConfiguration({ product, providerColor, onProductUpdate, taxRates }: {
    product: LoanProduct;
    providerColor?: string;
    onProductUpdate: (update: Partial<LoanProduct>) => void;
    taxRates: { serviceFee: number; interest: number };
}) {
    const { entityActions } = usePermissions();
    const { isPending, markPending } = usePending();
    const { toast } = useToast();
    const [isOpen, setIsOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const productActions = entityActions('LoanProduct');
    const canEditProduct = !!productActions.update;
    const productPending = isPending('products', product.id);
    const canEditFields = canEditProduct && !productPending;

    const parsedProduct = useMemo(() => {
        const serviceFee = safeParseJson(product, 'serviceFee', { type: 'percentage', value: 0 });
        const dailyFee = safeParseJson(product, 'dailyFee', { type: 'percentage', value: 0, calculationBase: 'principal' });
        const penaltyRules = safeParseJson(product, 'penaltyRules', []).map((r: any) => ({ ...r, frequency: r.frequency || 'daily' }));
        return {
            ...product,
            serviceFee,
            dailyFee,
            penaltyRules: penaltyRules as PenaltyRule[],
            penaltyPerInstallment: (product as any).penaltyPerInstallment ?? false,
        };
    }, [product]);

    // Local, unsubmitted edits. Kept apart from the product so a change made in
    // another tab (e.g. the status switch) doesn't wipe them.
    const [edits, setEdits] = useState<Record<string, any>>({});
    const config = useMemo(() => ({ ...parsedProduct, ...edits }) as typeof parsedProduct, [parsedProduct, edits]);
    const hasEdits = Object.keys(edits).length > 0;

    const handleUpdate = (update: Partial<LoanProduct>) => {
        if (!canEditFields) return;
        setEdits(prev => ({ ...prev, ...update }));
    };

    const handleAddPenaltyRule = () => {
        if (!canEditFields) return;
        const newRule: PenaltyRule = {
            id: `penalty-${Date.now()}`,
            fromDay: 1,
            toDay: null,
            type: 'fixed',
            value: 0,
            frequency: 'daily'
        };
        handleUpdate({ penaltyRules: [...config.penaltyRules, newRule] });
    };

    const handleRemovePenaltyRule = (ruleId: string) => {
        handleUpdate({ penaltyRules: config.penaltyRules.filter(r => r.id !== ruleId) });
    };

    const handleUpdatePenaltyRule = (ruleId: string, updatedRule: PenaltyRule) => {
        handleUpdate({ penaltyRules: config.penaltyRules.map(r => r.id === ruleId ? updatedRule : r) });
    };

    const handleSave = async () => {
        if (!canEditFields) {
            toast({ title: 'Not authorized', description: 'You only have read access for Products.', variant: 'destructive' });
            return;
        }

        const candidate = normalizeFeeConfig(config);
        const { changedKeys, payload } = buildChangePayload(
            { id: product.id, name: product.name, providerId: product.providerId },
            product,
            candidate,
            FEE_FIELDS,
            normalizeFeeConfig(parsedProduct),
        );
        if (changedKeys.length === 0) {
            toast({ title: 'Nothing to submit', description: 'You have not changed any fees, penalties or tiers.' });
            return;
        }

        const problem = findFeeConfigProblem(candidate, config, changedKeys, toNumberOrNull(product.maxLoan));
        if (problem) {
            toast({ title: 'Check the configuration', description: problem, variant: 'destructive' });
            return;
        }

        setIsSaving(true);
        try {
            await postPendingChange({
                entityType: 'LoanProduct',
                entityId: product.id,
                changeType: 'UPDATE',
                payload: JSON.stringify(payload)
            }, 'Failed to submit changes for approval.');

            markPending('products', product.id);
            if (!isSafeOnlyProductUpdate(payload)) onProductUpdate({ status: 'Disabled' });

            toast({
                title: 'Submitted for Approval',
                description: `Changes for ${product.name} are waiting for a checker. The product is disabled until then.`,
            });
        } catch (error: any) {
            toast({ title: 'Error', description: error.message, variant: 'destructive' });
        } finally {
            setIsSaving(false);
        }
    };

    const switchStyle = { '--provider-color': providerColor } as React.CSSProperties;

    return (
        <Collapsible open={isOpen} onOpenChange={setIsOpen} className="space-y-2">
            <CollapsibleTrigger asChild>
                 <button type="button" className="flex items-center justify-between w-full gap-4 px-4 py-2 border rounded-lg bg-background hover:bg-muted/50 transition-colors">
                    <div className="flex flex-wrap items-center gap-2 text-left">
                        <h4 className="text-sm font-semibold">{product.name}</h4>
                        {productPending && <PendingBadge />}
                        {hasEdits && !productPending && <Badge variant="secondary">Unsaved changes</Badge>}
                    </div>
                    <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform duration-200', isOpen && 'rotate-180')} />
                </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
                 <Card className="border-t-0 rounded-t-none">
                    <CardContent className="space-y-4 pt-6">
                        {productPending && (
                            <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
                                <Clock className="mt-0.5 h-4 w-4 shrink-0" />
                                A change to this product is waiting for approval. Fees and tiers are locked until a checker approves or rejects it.
                            </p>
                        )}
                        <div className="flex items-center justify-between border-b pb-4">
                            <div className="flex items-center gap-2">
                                <Label htmlFor={`serviceFeeEnabled-${config.id}`} className="font-medium">Service Fee</Label>
                                {taxRates.serviceFee > 0 && <Badge variant="outline" className="text-xs">Taxable ({taxRates.serviceFee}%)</Badge>}
                            </div>
                            <Switch
                                id={`serviceFeeEnabled-${config.id}`}
                                checked={!!config.serviceFeeEnabled}
                                onCheckedChange={(checked) => handleUpdate({ serviceFeeEnabled: checked })}
                                disabled={!canEditFields}
                                className="data-[state=checked]:bg-[--provider-color]"
                                style={switchStyle}
                            />
                        </div>
                        <FeeInput
                            label="Fee Details"
                            fee={config.serviceFee}
                            onChange={(fee) => handleUpdate({ serviceFee: fee })}
                            isEnabled={!!config.serviceFeeEnabled && canEditFields}
                        />

                        <div className="flex items-center justify-between border-b pb-4 pt-4">
                             <div className="flex items-center gap-2">
                                <Label htmlFor={`dailyFeeEnabled-${config.id}`} className="font-medium">Daily Fee</Label>
                                {taxRates.interest > 0 && <Badge variant="outline" className="text-xs">Taxable ({taxRates.interest}%)</Badge>}
                            </div>
                            <Switch
                                id={`dailyFeeEnabled-${config.id}`}
                                checked={!!config.dailyFeeEnabled}
                                onCheckedChange={(checked) => handleUpdate({ dailyFeeEnabled: checked })}
                                disabled={!canEditFields}
                                className="data-[state=checked]:bg-[--provider-color]"
                                style={switchStyle}
                            />
                        </div>
                        <DailyFeeInput
                            label="Fee Details"
                            fee={config.dailyFee}
                            onChange={(fee) => handleUpdate({ dailyFee: fee })}
                            isEnabled={!!config.dailyFeeEnabled && canEditFields}
                        />

                        <div className="flex items-center justify-between border-b pb-4 pt-4">
                            <Label htmlFor={`penaltyRulesEnabled-${config.id}`} className="font-medium">Penalty Rules</Label>
                            <Switch
                                id={`penaltyRulesEnabled-${config.id}`}
                                checked={!!config.penaltyRulesEnabled}
                                onCheckedChange={(checked) => handleUpdate({ penaltyRulesEnabled: checked })}
                                disabled={!canEditFields}
                                className="data-[state=checked]:bg-[--provider-color]"
                                style={switchStyle}
                            />
                        </div>
                        {config.isSalaryAdvance && (
                            <div className="flex items-center justify-between gap-4">
                                <div>
                                    <Label htmlFor={`penaltyPerInstallment-${config.id}`} className="font-medium">Apply Penalty Per Installment</Label>
                                    <p className="text-sm text-muted-foreground">Each installment uses its own due date.</p>
                                </div>
                                <Switch
                                    id={`penaltyPerInstallment-${config.id}`}
                                    checked={!!config.penaltyPerInstallment}
                                    onCheckedChange={(checked) => handleUpdate({ penaltyPerInstallment: checked })}
                                    disabled={!canEditFields}
                                    className="data-[state=checked]:bg-[--provider-color]"
                                    style={switchStyle}
                                />
                            </div>
                        )}
                        <div className="space-y-2 p-4 border rounded-md bg-muted/50">
                            {config.penaltyRules.length > 0 && (
                                <div className={cn(PENALTY_GRID, 'hidden text-xs font-medium text-muted-foreground md:grid')}>
                                    <span>From day</span><span>To day</span><span>Type</span><span>Frequency</span><span>Value</span><span />
                                </div>
                            )}
                            {config.penaltyRules.length === 0 && (
                                <p className="text-sm text-muted-foreground">No penalty rules. Days count from the due date; leave &ldquo;To day&rdquo; blank for no end.</p>
                            )}
                            {config.penaltyRules.map((rule) => (
                                <PenaltyRuleRow
                                    key={rule.id}
                                    rule={rule}
                                    onChange={(updatedRule) => handleUpdatePenaltyRule(rule.id, updatedRule)}
                                    onRemove={() => handleRemovePenaltyRule(rule.id)}
                                    isEnabled={!!config.penaltyRulesEnabled && canEditFields}
                                />
                            ))}
                            <Button type="button" variant="outline" size="sm" onClick={handleAddPenaltyRule} disabled={!config.penaltyRulesEnabled || !canEditFields}>
                                <PlusCircle className="h-4 w-4 mr-2" /> Add Penalty Rule
                            </Button>
                        </div>

                        <div className="pt-4">
                            <LoanTiersForm
                                product={config}
                                onUpdate={handleUpdate}
                                locked={!canEditFields}
                            />
                        </div>

                </CardContent>
                <CardFooter className="flex flex-wrap justify-end gap-2">
                        {hasEdits && !productPending && (
                            <Button type="button" variant="outline" size="sm" onClick={() => setEdits({})} disabled={isSaving}>
                                <Undo2 className="h-4 w-4 mr-2" /> Discard changes
                            </Button>
                        )}
                        <Button
                            type="button"
                            onClick={handleSave}
                            size="sm"
                            style={{ backgroundColor: providerColor }}
                            className="text-white"
                            disabled={!canEditFields || isSaving || !hasEdits}
                        >
                            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                            {productPending ? 'Pending Approval' : 'Submit for Approval'}
                        </Button>
                </CardFooter>
            </Card>
            </CollapsibleContent>
        </Collapsible>
    );
}

// Sums every active tax that applies to a component (fees are taxed by all of them).
const activeTaxRate = (taxes: Tax[], component: 'serviceFee' | 'interest') =>
    taxes
        .filter(t => (t.status ?? 'ACTIVE').toUpperCase() === 'ACTIVE')
        .filter(t => (safeParseJson({ appliedTo: t.appliedTo }, 'appliedTo', []) as string[]).includes(component))
        .reduce((sum, t) => sum + (Number(t.rate) || 0), 0);

function ConfigurationTab({ providers, onProductUpdate, taxConfigs }: {
    providers: LoanProvider[],
    onProductUpdate: (providerId: string, productId: string, update: Partial<LoanProduct>) => void;
    taxConfigs: Tax[];
}) {
    const taxRates = useMemo(() => ({
        serviceFee: activeTaxRate(taxConfigs, 'serviceFee'),
        interest: activeTaxRate(taxConfigs, 'interest'),
    }), [taxConfigs]);

    if (providers.length === 0) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Product Fee Configuration</CardTitle>
                    <CardDescription>
                        No providers available to configure.
                    </CardDescription>
                </CardHeader>
            </Card>
        );
    }

    return (
        <Accordion type="multiple" defaultValue={defaultOpenProviders(providers)} className="w-full space-y-4">
            {providers.map((provider) => (
                <AccordionItem value={provider.id} key={provider.id} className="border rounded-lg bg-card">
                    <AccordionTrigger className="flex w-full items-center justify-between p-4 hover:no-underline">
                        <div className="flex items-center gap-4">
                            <IconDisplay iconName={provider.icon} className="h-6 w-6" />
                            <div className="text-left">
                                <div className="text-lg font-semibold">{provider.name}</div>
                                <p className="text-sm text-muted-foreground">{(provider.products || []).length} products to configure</p>
                            </div>
                        </div>
                    </AccordionTrigger>
                    <AccordionContent className="p-4 border-t space-y-6">
                       {(provider.products || []).map(product => (
                            <ProductConfiguration
                                key={product.id}
                                product={product}
                                providerColor={provider.colorHex}
                                onProductUpdate={(update) => onProductUpdate(provider.id, product.id, update)}
                                taxRates={taxRates}
                            />
                       ))}
                    </AccordionContent>
                </AccordionItem>
            ))}
        </Accordion>
    );
}

const TAX_COMPONENTS = [
    { id: 'serviceFee', label: 'Service Fee' },
    { id: 'interest', label: 'Daily Fee (Interest)' },
];

// Read-only summary. The calculations apply every active tax row, so list
// them all (this used to show only the first row).
function TaxTab({ taxConfigs }: { taxConfigs: Tax[] }) {
    const { canModule } = usePermissions();
    const canOpenTaxPage = canModule('tax', 'read');

    return (
        <Card>
            <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1.5">
                    <CardTitle>Tax</CardTitle>
                    <CardDescription>Read-only summary. Each active tax is added on top of the fee types it applies to.</CardDescription>
                </div>
                {canOpenTaxPage && (
                    <Button asChild variant="outline" size="sm">
                        <Link href="/admin/tax">
                            <Pencil className="mr-2 h-4 w-4" />
                            Manage taxes
                        </Link>
                    </Button>
                )}
            </CardHeader>
            <CardContent>
                {taxConfigs.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No tax is configured, so fees are not taxed.</p>
                ) : (
                    <div className="overflow-x-auto rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead className="text-right">Rate</TableHead>
                                    <TableHead>Applied to</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {taxConfigs.map(tax => {
                                    const appliedTo = safeParseJson({ appliedTo: tax.appliedTo }, 'appliedTo', []) as string[];
                                    const status = tax.status ?? 'ACTIVE';
                                    const isActive = status.toUpperCase() === 'ACTIVE';
                                    return (
                                        <TableRow key={tax.id}>
                                            <TableCell className="font-medium">{tax.name || 'Unnamed tax'}</TableCell>
                                            <TableCell className="text-right tabular-nums">{tax.rate}%</TableCell>
                                            <TableCell>
                                                {appliedTo.length > 0 ? (
                                                    <div className="flex flex-wrap gap-1">
                                                        {appliedTo.map(id => (
                                                            <Badge key={id} variant="outline">{TAX_COMPONENTS.find(c => c.id === id)?.label ?? id}</Badge>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <span className="text-sm text-muted-foreground">Nothing (has no effect)</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-sm">{tax.isInclusive ? 'Inclusive (deducted from principal)' : 'Exclusive'}</TableCell>
                                            <TableCell>
                                                <Badge variant={isActive ? 'default' : 'secondary'} className={cn(isActive && 'bg-green-600')}>
                                                    {isActive ? 'Active' : status.replace(/_/g, ' ').toLowerCase()}
                                                </Badge>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

const readFileAsBase64 = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
        const base64 = String(reader.result || '').split(',')[1];
        if (base64) resolve(base64); else reject(new Error('Could not read the file.'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file.'));
    reader.readAsDataURL(file);
});

function EligibilityTab({ providers, onProductUpdate }: {
    providers: LoanProvider[],
    onProductUpdate: (providerId: string, productId: string, update: Partial<LoanProduct>) => void;
}) {
    const [viewingUpload, setViewingUpload] = useState<DataProvisioningUpload | null>(null);

    if (providers.length === 0) {
        return <Card><CardHeader><CardTitle>Eligibility</CardTitle><CardDescription>No providers available.</CardDescription></CardHeader></Card>;
    }

    return (
        <>
            <Accordion type="multiple" defaultValue={defaultOpenProviders(providers)} className="w-full space-y-4">
                {providers.map((provider) => (
                    <AccordionItem value={provider.id} key={provider.id} className="border rounded-lg bg-card">
                        <AccordionTrigger className="flex w-full items-center justify-between p-4 hover:no-underline">
                            <div className="flex items-center gap-4">
                                <IconDisplay iconName={provider.icon} className="h-6 w-6" />
                                <div className="text-left">
                                    <div className="text-lg font-semibold">{provider.name}</div>
                                    <p className="text-sm text-muted-foreground">Managing {(provider.products || []).length} products</p>
                                </div>
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="p-4 border-t space-y-6">
                            {(provider.products || []).map(product => (
                                <EligibilityProductCard
                                    key={product.id}
                                    provider={provider}
                                    product={product}
                                    onProductUpdate={(update) => onProductUpdate(provider.id, product.id, update)}
                                    onView={setViewingUpload}
                                />
                            ))}
                        </AccordionContent>
                    </AccordionItem>
                ))}
            </Accordion>
            {viewingUpload && (
                <UploadDataViewerDialog
                    key={viewingUpload.id}
                    upload={viewingUpload}
                    onClose={() => setViewingUpload(null)}
                />
            )}
        </>
    );
}

function EligibilityProductCard({ provider, product, onProductUpdate, onView }: {
    provider: LoanProvider;
    product: LoanProduct;
    onProductUpdate: (update: Partial<LoanProduct>) => void;
    onView: (upload: DataProvisioningUpload) => void;
}) {
    const { entityActions } = usePermissions();
    const { isPending, markPending } = usePending();
    const { toast } = useToast();

    const canUpdateProduct = !!entityActions('LoanProduct').update;
    const eligibilityActions = entityActions('EligibilityList');
    const canCreateList = !!eligibilityActions.create;
    const canDeleteList = !!eligibilityActions.delete;

    const productPending = isPending('products', product.id);
    const listPending = isPending('eligibility', product.id);

    // Switching on and picking a data source are staged here and take effect
    // when the uploaded list is approved (approval enables the allow-list).
    const [enabled, setEnabled] = useState(!!product.dataProvisioningEnabled);
    const [configId, setConfigId] = useState<string>(product.dataProvisioningConfigId || '');
    const [staged, setStaged] = useState<(DataProvisioningUpload & { fileContent: string }) | null>(null);
    const [busy, setBusy] = useState<null | 'reading' | 'submitting' | 'disabling' | 'deleting'>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);

    const configs = provider.dataProvisioningConfigs || [];
    const selectedConfig = configs.find(c => c.id === configId);
    const identifierColumn = selectedConfig?.columns?.find(c => c.isIdentifier)?.name;
    const currentList = product.eligibilityUpload && product.eligibilityUploadId ? product.eligibilityUpload : null;

    const handleToggle = async (checked: boolean) => {
        if (!canUpdateProduct) {
            toast({ title: 'Not authorized', description: 'You only have read access for Products.', variant: 'destructive' });
            return;
        }
        if (checked || !product.dataProvisioningEnabled) {
            // Staged until a list is approved.
            setEnabled(checked);
            if (!checked) setStaged(null);
            return;
        }
        // Turning off a live allow-list opens the product to everyone, so it
        // goes to a checker.
        setBusy('disabling');
        try {
            const { payload } = buildChangePayload(
                { id: product.id, name: product.name, providerId: product.providerId },
                product,
                { dataProvisioningEnabled: false },
                ['dataProvisioningEnabled'],
            );
            await postPendingChange({
                entityType: 'LoanProduct',
                entityId: product.id,
                changeType: 'UPDATE',
                payload: JSON.stringify(payload)
            }, 'Failed to submit changes for approval');
            markPending('products', product.id);
            toast({ title: 'Submitted for Approval', description: 'Turning off the allow-list is waiting for a checker. Until then the list still applies.' });
        } catch (error: any) {
            toast({ title: 'Error', description: error.message || 'Failed to submit the change.', variant: 'destructive' });
        } finally {
            setBusy(null);
        }
    };

    const handleFile = async (input: HTMLInputElement) => {
        const file = input.files?.[0];
        input.value = '';
        if (!file || !selectedConfig) return;
        if (!canCreateList) {
            toast({ title: 'Not authorized', description: 'You only have read access for Eligibility.', variant: 'destructive' });
            return;
        }
        if (!/\.xlsx$/i.test(file.name)) {
            toast({ title: 'Invalid file type', description: 'Use an .xlsx file.', variant: 'destructive' });
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            toast({ title: 'File too large', description: 'Maximum file size is 10MB.', variant: 'destructive' });
            return;
        }

        setBusy('reading');
        try {
            // Same check the approval runs, so a wrong file fails now rather
            // than when the checker approves it.
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.load(await file.arrayBuffer());
            const sheet = workbook.worksheets[0];
            const headers: string[] = [];
            sheet?.getRow(1).eachCell(cell => { headers.push(cellToText(cell.value).trim()); });
            if (identifierColumn && !headers.includes(identifierColumn)) {
                throw new Error(`The first row must contain the identifier column "${identifierColumn}". Found: ${headers.join(', ') || 'no headers'}.`);
            }
            if (!sheet || sheet.rowCount < 2) throw new Error('The file has no data rows.');

            setStaged({
                id: `temp-${file.lastModified}-${file.size}`,
                configId: selectedConfig.id,
                fileName: file.name,
                rowCount: sheet.rowCount - 1,
                uploadedAt: new Date().toISOString(),
                uploadedBy: 'you (not submitted)',
                fileContent: await readFileAsBase64(file),
            } as DataProvisioningUpload & { fileContent: string });
        } catch (error: any) {
            toast({ title: 'Could not use this file', description: error.message, variant: 'destructive' });
        } finally {
            setBusy(null);
        }
    };

    const handleSubmitList = async () => {
        if (!staged) return;
        setBusy('submitting');
        try {
            await postPendingChange({
                entityType: 'EligibilityList',
                entityId: product.id,
                changeType: 'CREATE',
                payload: JSON.stringify({
                    created: { configId: staged.configId, fileName: staged.fileName, fileContent: staged.fileContent, productId: product.id },
                }),
            }, 'Failed to submit eligibility list for approval.');
            markPending('eligibility', product.id);
            setStaged(null);
            toast({ title: 'Submitted for Approval', description: `Once approved, only borrowers on this list can apply for ${product.name}.` });
        } catch (error: any) {
            toast({ title: 'Error', description: error.message, variant: 'destructive' });
        } finally {
            setBusy(null);
        }
    };

    const handleDeleteList = async () => {
        setConfirmDelete(false);
        setBusy('deleting');
        try {
            const response = await fetch(`/api/settings/products/eligibility-filter?productId=${product.id}`, { method: 'DELETE' });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Failed to delete the list.');
            }
            onProductUpdate({ eligibilityFilter: null, eligibilityUploadId: null, eligibilityUpload: undefined });
            toast({ title: 'List deleted', description: `${product.name} is no longer restricted to an allow-list.` });
        } catch (error: any) {
            toast({ title: 'Error', description: error.message, variant: 'destructive' });
        } finally {
            setBusy(null);
        }
    };

    const switchLocked = !canUpdateProduct || productPending || busy !== null;
    const uploadLocked = !canCreateList || listPending || !selectedConfig || busy !== null;

    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-base">{product.name}</CardTitle>
                    {product.dataProvisioningEnabled && currentList
                        ? <Badge className="bg-green-600">Allow-list on</Badge>
                        : <Badge variant="secondary">Open to all eligible borrowers</Badge>}
                    {listPending && <PendingBadge />}
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex items-start space-x-2">
                    <Switch
                        id={`dataProvisioningEnabled-${product.id}`}
                        checked={enabled}
                        onCheckedChange={handleToggle}
                        className="data-[state=checked]:bg-[--provider-color]"
                        style={{ '--provider-color': provider.colorHex } as React.CSSProperties}
                        disabled={switchLocked}
                    />
                    <div>
                        <Label htmlFor={`dataProvisioningEnabled-${product.id}`}>Restrict to an eligibility allow-list</Label>
                        <p className="text-xs text-muted-foreground">
                            {product.dataProvisioningEnabled
                                ? 'Turning this off needs approval.'
                                : 'Takes effect when a checker approves the list you upload.'}
                        </p>
                    </div>
                </div>

                {enabled && (
                    <div className="space-y-4 sm:pl-8">
                        <div className="space-y-2">
                            <Label>Data source</Label>
                            {configs.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    This provider has no data sources yet. Create one on the{' '}
                                    <Link href="/admin/credit-score-engine" className="underline">Credit Score Engine</Link> page.
                                </p>
                            ) : (
                                <Select
                                    value={configId || undefined}
                                    onValueChange={setConfigId}
                                    disabled={listPending || busy !== null}
                                >
                                    <SelectTrigger className="w-full sm:max-w-sm">
                                        <SelectValue placeholder="Select a data source..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {configs.map(config => (
                                            <SelectItem key={config.id} value={config.id}>{config.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                            {selectedConfig && (
                                <p className="text-xs text-muted-foreground">
                                    Expected columns: {(selectedConfig.columns || []).map(c => c.name).join(', ') || 'none defined'}
                                    {identifierColumn && <> · borrowers are matched on <span className="font-medium">{identifierColumn}</span></>}
                                </p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor={`filter-upload-${product.id}`}>Upload list (.xlsx)</Label>
                            <Input
                                id={`filter-upload-${product.id}`}
                                type="file"
                                accept=".xlsx"
                                onChange={(e) => handleFile(e.currentTarget)}
                                disabled={uploadLocked}
                                className="max-w-sm cursor-pointer"
                            />
                            {listPending && <p className="text-xs text-muted-foreground">A list for this product is already waiting for approval.</p>}
                        </div>

                        {staged && (
                            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed p-3">
                                <div>
                                    <p className="font-medium">{staged.fileName}</p>
                                    <p className="text-sm text-muted-foreground">{staged.rowCount} rows · not submitted yet</p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <Button type="button" variant="outline" size="sm" onClick={() => onView(staged)}>Preview</Button>
                                    <Button type="button" variant="ghost" size="sm" onClick={() => setStaged(null)} disabled={busy !== null}>Remove</Button>
                                    <Button type="button" size="sm" onClick={handleSubmitList} disabled={busy !== null}>
                                        {busy === 'submitting' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Submit for Approval
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                <div className="space-y-2">
                    <Label>Approved list</Label>
                    {currentList ? (
                        <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3">
                            <div>
                                <p className="font-medium">{currentList.fileName}</p>
                                <p className="text-sm text-muted-foreground">
                                    {currentList.rowCount} rows · uploaded {format(new Date(currentList.uploadedAt), "MMM d, yyyy 'at' h:mm a")}
                                </p>
                            </div>
                            <div className="flex gap-2">
                                <Button type="button" variant="outline" size="sm" onClick={() => onView(currentList)}>View</Button>
                                {canDeleteList && (
                                    <Button type="button" variant="destructive" size="sm" onClick={() => setConfirmDelete(true)} disabled={busy !== null}>
                                        {busy === 'deleting' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Delete List
                                    </Button>
                                )}
                            </div>
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground">No eligibility list has been approved for this product.</p>
                    )}
                </div>
            </CardContent>

            <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-destructive" /> Delete the eligibility list for {product.name}?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            This takes effect immediately, without approval. With no list, the product is no longer restricted:
                            every borrower who passes the other checks can apply.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction className={buttonVariants({ variant: 'destructive' })} onClick={handleDeleteList}>Delete list</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Card>
    );
}

function LoanCycleTab({ providers }: { providers: LoanProvider[] }) {
    if (providers.length === 0) {
        return <Card><CardHeader><CardTitle>Loan Cycle Configuration</CardTitle><CardDescription>No providers available.</CardDescription></CardHeader></Card>;
    }
    return (
        <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
                Limits how much of their scored loan amount a borrower can take, based on their credit-score grade (rows)
                and how many qualifying loans they have had (columns). A borrower whose score is below every grade is not limited.
            </p>
            <Accordion type="multiple" defaultValue={defaultOpenProviders(providers)} className="w-full space-y-4">
                {providers.map((provider) => (
                     <AccordionItem value={provider.id} key={provider.id} className="border rounded-lg bg-card">
                         <AccordionTrigger className="flex w-full items-center justify-between p-4 hover:no-underline">
                            <div className="flex items-center gap-4">
                                <IconDisplay iconName={provider.icon} className="h-6 w-6" />
                                <div className="text-left">
                                    <div className="text-lg font-semibold">{provider.name}</div>
                                    <p className="text-sm text-muted-foreground">Configuring {(provider.products || []).length} products</p>
                                </div>
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="p-4 border-t space-y-6">
                            {(provider.products || []).map(product => (
                                 <LoanCycleForm
                                    key={product.id}
                                    product={product}
                                    providerColor={provider.colorHex}
                                />
                            ))}
                        </AccordionContent>
                     </AccordionItem>
                ))}
            </Accordion>
        </div>
    )
}

type CycleRangeDraft = { label: string; min: number | ''; max: number | '' };
type CycleGradeDraft = { label: string; minScore: number | ''; percentages: Array<number | ''> };

const LOAN_CYCLE_METRICS: Array<{ value: LoanCycleConfig['metric']; label: string }> = [
    { value: 'TOTAL_COUNT', label: 'Total loans count' },
    { value: 'PAID_ON_TIME', label: 'On-time repayments' },
    { value: 'PAID_EARLY', label: 'Early repayments' },
    { value: 'PAID_LATE', label: 'Late repayments' },
];

const toRangeDrafts = (ranges: any): CycleRangeDraft[] =>
    Array.isArray(ranges) ? ranges.map((r: any) => ({ label: r.label ?? `${r.min}-${r.max}`, min: r.min ?? '', max: r.max ?? '' })) : [];
const toGradeDrafts = (grades: any): CycleGradeDraft[] =>
    Array.isArray(grades) ? grades.map((g: any) => ({ label: g.label ?? '', minScore: g.minScore ?? '', percentages: Array.isArray(g.percentages) ? g.percentages : [] })) : [];

// Returns a message for the first problem, or null when the grid is usable.
const findLoanCycleProblem = (metric: string | null, ranges: CycleRangeDraft[], grades: CycleGradeDraft[]): string | null => {
    if (!metric) return 'Choose a progression metric.';
    if (ranges.length === 0) return 'Add at least one cycle range.';
    for (let i = 0; i < ranges.length; i++) {
        const r = ranges[i];
        const name = `Range ${i + 1}`;
        if (!r.label.trim()) return `${name}: enter a label.`;
        if (r.min === '' || r.max === '' || !Number.isInteger(r.min) || !Number.isInteger(r.max) || r.min < 0) return `${name}: min and max must be whole numbers, 0 or more.`;
        if (r.min > r.max) return `${name}: min cannot be greater than max.`;
        const prev = ranges[i - 1];
        if (prev && prev.max !== '' && r.min <= prev.max) return `${name} overlaps the range before it. List ranges from lowest to highest.`;
    }
    if (grades.length === 0) return 'Add at least one grade.';
    const scores = new Set<number>();
    for (let i = 0; i < grades.length; i++) {
        const g = grades[i];
        const name = g.label.trim() || `Grade ${i + 1}`;
        if (!g.label.trim()) return `Grade ${i + 1}: enter a label.`;
        if (g.minScore === '' || !Number.isFinite(g.minScore)) return `${name}: enter a minimum score.`;
        if (scores.has(g.minScore)) return `${name}: another grade already uses minimum score ${g.minScore}.`;
        scores.add(g.minScore);
        for (let c = 0; c < ranges.length; c++) {
            const p = g.percentages[c];
            if (p === '' || p === undefined || !Number.isFinite(p) || p < 0 || p > 100) return `${name}, ${ranges[c].label || `range ${c + 1}`}: enter a percentage from 0 to 100.`;
        }
    }
    return null;
};

function LoanCycleForm({ product, providerColor }: {
    product: LoanProduct,
    providerColor?: string;
}) {
    const { toast } = useToast();
    const { entityActions } = usePermissions();
    const { isPending, markPending } = usePending();
    const loanCycleActions = entityActions('LoanCycleConfig');
    const [loanCycleConfig, setLoanCycleConfig] = useState<LoanCycleConfig | null>(null);
    const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
    const [reloadKey, setReloadKey] = useState(0);
    const [editingMetric, setEditingMetric] = useState<LoanCycleConfig['metric'] | null>(null);
    const [editingEnabled, setEditingEnabled] = useState<boolean>(true);
    const [editingCycleRanges, setEditingCycleRanges] = useState<CycleRangeDraft[]>([]);
    const [editingGrades, setEditingGrades] = useState<CycleGradeDraft[]>([]);
    const [isSavingLoanCycle, setIsSavingLoanCycle] = useState(false);
    const [isOpen, setIsOpen] = useState(false);

    const pending = isPending('loanCycles', product.id);
    const canEditLoanCycle = loanCycleConfig ? loanCycleActions.update : loanCycleActions.create;
    // Saving before the current config loads could submit a CREATE over an
    // existing one, so the form stays locked until it has loaded.
    const loanCycleReadOnly = !canEditLoanCycle || pending || loadState !== 'ready';

    const resetDrafts = useCallback((config: LoanCycleConfig | null) => {
        setEditingMetric(config?.metric ?? null);
        setEditingEnabled(typeof config?.enabled === 'boolean' ? config.enabled : true);
        setEditingCycleRanges(toRangeDrafts(config?.cycleRanges));
        setEditingGrades(toGradeDrafts(config?.grades));
    }, []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`/api/settings/products/loan-cycle?productId=${product.id}`);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                if (cancelled) return;
                const config = data
                    ? {
                        ...data,
                        cycleRanges: typeof data.cycleRanges === 'string' ? JSON.parse(data.cycleRanges) : data.cycleRanges,
                        grades: typeof data.grades === 'string' ? JSON.parse(data.grades) : data.grades,
                    }
                    : null;
                setLoanCycleConfig(config);
                resetDrafts(config);
                setLoadState('ready');
            } catch {
                if (!cancelled) setLoadState('error');
            }
        })();
        return () => { cancelled = true; };
    }, [product.id, reloadKey, resetDrafts]);

    const addCycleRange = () => {
        setEditingCycleRanges(prev => [...prev, { label: `Range ${prev.length + 1}`, min: '', max: '' }]);
        setEditingGrades(prev => prev.map(g => ({ ...g, percentages: [...g.percentages, ''] })));
    };

    const removeCycleRange = (idx: number) => {
        setEditingCycleRanges(prev => prev.filter((_, i) => i !== idx));
        setEditingGrades(prev => prev.map(g => ({ ...g, percentages: g.percentages.filter((_, i) => i !== idx) })));
    };

    const updateCycleRangeField = (idx: number, field: 'label' | 'min' | 'max', value: string) => {
        setEditingCycleRanges(prev => prev.map((r, i) => i === idx ? { ...r, [field]: field === 'label' ? value : (value === '' ? '' : Number(value)) } : r));
    };

    const updateGradeField = (idx: number, field: 'label' | 'minScore', value: string) => {
        setEditingGrades(prev => prev.map((g, i) => i === idx ? { ...g, [field]: field === 'label' ? value : (value === '' ? '' : Number(value)) } : g));
    };

    const updateGradePercentage = (gradeIdx: number, colIdx: number, value: string) => {
        setEditingGrades(prev => prev.map((g, i) => {
            if (i !== gradeIdx) return g;
            const percentages = g.percentages.slice();
            percentages[colIdx] = value === '' ? '' : Number(value);
            return { ...g, percentages };
        }));
    };

    const addGrade = () => {
        setEditingGrades(prev => [...prev, { label: `Grade ${prev.length + 1}`, minScore: '', percentages: editingCycleRanges.map(() => '' as const) }]);
    };

    const removeGrade = (idx: number) => {
        setEditingGrades(prev => prev.filter((_, i) => i !== idx));
    };

    const handleSaveLoanCycle = async () => {
        if (loanCycleReadOnly) return;
        const problem = findLoanCycleProblem(editingMetric, editingCycleRanges, editingGrades);
        if (problem) {
            toast({ title: 'Check the loan cycle', description: problem, variant: 'destructive' });
            return;
        }
        const updated = {
            productId: product.id,
            metric: editingMetric,
            enabled: editingEnabled,
            cycleRanges: editingCycleRanges.map(r => ({ label: r.label.trim(), min: Number(r.min), max: Number(r.max) })),
            grades: editingGrades.map(g => ({ label: g.label.trim(), minScore: Number(g.minScore), percentages: g.percentages.map(p => Number(p)) })),
        };
        if (loanCycleConfig) {
            const saved = {
                productId: product.id,
                metric: loanCycleConfig.metric,
                enabled: typeof loanCycleConfig.enabled === 'boolean' ? loanCycleConfig.enabled : true,
                cycleRanges: loanCycleConfig.cycleRanges ?? [],
                grades: loanCycleConfig.grades ?? [],
            };
            if (JSON.stringify(saved) === JSON.stringify(updated)) {
                toast({ title: 'Nothing to submit', description: 'The loan cycle is unchanged.' });
                return;
            }
        }

        setIsSavingLoanCycle(true);
        try {
            const changeType = loanCycleConfig ? 'UPDATE' : 'CREATE';
            const payload = loanCycleConfig
                ? { original: { ...loanCycleConfig, name: product.name, providerId: product.providerId }, updated: { ...updated, name: product.name, providerId: product.providerId } }
                : { created: { ...updated, name: product.name, providerId: product.providerId } };

            await postPendingChange({ entityType: 'LoanCycleConfig', entityId: product.id, changeType, payload: JSON.stringify(payload) }, 'Failed to submit loan-cycle config for approval');

            markPending('loanCycles', product.id);
            toast({ title: 'Submitted for Approval', description: `The loan cycle for ${product.name} is waiting for a checker.` });
        } catch (err: any) {
            toast({ title: 'Error', description: err.message || String(err), variant: 'destructive' });
        } finally {
            setIsSavingLoanCycle(false);
        }
    }

    const statusBadge = loadState === 'loading'
        ? <Badge variant="secondary">Loading…</Badge>
        : loadState === 'error'
            ? <Badge variant="outline" className="border-destructive text-destructive">Couldn&apos;t load</Badge>
            : loanCycleConfig
                ? <Badge variant={loanCycleConfig.enabled === false ? 'secondary' : 'default'}>{loanCycleConfig.enabled === false ? 'Configured · off' : 'Configured'}</Badge>
                : <Badge variant="secondary">Not configured</Badge>;

    return (
         <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <CollapsibleTrigger asChild>
                 <button type="button" className="flex items-center justify-between w-full gap-4 px-4 py-2 border rounded-lg bg-background hover:bg-muted/50 transition-colors">
                    <div className="flex flex-wrap items-center gap-2 text-left">
                        <h4 className="text-sm font-semibold">{product.name}</h4>
                        {statusBadge}
                        {pending && <PendingBadge />}
                    </div>
                    <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform duration-200', isOpen && 'rotate-180')} />
                </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="p-4 border rounded-lg bg-background mt-2 space-y-4">
                {loadState === 'error' && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/50 p-3 text-sm">
                        <span>The current loan cycle couldn&apos;t be loaded, so editing is locked.</span>
                        <Button type="button" variant="outline" size="sm" onClick={() => { setLoadState('loading'); setReloadKey(k => k + 1); }}>Try again</Button>
                    </div>
                )}
                {pending && (
                    <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
                        <Clock className="mt-0.5 h-4 w-4 shrink-0" />
                        A loan-cycle change for this product is waiting for approval.
                    </p>
                )}

                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div className="space-y-2">
                        <Label>Progression metric</Label>
                        <Select onValueChange={(v) => setEditingMetric(v as LoanCycleConfig['metric'])} value={editingMetric ?? ''}>
                            <SelectTrigger className="w-56" disabled={loanCycleReadOnly}>
                                <SelectValue placeholder="Select metric" />
                            </SelectTrigger>
                            <SelectContent>
                                {LOAN_CYCLE_METRICS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">What a borrower&apos;s loan count is based on.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Switch id={`cycle-enabled-${product.id}`} checked={editingEnabled} onCheckedChange={(c) => setEditingEnabled(Boolean(c))} disabled={loanCycleReadOnly} />
                        <Label htmlFor={`cycle-enabled-${product.id}`}>Apply loan cycle limits</Label>
                    </div>
                </div>

                <div>
                    <Label>Cycle ranges</Label>
                    <p className="text-xs text-muted-foreground">Loan-count bands, lowest first. Counts above the last band use the last band.</p>
                    <div className="space-y-2 mt-2">
                        {editingCycleRanges.length === 0 && <div className="text-xs text-muted-foreground">No cycle ranges defined.</div>}
                        {editingCycleRanges.map((r, idx) => (
                            <div key={idx} className="flex flex-wrap items-center gap-2">
                                <Input placeholder="Label" aria-label={`Range ${idx + 1} label`} value={r.label} onChange={(e) => updateCycleRangeField(idx, 'label', e.target.value)} className="w-32" disabled={loanCycleReadOnly} />
                                <Input placeholder="Min" aria-label={`Range ${idx + 1} minimum`} type="number" min={0} value={String(r.min)} onChange={(e) => updateCycleRangeField(idx, 'min', e.target.value)} className="w-20" disabled={loanCycleReadOnly} />
                                <span className="text-sm text-muted-foreground">to</span>
                                <Input placeholder="Max" aria-label={`Range ${idx + 1} maximum`} type="number" min={0} value={String(r.max)} onChange={(e) => updateCycleRangeField(idx, 'max', e.target.value)} className="w-20" disabled={loanCycleReadOnly} />
                                <span className="text-sm text-muted-foreground">loans</span>
                                <Button type="button" variant="ghost" size="icon" aria-label={`Remove range ${idx + 1}`} onClick={() => removeCycleRange(idx)} disabled={loanCycleReadOnly}><Trash2 className="h-4 w-4"/></Button>
                            </div>
                        ))}
                        <Button type="button" variant="outline" size="sm" onClick={addCycleRange} disabled={loanCycleReadOnly}>
                            <PlusCircle className="h-4 w-4 mr-2"/> Add range
                        </Button>
                    </div>
                </div>

                <div>
                    <Label>Grades and percentages</Label>
                    <p className="text-xs text-muted-foreground">
                        Each cell is the % of the scored loan amount the borrower can take. A borrower gets the grade with the highest minimum score at or below their score.
                    </p>
                    <div className="mt-2 overflow-x-auto rounded border">
                        <table className="min-w-full bg-background text-sm">
                            <thead>
                                <tr className="text-left">
                                    <th className="px-2 py-2 font-medium">Grade</th>
                                    <th className="px-2 py-2 font-medium">Min score</th>
                                    {editingCycleRanges.map((r, idx) => (
                                        <th key={idx} className="px-2 py-2 font-medium whitespace-nowrap">{r.label || `${r.min}-${r.max}`} (%)</th>
                                    ))}
                                    <th className="px-2 py-2"><span className="sr-only">Actions</span></th>
                                </tr>
                            </thead>
                            <tbody>
                                {editingGrades.length === 0 && (
                                    <tr className="border-t"><td colSpan={editingCycleRanges.length + 3} className="px-2 py-4 text-center text-xs text-muted-foreground">No grades defined.</td></tr>
                                )}
                                {editingGrades.map((g, gIdx) => (
                                    <tr key={gIdx} className="border-t">
                                        <td className="px-2 py-2"><Input aria-label={`Grade ${gIdx + 1} label`} value={g.label} onChange={(e) => updateGradeField(gIdx, 'label', e.target.value)} className="w-28 h-8" disabled={loanCycleReadOnly} /></td>
                                        <td className="px-2 py-2"><Input aria-label={`Grade ${gIdx + 1} minimum score`} type="number" value={String(g.minScore)} onChange={(e) => updateGradeField(gIdx, 'minScore', e.target.value)} className="w-24 h-8" disabled={loanCycleReadOnly} /></td>
                                        {editingCycleRanges.map((r, cIdx) => (
                                            <td key={cIdx} className="px-2 py-2">
                                                <Input
                                                    aria-label={`${g.label || `Grade ${gIdx + 1}`} percentage for ${r.label || `range ${cIdx + 1}`}`}
                                                    type="number" min={0} max={100}
                                                    value={g.percentages[cIdx] === undefined ? '' : String(g.percentages[cIdx])}
                                                    onChange={(e) => updateGradePercentage(gIdx, cIdx, e.target.value)}
                                                    className="w-20 h-8"
                                                    disabled={loanCycleReadOnly}
                                                />
                                            </td>
                                        ))}
                                        <td className="px-2 py-2"><Button type="button" variant="ghost" size="icon" aria-label={`Remove ${g.label || `grade ${gIdx + 1}`}`} onClick={() => removeGrade(gIdx)} disabled={loanCycleReadOnly}><Trash2 className="h-4 w-4"/></Button></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={addGrade} disabled={loanCycleReadOnly} className="mt-2">
                        <PlusCircle className="h-4 w-4 mr-2"/> Add grade
                    </Button>
                </div>

                <div className="flex flex-wrap justify-end gap-2">
                    <Button variant="outline" type="button" onClick={() => resetDrafts(loanCycleConfig)} disabled={loanCycleReadOnly}>Reset</Button>
                    <Button type="button" onClick={handleSaveLoanCycle} disabled={isSavingLoanCycle || loanCycleReadOnly} style={{ backgroundColor: providerColor }} className="text-white">
                        {isSavingLoanCycle && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {pending ? 'Pending Approval' : 'Submit for Approval'}
                    </Button>
                </div>
            </CollapsibleContent>
        </Collapsible>
    )
}

const SETTINGS_TABS = [
    { value: 'providers', label: 'Providers & Products' },
    { value: 'configuration', label: 'Fee & Tier Configuration' },
    { value: 'loanCycles', label: 'Loan Cycle' },
    { value: 'eligibility', label: 'Eligibility' },
    { value: 'agreement', label: 'Borrower Agreement' },
    { value: 'tax', label: 'Tax' },
] as const;
type SettingsTab = (typeof SETTINGS_TABS)[number]['value'];

export function SettingsClient({ initialProviders, initialTaxConfigs, initialPending }: {
    initialProviders: LoanProvider[];
    initialTaxConfigs: Tax[];
    initialPending: SettingsPendingState;
}) {
    const [providers, setProviders] = useState(initialProviders);
    const [mounted, setMounted] = useState(false);
    const [tab, setTab] = useState<SettingsTab>('providers');
    const [pending, setPending] = useState(() => ({
        products: new Set(initialPending.products),
        eligibility: new Set(initialPending.eligibility),
        loanCycles: new Set(initialPending.loanCycles),
        terms: new Set(initialPending.terms),
        providers: new Set(initialPending.providers),
    }));

    useEffect(() => {
        setMounted(true);
        // ?tab= keeps the open tab across reloads and makes it linkable.
        const fromUrl = new URLSearchParams(window.location.search).get('tab');
        if (SETTINGS_TABS.some(t => t.value === fromUrl)) setTab(fromUrl as SettingsTab);
    }, []);

    const handleTabChange = (value: string) => {
        setTab(value as SettingsTab);
        // History API rather than router.replace: no server round trip, which
        // would re-run the page's provider query on every tab click.
        const url = new URL(window.location.href);
        url.searchParams.set('tab', value);
        window.history.replaceState(window.history.state, '', url);
    };

    const pendingApi = useMemo<PendingApi>(() => ({
        isPending: (kind, id) => !!id && pending[kind].has(id),
        markPending: (kind, id) => setPending(prev => {
            if (prev[kind].has(id)) return prev;
            const next = new Set(prev[kind]);
            next.add(id);
            return { ...prev, [kind]: next };
        }),
    }), [pending]);

    const onProductUpdate = useCallback((providerId: string, productId: string, updatedProduct: Partial<LoanProduct>) => {
        setProviders(produce(draft => {
            const provider = draft.find(p => p.id === providerId);
            if (provider) {
                const productIndex = provider.products.findIndex(p => p.id === productId);
                if (productIndex !== -1) {
                    const existingProduct = provider.products[productIndex];
                    provider.products[productIndex] = { ...existingProduct, ...updatedProduct };
                }
            }
        }));
    }, []);

    const handleProvidersChange = useCallback((updater: React.SetStateAction<LoanProvider[]>) => {
        setProviders(updater);
    }, []);

    return (
        <PendingContext.Provider value={pendingApi}>
            <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
                <div className="space-y-1">
                    <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
                    <p className="text-sm text-muted-foreground">
                        Providers, products, fees, eligibility and borrower terms. Changes go to a checker for approval unless a control says it applies immediately.
                    </p>
                </div>
                {/* Render Tabs only after client mount to avoid Radix/React hydration id mismatches */}
                {mounted ? (
                    <Tabs value={tab} onValueChange={handleTabChange} className="space-y-4">
                        <TabsList className="h-auto flex-wrap justify-start">
                            {SETTINGS_TABS.map(t => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)}
                        </TabsList>
                        <TabsContent value="providers">
                            <ProvidersTab providers={providers} onProvidersChange={handleProvidersChange} />
                        </TabsContent>
                        <TabsContent value="configuration">
                            <ConfigurationTab providers={providers} onProductUpdate={onProductUpdate} taxConfigs={initialTaxConfigs} />
                        </TabsContent>
                        <TabsContent value="loanCycles">
                            <LoanCycleTab providers={providers} />
                        </TabsContent>
                        <TabsContent value="eligibility">
                            <EligibilityTab providers={providers} onProductUpdate={onProductUpdate} />
                        </TabsContent>
                        <TabsContent value="agreement">
                            <AgreementsTab providers={providers} />
                        </TabsContent>
                        <TabsContent value="tax">
                            <TaxTab taxConfigs={initialTaxConfigs} />
                        </TabsContent>
                    </Tabs>
                ) : (
                    <div className="space-y-4" aria-hidden>
                        <Skeleton className="h-10 w-full max-w-3xl" />
                        <Skeleton className="h-24 w-full" />
                    </div>
                )}
            </div>
        </PendingContext.Provider>
    );
}

function AgreementsTab({ providers }: { providers: LoanProvider[] }) {
    if (providers.length === 0) {
        return <Card><CardHeader><CardTitle>Borrower Agreement</CardTitle><CardDescription>No providers available.</CardDescription></CardHeader></Card>;
    }
    return (
        <Accordion type="multiple" defaultValue={defaultOpenProviders(providers)} className="w-full space-y-4">
            {providers.map((provider) => (
                <AccordionItem value={provider.id} key={provider.id} className="border rounded-lg bg-card">
                    <AccordionTrigger className="flex w-full items-center justify-between p-4 hover:no-underline">
                        <div className="flex items-center gap-4">
                            <IconDisplay iconName={provider.icon} className="h-6 w-6" />
                            <div className="text-lg font-semibold">{provider.name}</div>
                        </div>
                    </AccordionTrigger>
                    <AccordionContent className="p-4 border-t">
                        <AgreementTab provider={provider} />
                    </AccordionContent>
                </AccordionItem>
            ))}
        </Accordion>
    );
}

function AgreementTab({ provider }: { provider: LoanProvider }) {
    const { toast } = useToast();
    const { entityActions } = usePermissions();
    const { isPending, markPending } = usePending();
    const termsActions = entityActions('TermsAndConditions');
    const canEditTerms = !!(termsActions.create || termsActions.update);
    const [activeTerms, setActiveTerms] = useState<TermsAndConditions | null>(null);
    const [draft, setDraft] = useState('');
    const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
    const [reloadKey, setReloadKey] = useState(0);
    const [isSaving, setIsSaving] = useState(false);
    const pending = isPending('terms', provider.id);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const response = await fetch(`/api/settings/terms?providerId=${provider.id}`);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const data = await response.json();
                if (cancelled) return;
                setActiveTerms(data);
                setDraft(data?.content ?? '');
                setLoadState('ready');
            } catch {
                // An empty editor here would look like "no terms yet" and invite
                // a submit that replaces the real ones, so show the failure.
                if (!cancelled) setLoadState('error');
            }
        })();
        return () => { cancelled = true; };
    }, [provider.id, reloadKey]);

    const savedContent = activeTerms?.content ?? '';
    const isDirty = draft !== savedContent;
    const locked = !canEditTerms || pending || isSaving;

    const handleSave = async () => {
        if (!canEditTerms) {
            toast({ title: 'Not authorized', description: 'You are not authorized to update terms and conditions.', variant: 'destructive' });
            return;
        }
        if (!draft.trim()) {
            toast({ title: 'Error', description: 'Terms and conditions content cannot be empty.', variant: 'destructive' });
            return;
        }
        if (!isDirty) {
            toast({ title: 'Nothing to submit', description: 'The text matches the current version.' });
            return;
        }
        setIsSaving(true);
        try {
            await postPendingChange({
                entityType: 'TermsAndConditions',
                entityId: activeTerms?.id || provider.id, // provider id for a first version
                changeType: 'UPDATE', // Always a new version
                payload: JSON.stringify({
                    original: activeTerms ? { id: activeTerms.id, providerId: provider.id, name: provider.name, version: activeTerms.version, content: activeTerms.content } : null,
                    updated: { providerId: provider.id, name: provider.name, content: draft },
                }),
            }, 'Failed to submit new terms for approval.');
            markPending('terms', provider.id);
            toast({ title: 'Submitted for Approval', description: 'The new version goes live once a checker approves it.' });
        } catch (error: any) {
            toast({ title: 'Error', description: error.message, variant: 'destructive' });
        } finally {
            setIsSaving(false);
        }
    };

    if (loadState === 'loading') {
        return <div className="space-y-4">
            <Skeleton className="h-8 w-1/4" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-10 w-32" />
        </div>
    }

    if (loadState === 'error') {
        return (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/50 p-3 text-sm">
                <span>The current terms couldn&apos;t be loaded.</span>
                <Button type="button" variant="outline" size="sm" onClick={() => { setLoadState('loading'); setReloadKey(k => k + 1); }}>Try again</Button>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor={`terms-content-${provider.id}`}>Terms and conditions</Label>
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    {activeTerms
                        ? <span>Version {activeTerms.version}{(activeTerms as any).publishedAt ? ` · published ${format(new Date((activeTerms as any).publishedAt), 'MMM d, yyyy')}` : ''}</span>
                        : <span>No version published yet</span>}
                    {pending && <PendingBadge />}
                    {isDirty && !pending && <Badge variant="secondary">Unsaved changes</Badge>}
                </div>
            </div>
            {pending && (
                <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
                    <Clock className="mt-0.5 h-4 w-4 shrink-0" />
                    A new version is waiting for approval. Borrowers still see the version shown here.
                </p>
            )}
             <Textarea
                id={`terms-content-${provider.id}`}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Enter the terms and conditions for your loan products here."
                rows={15}
                disabled={locked}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">{draft.length.toLocaleString()} characters</p>
                <div className="flex flex-wrap gap-2">
                    {isDirty && !pending && (
                        <Button type="button" variant="outline" onClick={() => setDraft(savedContent)} disabled={isSaving}>
                            <Undo2 className="h-4 w-4 mr-2" /> Discard changes
                        </Button>
                    )}
                    <Button type="button" onClick={handleSave} disabled={locked || !isDirty}>
                        {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin"/> : <Save className="h-4 w-4 mr-2" />}
                        {pending ? 'Pending Approval' : 'Submit New Version for Approval'}
                    </Button>
                </div>
            </div>
        </div>
    );
}

const VIEWER_PAGE_SIZE = 100;

function UploadDataViewerDialog({ upload, onClose }: {
    upload: DataProvisioningUpload | null;
    onClose: () => void;
}) {
    // A staged file (id "temp-…") is previewed from its content; a saved
    // upload is fetched page by page from the server.
    const isTemp = !!upload?.id.startsWith('temp-');
    const [page, setPage] = useState(1);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [serverRows, setServerRows] = useState<any[]>([]);
    const [serverTotalPages, setServerTotalPages] = useState(1);
    const [serverTotalRows, setServerTotalRows] = useState(0);
    const [tempHeaders, setTempHeaders] = useState<string[]>([]);
    const [tempRows, setTempRows] = useState<string[][]>([]);

    // All hooks run before any early return (this used to return before its
    // second effect, which breaks React's hook order). Callers key the dialog
    // by upload id, so the page resets for each file.
    useEffect(() => {
        if (!upload || isTemp) return;
        let cancelled = false;
        setIsLoading(true);
        setError(null);
        (async () => {
            try {
                const response = await fetch(`/api/settings/data-provisioning-uploads/view?uploadId=${upload.id}&page=${page}&limit=${VIEWER_PAGE_SIZE}`);
                if (!response.ok) throw new Error('Failed to fetch uploaded data');
                const result = await response.json();
                if (cancelled) return;
                setServerRows(result.data || []);
                setServerTotalPages(Math.max(1, result.totalPages || 1));
                setServerTotalRows(result.totalRows || 0);
            } catch (err: any) {
                if (!cancelled) setError(err.message || 'Failed to fetch uploaded data');
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [upload, isTemp, page]);

    useEffect(() => {
        if (!upload || !isTemp) return;
        const fileContent = (upload as any).fileContent as string | undefined;
        if (!fileContent) return;
        let cancelled = false;
        setIsLoading(true);
        setError(null);
        (async () => {
            try {
                const binary = atob(fileContent);
                const bytes = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                const workbook = new ExcelJS.Workbook();
                await workbook.xlsx.load(bytes.buffer as ArrayBuffer);
                const worksheet = workbook.worksheets[0];
                const columnCount = worksheet?.columnCount || 0;
                const headerRow = worksheet?.getRow(1);
                const headers = Array.from({ length: columnCount }, (_, i) => cellToText(headerRow?.getCell(i + 1).value) || `Column ${i + 1}`);
                const rows: string[][] = [];
                for (let r = 2; r <= (worksheet?.rowCount || 0); r++) {
                    const row = worksheet.getRow(r);
                    const values = Array.from({ length: columnCount }, (_, c) => cellToText(row.getCell(c + 1).value));
                    if (values.some(v => v.trim() !== '')) rows.push(values);
                }
                if (!cancelled) {
                    setTempHeaders(headers);
                    setTempRows(rows);
                }
            } catch (err) {
                console.error('Error parsing preview file:', err);
                if (!cancelled) setError('Could not read this file for preview.');
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [upload, isTemp]);

    if (!upload) return null;

    const totalPages = isTemp ? Math.max(1, Math.ceil(tempRows.length / VIEWER_PAGE_SIZE)) : serverTotalPages;
    const totalRows = isTemp ? tempRows.length : serverTotalRows;
    const headers = isTemp ? tempHeaders : (serverRows.length > 0 ? Object.keys(serverRows[0]) : []);
    const rows: string[][] = isTemp
        ? tempRows.slice((page - 1) * VIEWER_PAGE_SIZE, page * VIEWER_PAGE_SIZE)
        : serverRows.map(row => headers.map(h => cellToText(row[h])));
    const firstRow = totalRows === 0 ? 0 : (page - 1) * VIEWER_PAGE_SIZE + 1;
    const lastRow = Math.min(page * VIEWER_PAGE_SIZE, totalRows);

    return (
        <UIDialog open={!!upload} onOpenChange={(open) => { if (!open) onClose(); }}>
            <UIDialogContent className="max-w-4xl h-[90vh] flex flex-col">
                <UIDialogHeader>
                    <UIDialogTitle className="break-all">{isTemp ? 'Preview' : 'Viewing upload'}: {upload.fileName}</UIDialogTitle>
                    <UIDialogDescription>
                        {isTemp ? 'The file you selected. Nothing is saved until a checker approves it. ' : ''}
                        {totalRows > 0 ? `Rows ${firstRow}–${lastRow} of ${totalRows.toLocaleString()}.` : ''}
                    </UIDialogDescription>
                </UIDialogHeader>
                <div className="flex-grow overflow-auto border rounded-md">
                    {isLoading ? (
                        <div className="flex items-center justify-center h-full">
                            <Loader2 className="h-8 w-8 animate-spin" />
                        </div>
                    ) : error ? (
                        <div className="flex items-center justify-center h-full p-6 text-sm text-destructive">{error}</div>
                    ) : rows.length === 0 ? (
                        <div className="flex items-center justify-center h-full p-6 text-sm text-muted-foreground">No rows to show.</div>
                    ) : (
                        <Table>
                            <TableHeader className="sticky top-0 bg-background">
                                <TableRow>
                                    {headers.map((header, i) => (
                                        <TableHead key={i} className={cn(!isTemp && 'capitalize')}>
                                            {isTemp ? header : header.replace(/([A-Z])/g, ' $1')}
                                        </TableHead>
                                    ))}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {rows.map((row, rowIndex) => (
                                    <TableRow key={rowIndex}>
                                        {row.map((value, i) => <TableCell key={i}>{value}</TableCell>)}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </div>
                <UIDialogFooter className="flex-row flex-wrap items-center justify-between gap-2 pt-4 sm:justify-between">
                    <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1 || isLoading}>
                            <ChevronLeft className="h-4 w-4 mr-2" /> Previous
                        </Button>
                        <Button variant="outline" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages || isLoading}>
                            Next <ChevronRight className="h-4 w-4 ml-2" />
                        </Button>
                    </div>
                </UIDialogFooter>
            </UIDialogContent>
        </UIDialog>
    );
}
