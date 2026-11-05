

'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import ExcelJS from 'exceljs';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { PlusCircle, Trash2, Save, History, Loader2 as Loader, Info, GripVertical, Upload, Edit, FileClock, ChevronRight, ChevronLeft, CheckCircle, XCircle, Clock, Eye, RotateCcw } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Rule, ScoringParameter, DataProvisioningConfig, DataColumn, DataProvisioningUpload } from '@/lib/types';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
  DialogDescription,
} from '@/components/ui/dialog';
import { ScorePreview } from '@/components/loan/score-preview';
import { useToast } from '@/hooks/use-toast';
import { postPendingChange } from '@/lib/fetch-utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import type { LoanProduct, LoanProvider } from '@/lib/types';
import { format } from 'date-fns';
import { produce } from 'immer';
import { cn } from '@/lib/utils';
import { Separator } from '../ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Badge } from '../ui/badge';
import { Textarea } from '../ui/textarea';
import { usePermissions } from '@/hooks/use-permissions';
import { StatementParametersCard } from './statement-parameters-card';
import { DataFetchSettingsCard } from './data-fetch-settings-card';
import { StatementFiguresCard } from './statement-figures-card';


export interface ScoringHistoryItem {
    id: string;
    savedAt: Date;
    parameters: ScoringParameter[];
    appliedProducts: { product: { name: string } }[];
}

interface CustomParameterType {
    value: string;
    label: string;
    type?: 'select' | 'text' | 'number';
    options?: string[];
}

const RuleRow = ({ rule, onUpdate, onRemove, color, maxScore, paramFieldInfo, readOnly }: { 
    rule: Rule; 
    onUpdate: (updatedRule: Rule) => void; 
    onRemove: () => void; 
    color?: string, 
    maxScore: number,
    paramFieldInfo?: CustomParameterType,
    readOnly?: boolean
}) => {
    
    const [min, max] = useMemo(() => {
        const parts = (rule.value || '').split('-');
        return [parts[0] || '', parts[1] || ''];
    }, [rule.value]);

    const handleRangeChange = (part: 'min' | 'max') => (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        const currentMin = part === 'min' ? value : min;
        const currentMax = part === 'max' ? value : max;
        onUpdate({ ...rule, value: `${currentMin}-${currentMax}` });
    }
    
    const isScoreInvalid = maxScore !== undefined && rule.score > maxScore;
    
    const renderValueInput = () => {
        if (paramFieldInfo?.type === 'select' && rule.condition === '==') {
            return (
                <Select value={rule.value || ''} onValueChange={(value) => onUpdate({...rule, value })}>
                    <SelectTrigger className="flex-1 shadow-sm focus-visible:ring-2 focus-visible:ring-[--ring-color]" style={{'--ring-color': color} as React.CSSProperties} disabled={!!readOnly}>
                        <SelectValue placeholder="Select a value" />
                    </SelectTrigger>
                    <SelectContent>
                        {paramFieldInfo.options?.map(option => (
                            <SelectItem key={option} value={option}>{option}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            );
        }

        if (rule.condition === 'between') {
            return (
                <div className="flex items-center gap-2 flex-1">
                    <Input
                        placeholder="Min"
                        value={min}
                        onChange={handleRangeChange('min')}
                        className={cn("shadow-sm focus-visible:ring-2 focus-visible:ring-[--ring-color]", (!min.trim() || (!!max.trim() && parseFloat(min) >= parseFloat(max))) && 'border-destructive')}
                        disabled={!!readOnly}
                    />
                    <span>-</span>
                    <Input
                        placeholder="Max"
                        value={max}
                        onChange={handleRangeChange('max')}
                        className={cn("shadow-sm focus-visible:ring-2 focus-visible:ring-[--ring-color]", (!max.trim() || (!!min.trim() && parseFloat(min) >= parseFloat(max))) && 'border-destructive')}
                        disabled={!!readOnly}
                    />
                </div>
            );
        }

        return (
            <Input
                placeholder="e.g., 30 or High School"
                value={rule.value || ''}
                onChange={(e) => onUpdate({ ...rule, value: e.target.value })}
                className={cn("flex-1 shadow-sm focus-visible:ring-2 focus-visible:ring-[--ring-color]", !rule.value.trim() && 'border-destructive')}
                disabled={!!readOnly}
            />
        );
    }
    
    return (
        <div className="flex flex-col gap-2 p-2 bg-muted/50 rounded-md" style={{'--ring-color': color} as React.CSSProperties}>
            <div className="flex items-center gap-2">
                <Select value={rule.condition} onValueChange={(value) => onUpdate({...rule, condition: value})}>
                    <SelectTrigger className="w-[150px] shadow-sm focus:ring-2 focus:ring-[--ring-color]" disabled={!!readOnly}>
                        <SelectValue placeholder="Condition" />
                    </SelectTrigger>
                    <SelectContent>
                         {paramFieldInfo?.type === 'select' ? (
                            <>
                                <SelectItem value="==">Is Equal To</SelectItem>
                                <SelectItem value="!=">Is Not Equal To</SelectItem>
                            </>
                        ) : (
                            <>
                                <SelectItem value=">">&gt; (Greater Than)</SelectItem>
                                <SelectItem value="<">&lt; (Less Than)</SelectItem>
                                <SelectItem value=">=">&gt;= (Greater or Equal)</SelectItem>
                                <SelectItem value="<=">&lt;= (Less or Equal)</SelectItem>
                                <SelectItem value="==">== (Equal)</SelectItem>
                                <SelectItem value="!=">!= (Not Equal)</SelectItem>
                                <SelectItem value="between">Between</SelectItem>
                            </>
                        )}
                    </SelectContent>
                </Select>

                {renderValueInput()}
                
                <Input
                    type="number"
                    placeholder="Score"
                    value={rule.score}
                    onChange={(e) => onUpdate({ ...rule, score: parseInt(e.target.value) || 0 })}
                    className={cn("w-[100px] shadow-sm focus-visible:ring-2 focus-visible:ring-[--ring-color]", isScoreInvalid && 'border-destructive')}
                    disabled={!!readOnly}
                />
                <Button variant="ghost" size="icon" onClick={onRemove} className="hover:bg-destructive hover:text-destructive-foreground" disabled={!!readOnly}>
                    <Trash2 className="h-4 w-4" />
                </Button>
            </div>
             {isScoreInvalid && <p className="text-xs text-destructive px-1">{`Score cannot exceed the parameter's weight of ${maxScore}.`}</p>}
        </div>
    );
};


interface CreditScoreEngineClientProps {
    initialProviders: LoanProvider[];
    initialScoringParameters: ScoringParameter[];
    initialPendingChanges?: PendingScoringChange[];
}

/** A scoring change awaiting approval (loaded by the page). */
export interface PendingScoringChange {
    id: string;
    providerId: string;
    createdAt: string;
    /** Null for a change just submitted from this page. */
    submittedBy: string | null;
}

// Rules compared by what they do, ignoring ids: tells an edit from the approved rules.
const rulesKey = (parameters: ScoringParameter[]) =>
    JSON.stringify(parameters.map(p => ({
        name: p.name,
        weight: Number(p.weight),
        rules: (p.rules || []).map(r => ({ condition: r.condition, value: String(r.value ?? ''), score: Number(r.score) })),
    })));

const byProvider = (parameters: ScoringParameter[]) =>
    parameters.reduce<Record<string, ScoringParameter[]>>((acc, p) => {
        (acc[p.providerId] ||= []).push(p);
        return acc;
    }, {});

// The highest score the rules can give: each parameter's best rule, capped at its weight.
const highestPossibleScore = (parameters: ScoringParameter[]) =>
    parameters.reduce((sum, param) => {
        const best = Math.max(0, ...(param.rules || []).map(r => Number(r.score) || 0));
        return sum + Math.max(0, Math.min(best, Number(param.weight) || 0));
    }, 0);

// Attributes it is discriminatory to score on. Still selectable, but flagged in the editor.
const PROTECTED_FIELDS = new Set(['gender', 'sex', 'nationality', 'maritalstatus', 'religion', 'ethnicity', 'tribe', 'race', 'disability']);
const isProtectedField = (name: string) => PROTECTED_FIELDS.has(name.toLowerCase().replace(/[^a-z0-9]/g, ''));

const isNumber = (value: string) => value.trim() !== '' && !isNaN(Number(value));

/**
 * What has to be fixed before the rules can be submitted, read the way evaluateCondition
 * (lib/utils.ts) reads them: comparisons need a number, a range is "min-max" with the
 * minimum below the maximum (no negative numbers), equality needs a value, and no rule
 * may score above its parameter's weight.
 */
function draftProblems(parameters: ScoringParameter[], fields: CustomParameterType[]): string[] {
    const problems: string[] = [];
    if (parameters.length === 0) problems.push('Add at least one parameter.');
    const known = new Set(fields.map(f => f.value));
    const seen = new Set<string>();
    parameters.forEach((param, index) => {
        const label = param.name || `Parameter ${index + 1}`;
        if (!param.name) problems.push(`${label}: choose a field.`);
        else if (fields.length > 0 && !known.has(param.name)) problems.push(`${label}: this field is no longer available.`);
        if (param.name && seen.has(param.name.toLowerCase())) problems.push(`${label}: used more than once (it would be counted twice).`);
        seen.add(param.name.toLowerCase());
        const weight = Number(param.weight);
        if (!Number.isInteger(weight) || weight <= 0) problems.push(`${label}: the weight must be a whole number above 0.`);
        if (!param.rules?.length) problems.push(`${label}: add at least one rule.`);
        (param.rules || []).forEach((rule, ruleIndex) => {
            const ruleLabel = `${label}, rule ${ruleIndex + 1}`;
            const value = String(rule.value ?? '');
            if (rule.condition === 'between') {
                const [min = '', max = '', extra] = value.split('-');
                if (extra !== undefined || !isNumber(min) || !isNumber(max)) problems.push(`${ruleLabel}: enter both ends of the range as numbers.`);
                else if (Number(min) >= Number(max)) problems.push(`${ruleLabel}: the range minimum must be below its maximum.`);
            } else if (['>', '<', '>=', '<='].includes(rule.condition) && !isNumber(value)) {
                problems.push(`${ruleLabel}: "${rule.condition}" needs a number.`);
            } else if (!value.trim()) {
                problems.push(`${ruleLabel}: enter a value.`);
            }
            const score = Number(rule.score);
            if (!Number.isInteger(score) || score < 0) problems.push(`${ruleLabel}: the score must be a whole number of 0 or more.`);
            else if (Number.isInteger(weight) && score > weight) problems.push(`${ruleLabel}: the score cannot be above the weight (${weight}).`);
        });
    });
    return problems;
}

/** Scored products whose loan amount tiers stop below `maxScore`: borrowers above the top tier get no amount. */
function tierWarnings(products: LoanProduct[], maxScore: number): string[] {
    return products.flatMap(product => {
        const tiers = product.loanAmountTiers || [];
        if (tiers.length === 0) return [];
        const top = Math.max(...tiers.map(t => Number(t.toScore)));
        return maxScore > top
            ? [`"${product.name}": loan amount tiers end at score ${top}, so borrowers scoring ${top + 1} to ${maxScore} would be declined.`]
            : [];
    });
}

/** A rule as a short phrase: "> 5000", "between 1000 and 5000". */
const describeRule = (rule: { condition: string; value: string }) => {
    if (rule.condition === 'between') {
        const [min = '', max = ''] = String(rule.value ?? '').split('-');
        return `between ${min} and ${max}`;
    }
    return `${rule.condition} ${rule.value}`;
};

export function CreditScoreEngineClient({ initialProviders, initialScoringParameters, initialPendingChanges = [] }: CreditScoreEngineClientProps) {
    const [providers, setProviders] = useState(initialProviders);
    const [selectedProviderId, setSelectedProviderId] = useState<string>('');
    const [tab, setTab] = useState('scorecard');

    // Global state for all params
    const [allParameters, setAllParameters] = useState<ScoringParameter[]>(initialScoringParameters);
    // The rules last approved, per provider: what an edit is compared with and sent as `original`.
    const baseline = useMemo(() => byProvider(initialScoringParameters), [initialScoringParameters]);
    const [pendingChanges, setPendingChanges] = useState<PendingScoringChange[]>(initialPendingChanges);
    const [allDataConfigs, setAllDataConfigs] = useState<DataProvisioningConfig[]>(initialProviders.flatMap(p => p.dataProvisioningConfigs || []));

    const [customParams, setCustomParams] = useState<CustomParameterType[]>([]);
    const [statementMonths, setStatementMonths] = useState(6);
    const [isSaving, setIsSaving] = useState(false);
    const [isHistoryLoading, setIsHistoryLoading] = useState(false);
    const [scoringHistory, setScoringHistory] = useState<ScoringHistoryItem[]>([]);
    const [isApplyDialogOpen, setIsApplyDialogOpen] = useState(false);
    const [restoringHistoryItem, setRestoringHistoryItem] = useState<ScoringHistoryItem | null>(null);
    const [viewingHistoryItem, setViewingHistoryItem] = useState<ScoringHistoryItem | null>(null);
    const [showProblems, setShowProblems] = useState(false);

    const { toast } = useToast();
    const { entityActions } = usePermissions();
    const scoringActions = entityActions('ScoringRules');
    const canEditScoring = scoringActions.create || scoringActions.update;
    const scoringReadOnly = !canEditScoring;

    const fetchCustomParams = useCallback(async (providerId: string) => {
        try {
            const response = await fetch(`/api/settings/custom-parameters?providerId=${providerId}`);
            if (!response.ok) throw new Error('Failed to fetch custom parameters');
            const data = await response.json();
            setCustomParams(data);
        } catch (error) {
            toast({ title: "Error", description: "Could not fetch custom parameters.", variant: "destructive" });
        }
    }, [toast]);

    const fetchProviderData = useCallback(async () => {
        if (!selectedProviderId) return;
        setIsHistoryLoading(true);
        try {
            await fetchCustomParams(selectedProviderId);
            const [historyResponse, configsResponse] = await Promise.all([
                fetch(`/api/scoring-history?providerId=${selectedProviderId}`),
                fetch(`/api/settings/data-provisioning?providerId=${selectedProviderId}`)
            ]);

            if (!historyResponse.ok) throw new Error('Failed to fetch scoring history');
            const historyData = await historyResponse.json();
            setScoringHistory(historyData);

            if (!configsResponse.ok) throw new Error('Failed to fetch data configs');
            const configsData = await configsResponse.json();
            setAllDataConfigs(prev => [...prev.filter(c => c.providerId !== selectedProviderId), ...configsData]);

        } catch (error) {
            toast({ title: "Error", description: "Could not fetch configuration data.", variant: "destructive" });
        } finally {
            setIsHistoryLoading(false);
        }
    }, [selectedProviderId, fetchCustomParams, toast]);

    useEffect(() => {
        if (providers.length > 0 && !selectedProviderId) {
            setSelectedProviderId(providers[0].id);
        }
    }, [providers, selectedProviderId]);

    useEffect(() => {
        fetchProviderData();
    }, [selectedProviderId, fetchProviderData]);

    const themeColor = useMemo(() => providers.find(p => p.id === selectedProviderId)?.colorHex || '#fdb913', [providers, selectedProviderId]);

    // Memoized filters for the currently selected provider
    const currentParameters = useMemo(() => allParameters.filter(p => p.providerId === selectedProviderId), [allParameters, selectedProviderId]);
    const currentDataConfigs = useMemo(() => allDataConfigs.filter(c => c.providerId === selectedProviderId), [allDataConfigs, selectedProviderId]);
    const currentProvider = providers.find(p => p.id === selectedProviderId);
    // Salary advance products take their limit from the salary list, not the score.
    const scoredProducts = useMemo(() => (currentProvider?.products || []).filter(p => !p.isSalaryAdvance), [currentProvider]);
    const salaryAdvanceCount = (currentProvider?.products || []).length - scoredProducts.length;

    const approvedParameters = useMemo(() => baseline[selectedProviderId] ?? [], [baseline, selectedProviderId]);
    const approvedKey = rulesKey(approvedParameters);
    const isDirty = rulesKey(currentParameters) !== approvedKey;
    const anyDirty = useMemo(() => {
        const edited = byProvider(allParameters);
        const ids = new Set([...Object.keys(edited), ...Object.keys(baseline)]);
        return [...ids].some(id => rulesKey(edited[id] ?? []) !== rulesKey(baseline[id] ?? []));
    }, [allParameters, baseline]);
    const pending = pendingChanges.find(c => c.providerId === selectedProviderId) ?? null;
    const problems = useMemo(() => draftProblems(currentParameters, customParams), [currentParameters, customParams]);
    const maxScore = highestPossibleScore(currentParameters);
    const tierProblems = useMemo(() => tierWarnings(scoredProducts, maxScore), [scoredProducts, maxScore]);

    // Versions are listed newest first; version 1 is the oldest. The newest one holding the
    // approved rules is the one in effect (every product of the provider is scored with it).
    const versionOf = (item: ScoringHistoryItem) => scoringHistory.length - scoringHistory.indexOf(item);
    const currentVersionItem = useMemo(
        () => scoringHistory.find(item => Array.isArray(item.parameters) && rulesKey(item.parameters) === approvedKey) ?? null,
        [scoringHistory, approvedKey],
    );

    // Edits live in this page only: warn before leaving with unsaved changes.
    useEffect(() => {
        if (!anyDirty) return;
        const warn = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = '';
        };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [anyDirty]);

    // Memoized setter function for the current provider
    const setCurrentParameters = (updater: React.SetStateAction<ScoringParameter[]>) => {
        setAllParameters(prevAll => {
            const otherProviderParams = prevAll.filter(p => p.providerId !== selectedProviderId);
            const currentProviderParams = prevAll.filter(p => p.providerId === selectedProviderId);
            const updated = typeof updater === 'function' ? updater(currentProviderParams) : updater;
            return [...otherProviderParams, ...updated];
        });
    };

    const handleAddParameter = () => {
        if (!selectedProviderId) return;
        if (scoringReadOnly) {
            toast({ title: 'Not authorized', description: 'You are not authorized to modify scoring rules.', variant: 'destructive' });
            return;
        }
        const newParam: ScoringParameter = {
            id: `param-${Date.now()}`,
            providerId: selectedProviderId,
            name: '',
            weight: 10,
            rules: [],
        };
        setCurrentParameters(prev => [...prev, newParam]);
    };

    const handleUpdateParameter = (paramId: string, field: 'name' | 'weight', value: any) => {
        if (scoringReadOnly) return;
        setCurrentParameters(produce(draft => {
            const param = draft.find(p => p.id === paramId);
            if (param) {
                (param as any)[field] = value;
                // The evaluator reads each rule's own field: keep it on the parameter's field.
                if (field === 'name') (param.rules || []).forEach(rule => { rule.field = value; });
            }
        }));
    };

    const handleRemoveParameter = (paramId: string) => {
        if (scoringReadOnly) return;
        setCurrentParameters(prev => prev.filter(p => p.id !== paramId));
    };

    const handleAddRule = (paramId: string) => {
        if (scoringReadOnly) return;
        setCurrentParameters(produce(draft => {
            const param = draft.find(p => p.id === paramId);
            if (param) {
                const newRule: Rule = {
                    id: `rule-${Date.now()}`,
                    parameterId: param.id,
                    field: param.name, // Default rule field to parameter name
                    condition: '>',
                    value: '',
                    score: 0,
                };
                if (!param.rules) param.rules = [];
                param.rules.push(newRule);
            }
        }))
    }

    const handleUpdateRule = (paramId: string, ruleId: string, updatedRule: Rule) => {
        if (scoringReadOnly) return;
        setCurrentParameters(produce(draft => {
            const param = draft.find(p => p.id === paramId);
            if (param && param.rules) {
                const ruleIndex = param.rules.findIndex(r => r.id === ruleId);
                if (ruleIndex !== -1) {
                    param.rules[ruleIndex] = updatedRule;
                }
            }
        }));
    };

    const handleRemoveRule = (paramId: string, ruleId: string) => {
        if (scoringReadOnly) return;
        setCurrentParameters(produce(draft => {
            const param = draft.find(p => p.id === paramId);
            if (param && param.rules) {
                param.rules = param.rules.filter(r => r.id !== ruleId);
            }
        }));
    };

    const handleOpenSaveDialog = () => {
        if (scoringReadOnly) {
            toast({ title: 'Not authorized', description: 'You are not authorized to submit scoring rules for approval.', variant: 'destructive' });
            return;
        }
        if (problems.length > 0) {
            setShowProblems(true);
            toast({ title: 'Fix the rules first', description: problems.slice(0, 3).join(' '), variant: 'destructive' });
            return;
        }
        setIsApplyDialogOpen(true);
    };

    const handleSaveAndApply = async () => {
        if (!selectedProviderId) return;
        if (scoringReadOnly) {
            toast({ title: 'Not authorized', description: 'You are not authorized to submit scoring rules for approval.', variant: 'destructive' });
            return;
        }

        setIsSaving(true);
        try {
            const payload = {
                original: approvedParameters,
                // Every rule reads its parameter's field.
                updated: currentParameters.map(p => ({ ...p, rules: (p.rules || []).map(r => ({ ...r, field: p.name })) })),
                // Every product of the provider is scored with its current rules; they are recorded with this version.
                appliedProductIds: scoredProducts.map(p => p.id),
                provider: currentProvider ? { id: currentProvider.id, name: currentProvider.name } : { id: selectedProviderId, name: '' },
                appliedProducts: scoredProducts.map(p => ({ id: p.id, name: p.name })),
            };
            await postPendingChange({
                entityType: 'ScoringRules',
                entityId: selectedProviderId,
                changeType: 'UPDATE',
                payload: JSON.stringify(payload)
            }, 'Failed to submit changes for approval.');

            setPendingChanges(prev => [
                ...prev.filter(c => c.providerId !== selectedProviderId),
                { id: 'submitted', providerId: selectedProviderId, createdAt: new Date().toISOString(), submittedBy: null },
            ]);
            setShowProblems(false);
            setIsApplyDialogOpen(false);
            toast({
                title: 'Submitted for Approval',
                description: `Your new scoring configuration has been submitted for review.`,
            });
        } catch (error: any) {
             toast({
                title: 'Error Submitting',
                description: error.message,
                variant: 'destructive',
            });
        } finally {
            setIsSaving(false);
        }
    }

    const handleRestoreFromHistory = () => {
        if (!restoringHistoryItem) return;
        try {
            const paramsFromHistory = restoringHistoryItem.parameters;
            if (Array.isArray(paramsFromHistory)) {
                const stamp = Date.now();
                const loaded = paramsFromHistory.map((p, i) => {
                    const id = `param-${stamp}-${i}`;
                    return {
                        ...p,
                        id,
                        providerId: selectedProviderId,
                        rules: (p.rules || []).map((r, j) => ({ ...r, id: `rule-${stamp}-${i}-${j}`, parameterId: id, field: p.name })),
                    };
                });
                setCurrentParameters(loaded);
                setTab('scorecard');
                toast({ title: 'Configuration Loaded', description: `Version ${versionOf(restoringHistoryItem)} is in the editor. Submit it for approval to use it again.` });
            } else {
                throw new Error("Invalid history data format.");
            }
        } catch (error: any) {
            toast({ title: 'Error Loading History', description: error.message, variant: 'destructive' });
        } finally {
            setRestoringHistoryItem(null);
        }
    };

    const discardEdits = () => {
        setCurrentParameters(approvedParameters);
        setShowProblems(false);
    };


    if (providers.length === 0) {
        return (
            <div className="flex-1 space-y-4 p-8 pt-6">
                <h2 className="text-3xl font-bold tracking-tight">Credit Scoring Engine</h2>
                <div className="flex items-center justify-center h-64">
                    <Loader className="h-8 w-8 animate-spin" />
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 space-y-4 p-8 pt-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Credit Scoring Engine</h2>
                    <p className="text-muted-foreground">
                        Define the parameters, their weights, and the rules used to calculate customer credit scores.
                    </p>
                </div>
                 <div className="flex items-center space-x-4">
                     <Select onValueChange={setSelectedProviderId} value={selectedProviderId}>
                        <SelectTrigger className="w-[280px]">
                            <SelectValue placeholder="Select a provider" />
                        </SelectTrigger>
                        <SelectContent>
                            {providers.map(provider => (
                                <SelectItem key={provider.id} value={provider.id}>{provider.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <Tabs value={tab} onValueChange={setTab} className="space-y-4">
                <TabsList>
                    <TabsTrigger value="scorecard">
                        Scorecard
                        {isDirty && <span className="ml-2 h-2 w-2 rounded-full bg-amber-500" aria-label="Unsaved changes" />}
                    </TabsTrigger>
                    <TabsTrigger value="data">Data Sources</TabsTrigger>
                    <TabsTrigger value="versions">Versions</TabsTrigger>
                </TabsList>

                <TabsContent value="scorecard" className="space-y-4">
                    {pending && (
                        <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
                            <Clock className="mt-0.5 h-4 w-4 shrink-0" />
                            <p>
                                {pending.submittedBy
                                    ? `A scoring change submitted by ${pending.submittedBy} on ${format(new Date(pending.createdAt), 'MMMM d, yyyy h:mm a')} is awaiting approval.`
                                    : 'Your scoring change has been submitted and is awaiting approval.'}
                                {' '}Another change can be submitted once it is approved or rejected.
                            </p>
                        </div>
                    )}

                    {showProblems && problems.length > 0 && (
                        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm">
                            <p className="font-medium text-destructive">Fix these before submitting:</p>
                            <ul className="mt-2 list-disc space-y-1 pl-5">
                                {problems.map(problem => <li key={problem}>{problem}</li>)}
                            </ul>
                        </div>
                    )}

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between gap-4">
                            <div>
                                <CardTitle>Parameters & Rules</CardTitle>
                                <CardDescription>
                                    {currentVersionItem ? `Editing from version ${versionOf(currentVersionItem)}. ` : ''}
                                    For each parameter, the highest-scoring rule that matches counts, up to the parameter&apos;s weight. A borrower without a value gets no points for that parameter.
                                </CardDescription>
                            </div>
                            <div className="flex items-center gap-2">
                                {isDirty && (
                                    <>
                                        <Badge variant="outline">Unsaved changes</Badge>
                                        <Button variant="ghost" size="sm" onClick={discardEdits} disabled={isSaving}>
                                            <RotateCcw className="mr-2 h-4 w-4" /> Discard
                                        </Button>
                                    </>
                                )}
                                <Button
                                    onClick={handleOpenSaveDialog}
                                    style={{ backgroundColor: themeColor }}
                                    className="text-white"
                                    disabled={isSaving || scoringReadOnly || !!pending || !isDirty}
                                    title={pending ? 'A scoring change is already awaiting approval.' : !isDirty ? 'No changes to submit.' : undefined}
                                >
                                    {isSaving ? <Loader className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                    Submit for Approval
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <Accordion type="multiple" className="w-full space-y-2">
                                {currentParameters.map((param) => {
                                    const paramFieldInfo = customParams.find(p => p.value === param.name);
                                    const ruleCount = (param.rules || []).length;
                                     return (
                                     <AccordionItem value={param.id} key={param.id} className="border-none">
                                        <Card className="overflow-hidden">
                                            <div className="flex items-center p-4 bg-muted/50">
                                                <GripVertical className="h-5 w-5 text-muted-foreground cursor-grab"/>
                                                <div className="flex-1 grid grid-cols-2 gap-4 items-start ml-4">
                                                    <div className="space-y-1">
                                                        <Label htmlFor={`param-name-${param.id}`}>Parameter</Label>
                                                        <Select value={param.name} onValueChange={(value) => handleUpdateParameter(param.id, 'name', value)}>
                                                            <SelectTrigger id={`param-name-${param.id}`} className="w-full bg-background shadow-sm focus:ring-2 focus:ring-[--ring-color]" style={{'--ring-color': themeColor} as React.CSSProperties} disabled={scoringReadOnly}>
                                                                <SelectValue placeholder="Select Parameter Field" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectGroup>
                                                                    <SelectLabel>Custom Fields</SelectLabel>
                                                                    {customParams.length > 0 ? customParams.map(field => (
                                                                        <SelectItem key={field.value} value={field.value}>
                                                                            {field.label}{isProtectedField(field.value) ? ' (protected attribute)' : ''}
                                                                        </SelectItem>
                                                                    )) : <div className="text-xs text-muted-foreground px-2 py-1.5">No custom fields found.</div>}
                                                                </SelectGroup>
                                                            </SelectContent>
                                                        </Select>
                                                        {param.name && isProtectedField(param.name) && (
                                                            <p className="text-xs text-amber-700 dark:text-amber-300">
                                                                Scoring on this attribute can be discriminatory. Check it is allowed before using it.
                                                            </p>
                                                        )}
                                                    </div>
                                                    <div className="space-y-1">
                                                        <Label htmlFor={`param-weight-${param.id}`}>Weight (Max Points)</Label>
                                                        <Input
                                                            id={`param-weight-${param.id}`}
                                                            type="number"
                                                            value={param.weight}
                                                            onChange={(e) => handleUpdateParameter(param.id, 'weight', parseInt(e.target.value) || 0)}
                                                            className="w-full bg-background"
                                                            disabled={scoringReadOnly}
                                                        />
                                                        <p className="text-xs text-muted-foreground">
                                                            {ruleCount} {ruleCount === 1 ? 'rule' : 'rules'} · up to {highestPossibleScore([param])} points
                                                        </p>
                                                    </div>
                                                </div>
                                                <AccordionTrigger className="p-0 hover:no-underline"></AccordionTrigger>
                                                <Button variant="ghost" size="icon" className="ml-4" onClick={(e) => { e.stopPropagation(); handleRemoveParameter(param.id); }} disabled={scoringReadOnly}>
                                                    <Trash2 className="h-4 w-4 text-destructive" />
                                                </Button>
                                            </div>
                                             <AccordionContent className="p-4">
                                                <div className="space-y-2">
                                                    {(param.rules || []).map(rule => (
                                                        <RuleRow
                                                            key={rule.id}
                                                            rule={rule}
                                                            onUpdate={(updatedRule) => handleUpdateRule(param.id, rule.id, updatedRule)}
                                                            onRemove={() => handleRemoveRule(param.id, rule.id)}
                                                            color={themeColor}
                                                            maxScore={param.weight}
                                                            paramFieldInfo={paramFieldInfo}
                                                            readOnly={scoringReadOnly}
                                                        />
                                                    ))}
                                                    <Button variant="outline" className="w-full mt-2" onClick={() => handleAddRule(param.id)} disabled={scoringReadOnly}>
                                                        <PlusCircle className="mr-2 h-4 w-4" /> Add Rule
                                                    </Button>
                                                </div>
                                             </AccordionContent>
                                        </Card>
                                     </AccordionItem>
                                     )
                                })}
                            </Accordion>
                        </CardContent>
                        <CardFooter className="flex flex-col items-stretch gap-4">
                            <Button
                                variant="outline"
                                className="w-full"
                                onClick={handleAddParameter}
                                disabled={scoringReadOnly}
                            >
                                <PlusCircle className="mr-2 h-4 w-4" /> Add Parameter
                            </Button>
                            <Separator />
                            <div className="flex justify-end items-baseline gap-4">
                                <span className="text-sm text-muted-foreground">Highest Possible Score</span>
                                <span className="text-2xl font-bold">
                                    {maxScore}
                                </span>
                            </div>
                        </CardFooter>
                    </Card>

                    <ScorePreview parameters={currentParameters} availableFields={customParams} providerColor={themeColor} />
                </TabsContent>

                <TabsContent value="data" className="space-y-4">
                    <DataProvisioningTab
                        providerId={selectedProviderId}
                        initialConfigs={currentDataConfigs}
                        onConfigChange={(newConfigs) => {
                            setAllDataConfigs(prev => [...prev.filter(c => c.providerId !== selectedProviderId), ...newConfigs]);
                            fetchProviderData();
                        }}
                        allProviderProducts={currentProvider?.products || []}
                    />

                    <DataFetchSettingsCard onSettings={(s) => setStatementMonths(s.statementMonths)} />

                    <StatementParametersCard months={statementMonths} />

                    <StatementFiguresCard />
                </TabsContent>

                <TabsContent value="versions" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Configuration History</CardTitle>
                            <CardDescription>
                                Every approved scoring configuration for this provider. All of its products are scored with the version in effect; load an older one into the editor to submit it again.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {isHistoryLoading ? <div className="text-center p-8"><Loader className="h-6 w-6 animate-spin mx-auto"/></div> :
                            scoringHistory.length > 0 ? (
                                <ul className="space-y-4">
                                {scoringHistory.map(item => (
                                    <li key={item.id} className="p-4 border rounded-md flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                        <div className="space-y-1">
                                            <p>
                                                <span className="font-semibold">Version {versionOf(item)}</span>
                                                <span className="ml-2 text-muted-foreground">{format(new Date(item.savedAt), 'MMMM d, yyyy h:mm a')}</span>
                                            </p>
                                            <p className="text-sm text-muted-foreground">
                                                Recorded for: <span className="font-medium text-foreground">{item.appliedProducts.map(p => p.product.name).join(', ') || 'N/A'}</span>
                                            </p>
                                            {item.id === currentVersionItem?.id ? (
                                                <Badge variant="secondary">In effect for every scored product</Badge>
                                            ) : (
                                                <Badge variant="outline">Not in effect</Badge>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Button variant="outline" size="sm" onClick={() => setViewingHistoryItem(item)}>
                                                <Eye className="mr-2 h-4 w-4" /> View
                                            </Button>
                                            <Button variant="outline" size="sm" onClick={() => setRestoringHistoryItem(item)} disabled={scoringReadOnly}>
                                                <FileClock className="mr-2 h-4 w-4" /> Load into editor
                                            </Button>
                                        </div>
                                    </li>
                                ))}
                                </ul>
                            ) : <p className="text-sm text-muted-foreground text-center p-8">No history found.</p>
                            }
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            <Dialog open={isApplyDialogOpen} onOpenChange={setIsApplyDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Submit Scoring Rules for Approval</DialogTitle>
                        <DialogDescription>
                            Once approved, these rules replace the current rules of {currentProvider?.name} and every one of its products is scored with them. Highest possible score: {maxScore}.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-3">
                        <Label>Products scored with these rules</Label>
                        {scoredProducts.length > 0 ? (
                            <ul className="list-disc space-y-1 pl-5 text-sm">
                                {scoredProducts.map(product => <li key={product.id}>{product.name}</li>)}
                            </ul>
                        ) : (
                            <p className="text-sm text-muted-foreground">This provider has no scored products yet.</p>
                        )}
                        {salaryAdvanceCount > 0 && (
                            <p className="text-xs text-muted-foreground">Salary advance products are not scored; their limit comes from the salary list.</p>
                        )}
                        {tierProblems.length > 0 && (
                            <div className="space-y-1 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
                                {tierProblems.map(problem => <p key={problem}>{problem}</p>)}
                                <p>Extend those products&apos; loan amount tiers so every score gets an amount.</p>
                            </div>
                        )}
                    </div>
                    <DialogFooter className="pt-4">
                        <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                        <Button onClick={handleSaveAndApply} style={{backgroundColor: themeColor}} className="text-white" disabled={isSaving || scoringReadOnly}>
                             {isSaving && <Loader className="mr-2 h-4 w-4 animate-spin" />}
                             Submit for Approval
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!viewingHistoryItem} onOpenChange={(open) => { if (!open) setViewingHistoryItem(null); }}>
                <DialogContent className="max-w-2xl">
                    {viewingHistoryItem && (
                        <>
                            <DialogHeader>
                                <DialogTitle>Version {versionOf(viewingHistoryItem)}</DialogTitle>
                                <DialogDescription>
                                    {format(new Date(viewingHistoryItem.savedAt), 'MMMM d, yyyy h:mm a')} · highest possible score {highestPossibleScore(viewingHistoryItem.parameters || [])}
                                </DialogDescription>
                            </DialogHeader>
                            <div className="max-h-[60vh] space-y-4 overflow-y-auto">
                                {(viewingHistoryItem.parameters || []).map((param, index) => (
                                    <div key={`${param.name}-${index}`} className="space-y-2">
                                        <p className="font-medium">
                                            {param.name || '—'}
                                            <span className="ml-2 text-sm font-normal text-muted-foreground">weight {param.weight}</span>
                                        </p>
                                        <div className="rounded-md border">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Rule</TableHead>
                                                        <TableHead className="text-right">Points</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {(param.rules || []).map((rule, ruleIndex) => (
                                                        <TableRow key={ruleIndex}>
                                                            <TableCell>{describeRule(rule)}</TableCell>
                                                            <TableCell className="text-right tabular-nums">{rule.score}</TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            <AlertDialog open={!!restoringHistoryItem} onOpenChange={() => setRestoringHistoryItem(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Load Configuration?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will replace the rules in the editor with {restoringHistoryItem ? `version ${versionOf(restoringHistoryItem)}` : 'the selected version'}. Nothing changes until it is submitted and approved.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleRestoreFromHistory} style={{ backgroundColor: themeColor }} className="text-white">Load Configuration</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

function DataProvisioningTab({ providerId, initialConfigs, onConfigChange, allProviderProducts }: {
    providerId: string;
    initialConfigs: DataProvisioningConfig[];
    onConfigChange: (newConfigs: DataProvisioningConfig[]) => void;
    allProviderProducts: LoanProduct[];
}) {
    const { toast } = useToast();
    const { canModule } = usePermissions();
    // Scoring page should be governed by scoring-engine permissions.
    const canCreateType = canModule('scoring-engine', 'create');
    const canUpdateType = canModule('scoring-engine', 'update');
    const canDeleteType = canModule('scoring-engine', 'delete');
    const canUploadFile = canModule('scoring-engine', 'create');
    const canDeleteUpload = canModule('scoring-engine', 'delete');
    const [configs, setConfigs] = useState(initialConfigs);
    const [isConfigDialogOpen, setIsConfigDialogOpen] = useState(false);
    const [editingConfig, setEditingConfig] = useState<DataProvisioningConfig | null>(null);
    const [deletingConfigId, setDeletingConfigId] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRefs = React.useRef<Record<string, React.RefObject<HTMLInputElement>>>({});
    const [viewingUpload, setViewingUpload] = useState<DataProvisioningUpload | null>(null);
    const [deletingUpload, setDeletingUpload] = useState<DataProvisioningUpload | null>(null);


    useEffect(() => {
        setConfigs(initialConfigs);
    }, [initialConfigs]);

    const handleOpenDialog = (config: DataProvisioningConfig | null = null) => {
        if (config) {
            if (!canUpdateType) {
                toast({ title: 'Not authorized', description: 'You are not authorized to update data provisioning types.', variant: 'destructive' });
                return;
            }
        } else {
            if (!canCreateType) {
                toast({ title: 'Not authorized', description: 'You are not authorized to create data provisioning types.', variant: 'destructive' });
                return;
            }
        }
        setEditingConfig(config);
        setIsConfigDialogOpen(true);
    };

    const handleDeleteConfig = async (configId: string) => {
        if (!canDeleteType) {
            toast({ title: 'Not authorized', description: 'You are not authorized to delete data provisioning types.', variant: 'destructive' });
            return;
        }
        try {
            const configToDelete = configs.find(c => c.id === configId);
            if (!configToDelete) throw new Error("Config not found");

            await postPendingChange({
                entityType: 'DataProvisioningConfig',
                entityId: configId,
                changeType: 'DELETE',
                payload: JSON.stringify({ original: configToDelete })
            }, 'Failed to submit deletion for approval.');
            toast({ title: "Deletion Submitted", description: `Deletion of "${configToDelete.name}" is pending approval.` });
            
            const newConfigs = produce(configs, draft => {
                const config = draft.find(c => c.id === configId);
                if (config) {
                    config.status = 'PENDING_APPROVAL';
                }
            });
            onConfigChange(newConfigs);
        } catch (error: any) {
             toast({ title: "Error", description: error.message, variant: "destructive" });
        } finally {
            setDeletingConfigId(null);
        }
    };
    
    const handleSaveConfig = async (config: Omit<DataProvisioningConfig, 'providerId' | 'id' | 'uploads'> & { id?: string }) => {
        const isEditing = !!config.id;
        if (isEditing ? !canUpdateType : !canCreateType) {
            toast({ title: 'Not authorized', description: 'You are not authorized to modify data provisioning types.', variant: 'destructive' });
            return;
        }
        try {
            const originalConfig = isEditing ? configs.find(c => c.id === config.id) : null;
            const changeType = isEditing ? 'UPDATE' : 'CREATE';
            const entityId = isEditing ? config.id : undefined;
            
            const payload = {
                original: originalConfig,
                updated: { ...originalConfig, ...config },
                created: !isEditing ? { ...config, providerId } : null,
            };

            await postPendingChange({
                entityType: 'DataProvisioningConfig',
                entityId,
                changeType,
                payload: JSON.stringify(payload),
            }, 'Failed to submit changes for approval.');
            toast({ title: "Submitted for Approval", description: `Changes for "${config.name}" have been submitted.` });

             if (isEditing) {
                const newConfigs = produce(configs, draft => {
                    const cfg = draft.find(c => c.id === config.id);
                    if (cfg) {
                        cfg.status = 'PENDING_APPROVAL';
                    }
                });
                onConfigChange(newConfigs);
            }
            
        } catch(error: any) {
            toast({ title: "Error", description: error.message, variant: 'destructive' });
        }
    };
    
    if (configs) {
        configs.forEach(config => {
            if (!fileInputRefs.current[config.id]) {
                fileInputRefs.current[config.id] = React.createRef<HTMLInputElement>();
            }
        });
    }

    const handleExcelUpload = async (event: React.ChangeEvent<HTMLInputElement>, config: DataProvisioningConfig) => {
        if (!canUploadFile) {
            toast({ title: 'Not authorized', description: 'You are not authorized to upload data provisioning files.', variant: 'destructive' });
            if (event.target) event.target.value = '';
            return;
        }
        const file = event.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        try {
            // Client-side validation: reject unsupported types and oversized files before sending
            const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
            const allowedTypes = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
            const allowedExtensions = ['xlsx'];
            
            const fileName = file.name || '';
            const ext = fileName.split('.').pop()?.toLowerCase();
            
            // Validate file extension
            if (!ext || !allowedExtensions.includes(ext)) {
                throw new Error('Invalid file type. Only .xlsx files are allowed.');
            }
            
            // Validate file type (MIME type) - be lenient with MIME type as browsers may vary
            if (file.type && !allowedTypes.includes(file.type) && !file.type.includes('sheet')) {
                throw new Error('Invalid file type. Only .xlsx files are allowed.');
            }
            
            // Validate file size
            if (file.size > MAX_FILE_SIZE) {
                throw new Error('File is too large. Maximum size is 10MB.');
            }
            
            // Parse the Excel file to validate headers match config columns
            const buffer = await file.arrayBuffer();
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.load(buffer);
            const worksheet = workbook.worksheets[0];
            
            if (!worksheet) {
                throw new Error('The uploaded file does not contain any worksheets.');
            }
            
            // Extract headers from the first row
            const headerRow = worksheet.getRow(1);
            const uploadedHeaders: string[] = [];
            const columnCount = worksheet.columnCount || 0;
            for (let i = 1; i <= columnCount; i++) {
                const cell = headerRow.getCell(i);
                const text = (cell.text ?? cell.value) as any;
                const header = text?.toString?.().trim() || '';
                if (header) uploadedHeaders.push(header);
            }
            
            if (uploadedHeaders.length === 0) {
                throw new Error('The uploaded file has no header row. Please ensure the first row contains column headers.');
            }
            
            // Get expected columns from config
            const configColumns = config.columns || [];
            const expectedColumnNames = configColumns.map(c => c.name);
            
            if (expectedColumnNames.length === 0) {
                throw new Error('The data type configuration has no defined columns. Please configure columns first.');
            }
            
            // Find the identifier column in config
            const idColumn = configColumns.find(c => c.isIdentifier);
            if (!idColumn) {
                throw new Error('No identifier column defined in the data type configuration.');
            }
            
            // Check if identifier column exists in uploaded file
            const normalizeHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');
            const normalizedUploadedHeaders = uploadedHeaders.map(normalizeHeader);
            const normalizedIdColumnName = normalizeHeader(idColumn.name);
            
            if (!normalizedUploadedHeaders.includes(normalizedIdColumnName)) {
                throw new Error(`The uploaded file is missing the required identifier column "${idColumn.name}". Found columns: ${uploadedHeaders.join(', ')}`);
            }
            
            // Check for missing required columns
            const missingColumns = expectedColumnNames.filter(expected => {
                const normalizedExpected = normalizeHeader(expected);
                return !normalizedUploadedHeaders.includes(normalizedExpected);
            });
            
            if (missingColumns.length > 0) {
                throw new Error(`The uploaded file is missing required columns: ${missingColumns.join(', ')}. Please ensure your file contains all required columns.`);
            }
            
            // Check row count - must have at least 1 data row
            let dataRowCount = 0;
            for (let r = 2; r <= worksheet.rowCount; r++) {
                const row = worksheet.getRow(r);
                let hasData = false;
                for (let c = 1; c <= columnCount; c++) {
                    const val = row.getCell(c).value;
                    if (val !== null && val !== undefined && String(val).trim() !== '') {
                        hasData = true;
                        break;
                    }
                }
                if (hasData) dataRowCount++;
            }
            
            if (dataRowCount === 0) {
                throw new Error('The uploaded file contains no data rows. Please ensure there is at least one row of data after the header.');
            }
            
            // Validate identifier column values - ensure no empty identifiers
            const idColumnIndex = normalizedUploadedHeaders.indexOf(normalizedIdColumnName) + 1;
            let emptyIdCount = 0;
            for (let r = 2; r <= worksheet.rowCount; r++) {
                const row = worksheet.getRow(r);
                const idValue = row.getCell(idColumnIndex).value;
                if (idValue === null || idValue === undefined || String(idValue).trim() === '') {
                    // Check if this is an empty row
                    let hasOtherData = false;
                    for (let c = 1; c <= columnCount; c++) {
                        if (c !== idColumnIndex) {
                            const val = row.getCell(c).value;
                            if (val !== null && val !== undefined && String(val).trim() !== '') {
                                hasOtherData = true;
                                break;
                            }
                        }
                    }
                    if (hasOtherData) emptyIdCount++;
                }
            }
            
            if (emptyIdCount > 0) {
                throw new Error(`Found ${emptyIdCount} row(s) with data but missing identifier ("${idColumn.name}"). All data rows must have an identifier value.`);
            }

            // All validations passed, now read file as base64 for submission
            const fileReader = new FileReader();
            fileReader.readAsDataURL(file);
            fileReader.onload = async () => {
                try {
                    const fileContentBase64 = (fileReader.result as string).split(',')[1];
                    const payload = {
                        created: {
                            configId: config.id,
                            fileName: file.name,
                            fileContent: fileContentBase64
                        }
                    };

                    await postPendingChange({
                        entityType: 'DataProvisioningUpload',
                        entityId: config.id, // Use configId as entityId for context
                        changeType: 'CREATE',
                        payload: JSON.stringify(payload),
                    }, 'Failed to submit file for approval.');
                    
                    toast({
                        title: 'Submitted for Approval',
                        description: `File "${file.name}" with ${dataRowCount} rows has been submitted for review.`,
                    });
                    // Optimistically add to UI with pending status
                    const tempUpload: DataProvisioningUpload = {
                        id: `temp-${Date.now()}`,
                        configId: config.id,
                        fileName: file.name,
                        rowCount: dataRowCount,
                        uploadedAt: new Date().toISOString(),
                        uploadedBy: 'You',
                        status: 'PENDING_APPROVAL'
                    };

                    const newConfigs = produce(configs, draft => {
                        const cfg = draft.find(c => c.id === config.id);
                        if (cfg) {
                            if (!cfg.uploads) cfg.uploads = [];
                            cfg.uploads.unshift(tempUpload as any);
                        }
                    });
                    onConfigChange(newConfigs);
                } catch (submitError: any) {
                    toast({
                        title: 'Upload Failed',
                        description: submitError.message,
                        variant: 'destructive',
                    });
                }
            };

        } catch (error: any) {
            toast({
                title: 'Upload Failed',
                description: error.message,
                variant: 'destructive',
            });
            setIsUploading(false);
            if (event.target) event.target.value = '';
            return;
        } finally {
            setIsUploading(false);
            if (event.target) event.target.value = '';
        }
    };
    
     const handleDeleteUpload = async () => {
        if (!deletingUpload) return;
        if (!canDeleteUpload) {
            toast({ title: 'Not authorized', description: 'You are not authorized to delete data provisioning uploads.', variant: 'destructive' });
            return;
        }
        
        try {
            const response = await fetch(`/api/settings/data-provisioning-uploads?uploadId=${deletingUpload.id}`, {
                method: 'DELETE',
            });
             if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to delete upload.');
            }
            
            const newConfigs = produce(configs, draft => {
                const config = draft.find(c => c.id === deletingUpload.configId);
                if (config && config.uploads) {
                    config.uploads = config.uploads.filter(u => u.id !== deletingUpload.id);
                }
            });

            setConfigs(newConfigs);
            onConfigChange(newConfigs);
            toast({ title: 'Success', description: `Upload "${deletingUpload.fileName}" has been deleted.` });

        } catch (error: any) {
            toast({ title: 'Error', description: error.message, variant: 'destructive' });
        } finally {
            setDeletingUpload(null);
        }
    };
    
    const getUploadStatusIcon = (upload: DataProvisioningUpload) => {
        const status = (upload as any).status;
        if (status === 'PENDING_APPROVAL') return <Clock className="h-4 w-4 text-yellow-500" />;
        // Assuming no status field exists anymore
        return <FileClock className="h-4 w-4 text-muted-foreground"/>;
    };


    const eligibilityUploadIds = useMemo(() => {
        return new Set(allProviderProducts.map(p => p.eligibilityUploadId).filter(Boolean));
    }, [allProviderProducts]);

    return (
        <>
            <Card>
                <CardHeader>
                    <div className="flex justify-between items-start">
                        <div>
                            <CardTitle>Data Provisioning Types</CardTitle>
                            <CardDescription>Define custom data types from file uploads to use in scoring.</CardDescription>
                        </div>
                        <div className="flex items-center gap-4">
                            {canCreateType && (
                                <Button onClick={() => handleOpenDialog()}>
                                    <PlusCircle className="h-4 w-4 mr-2" /> Add Data Type
                                </Button>
                            )}
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                     {configs?.map((config) => {
                        const generalUploads = (config.uploads || []).filter(upload => !eligibilityUploadIds.has(upload.id));
                        const isPending = config.status === 'PENDING_APPROVAL';
                        return (
                            <Card key={config.id} className="mb-4">
                                <CardHeader className="flex flex-row justify-between items-center">
                                     <div className="flex items-center gap-2">
                                        <CardTitle className="text-lg">{config.name}</CardTitle>
                                        {isPending && <Badge variant="outline">Pending Approval</Badge>}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {canUpdateType && (
                                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleOpenDialog(config)} disabled={isPending}><Edit className="h-4 w-4" /></Button>
                                        )}
                                        {canDeleteType && (
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeletingConfigId(config.id)} disabled={isPending}><Trash2 className="h-4 w-4" /></Button>
                                        )}
                                    </div>
                                </CardHeader>
                                <CardContent>
                                   <h4 className="font-medium mb-2">Columns</h4>
                                   <ul className="list-disc pl-5 text-sm text-muted-foreground mb-4">
                                        {(config.columns || []).map(col => <li key={col.id}>{col.name} <span className="text-xs opacity-70">({col.type})</span> {col.isIdentifier && <Badge variant="outline" className="ml-2">ID</Badge>}</li>)}
                                   </ul>
                                   <Separator />
                                   <div className="mt-4">
                                       <div className="flex justify-between items-center mb-2">
                                            <h4 className="font-medium">Upload History</h4>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                disabled={isUploading || isPending || !canUploadFile}
                                                onClick={() => fileInputRefs.current[config.id]?.current?.click()}
                                            >
                                                {isUploading ? <Loader className="h-4 w-4 mr-2 animate-spin"/> : <Upload className="h-4 w-4 mr-2"/>}
                                                Upload File
                                            </Button>
                                            <input
                                                type="file"
                                                ref={fileInputRefs.current[config.id]}
                                                className="hidden"
                                                accept=".xlsx, .xls"
                                                onChange={(e) => handleExcelUpload(e, config)}
                                            />
                                       </div>
                                       <div className="border rounded-md">
                                           <Table>
                                               <TableHeader>
                                                   <TableRow>
                                                       <TableHead>File Name</TableHead>
                                                       <TableHead>Rows</TableHead>
                                                       <TableHead>Uploaded By</TableHead>
                                                       <TableHead>Date</TableHead>
                                                       <TableHead className="text-right">Actions</TableHead>
                                                   </TableRow>
                                               </TableHeader>
                                               <TableBody>
                                                   {generalUploads && generalUploads.length > 0 ? (
                                                       generalUploads.map(upload => {
                                                            const isTemp = upload.id.startsWith('temp-');
                                                            return (
                                                            <TableRow key={upload.id}>
                                                                <TableCell className="font-medium flex items-center gap-2 cursor-pointer hover:underline" onClick={() => !isTemp && setViewingUpload(upload)}>
                                                                    <FileClock className="h-4 w-4 text-muted-foreground"/>
                                                                    {upload.fileName}
                                                                </TableCell>
                                                                <TableCell>{isTemp ? 'N/A' : upload.rowCount}</TableCell>
                                                                <TableCell>{upload.uploadedBy}</TableCell>
                                                                <TableCell>{format(new Date(upload.uploadedAt), "yyyy-MM-dd HH:mm")}</TableCell>
                                                                <TableCell className="text-right">
                                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeletingUpload(upload)} disabled={isTemp || !canDeleteUpload}>
                                                                        <Trash2 className="h-4 w-4" />
                                                                    </Button>
                                                                </TableCell>
                                                            </TableRow>
                                                       )})
                                                   ) : (
                                                        <TableRow>
                                                            <TableCell colSpan={5} className="text-center text-muted-foreground h-24">No files uploaded yet.</TableCell>
                                                        </TableRow>
                                                   )}
                                               </TableBody>
                                           </Table>
                                       </div>
                                   </div>
                                </CardContent>
                            </Card>
                        )
                    })}
                    {!configs?.length && (
                        <div className="text-center text-muted-foreground py-8">No data types defined for this provider.</div>
                    )}
                </CardContent>
            </Card>

            <DataProvisioningDialog
                isOpen={isConfigDialogOpen}
                onClose={() => setIsConfigDialogOpen(false)}
                onSave={handleSaveConfig}
                config={editingConfig}
                readOnly={editingConfig ? !canUpdateType : !canCreateType}
            />

            <AlertDialog open={!!deletingConfigId} onOpenChange={() => setDeletingConfigId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will submit a request to delete the data type. This action cannot be undone once approved and may fail if the data type is in use.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDeleteConfig(deletingConfigId!)} className="bg-destructive hover:bg-destructive/90" disabled={!canDeleteType}>Submit for Deletion</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            
            <AlertDialog open={!!deletingUpload} onOpenChange={() => setDeletingUpload(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete this upload?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete the file record and all {deletingUpload?.rowCount} associated borrower data rows from the database. This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteUpload} className="bg-destructive hover:bg-destructive/90" disabled={!canDeleteUpload}>Delete Upload</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <UploadDataViewerDialog
                upload={viewingUpload}
                onClose={() => setViewingUpload(null)}
            />
        </>
    );
}

// Extend DataColumn state to include the raw comma-separated string for the textarea
type EditableDataColumn = DataColumn & { optionsString?: string };

function DataProvisioningDialog({ isOpen, onClose, onSave, config, readOnly }: {
    isOpen: boolean;
    onClose: () => void;
    onSave: (config: Omit<DataProvisioningConfig, 'providerId' | 'id' | 'uploads'> & { id?: string }) => void;
    config: DataProvisioningConfig | null;
    readOnly?: boolean;
}) {
    const { toast } = useToast();
    const [name, setName] = useState('');
    const [columns, setColumns] = useState<EditableDataColumn[]>([]);

    useEffect(() => {
        if (isOpen) {
            if (config) {
                setName(config.name);
                setColumns(config.columns.map(c => ({...c, optionsString: (c.options || []).join(', ') })) || []);
            } else {
                setName('');
                setColumns([]);
            }
        }
    }, [config, isOpen]);

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (readOnly) {
            toast({ title: 'Not authorized', description: 'You are not authorized to modify this configuration.', variant: 'destructive' });
            if (event.target) event.target.value = '';
            return;
        }
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            const arrayBuffer = e.target?.result as ArrayBuffer;
            try {
                const workbook = new ExcelJS.Workbook();
                await workbook.xlsx.load(arrayBuffer);
                const worksheet = workbook.worksheets[0];
                const headers: string[] = [];
                const headerRow = worksheet.getRow(1);
                headerRow.eachCell((cell, colNumber) => {
                    const text = (cell.text ?? cell.value) as any;
                    headers.push(text?.toString?.() || '');
                });

                setColumns(headers.map((header, index) => ({
                    id: `col-${Date.now()}-${index}`,
                    name: header,
                    type: 'string', // default type
                    isIdentifier: index === 0, // default first column as identifier
                    options: [],
                    optionsString: '',
                })));
            } catch (err) {
                console.error('Failed to parse Excel file', err);
                toast({ title: 'Error', description: 'Could not parse the uploaded file.', variant: 'destructive' });
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const handleColumnChange = (index: number, field: keyof EditableDataColumn, value: string | boolean) => {
        if (readOnly) return;
        setColumns(produce(draft => {
            if (field === 'isIdentifier' && typeof value === 'boolean') {
                // Ensure only one column can be the identifier
                draft.forEach((col, i) => {
                    col.isIdentifier = i === index ? value : false;
                });
            } else {
                 (draft[index] as any)[field] = value;
            }
        }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (readOnly) {
            toast({ title: 'Not authorized', description: 'You are not authorized to submit this change for approval.', variant: 'destructive' });
            return;
        }
        if (!columns.some(c => c.isIdentifier)) {
            toast({ title: 'Error', description: 'Please mark one column as the customer identifier.', variant: 'destructive' });
            return;
        }

        // Process the final columns array before saving
        const finalColumns = columns.map(col => {
            const { optionsString, ...rest } = col;
            const finalOptions = optionsString ? optionsString.split(',').map(s => s.trim()).filter(Boolean) : [];
            return { ...rest, options: finalOptions };
        });

        onSave({ id: config?.id, name, columns: finalColumns });
        onClose();
    };

    return (
         <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{config ? 'Edit' : 'Create'} Data Type</DialogTitle>
                     <DialogDescription>Define a new data schema by uploading a sample file.</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    <div>
                        <Label htmlFor="data-type-name">Data Type Name</Label>
                        <Input id="data-type-name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g., Credit Bureau Data" required disabled={!!readOnly} />
                    </div>

                    <div>
                        <Label htmlFor="file-upload">Upload Sample File (.xlsx, .xls)</Label>
                        <Input id="file-upload" type="file" accept=".xlsx, .xls" onChange={handleFileUpload} disabled={!!readOnly} />
                         <p className="text-xs text-muted-foreground mt-1">Upload a file to automatically detect columns.</p>
                    </div>

                    {columns.length > 0 && (
                        <div>
                            <Label>Configure Columns</Label>
                            <div className="space-y-4 mt-2 border p-4 rounded-md max-h-[50vh] overflow-y-auto">
                                {columns.map((col, index) => (
                                    <div key={col.id} className="space-y-2 p-2 rounded-md bg-muted/50">
                                        <div className="grid grid-cols-12 items-center gap-2">
                                            <Input
                                                className="col-span-5"
                                                value={col.name}
                                                onChange={e => handleColumnChange(index, 'name', e.target.value)}
                                                required
                                                disabled={!!readOnly}
                                            />
                                            <Select value={col.type} onValueChange={(value: 'string' | 'number' | 'date') => handleColumnChange(index, 'type', value)}>
                                                <SelectTrigger className="col-span-3" disabled={!!readOnly}>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="string">Text</SelectItem>
                                                    <SelectItem value="number">Number</SelectItem>
                                                    <SelectItem value="date">Date</SelectItem>
                                                </SelectContent>
                                            </Select>
                                             <div className="col-span-4 flex items-center justify-end space-x-2">
                                                <Checkbox
                                                    id={`is-identifier-${col.id}`}
                                                    checked={col.isIdentifier}
                                                    onCheckedChange={(checked) => handleColumnChange(index, 'isIdentifier', !!checked)}
                                                    disabled={!!readOnly}
                                                />
                                                <Label htmlFor={`is-identifier-${col.id}`} className="text-sm text-muted-foreground whitespace-nowrap">Is Identifier?</Label>
                                            </div>
                                        </div>
                                         {col.type === 'string' && (
                                            <div className="space-y-1">
                                                <Label htmlFor={`options-${col.id}`} className="text-xs text-muted-foreground">Dropdown Options (optional)</Label>
                                                <Textarea
                                                    id={`options-${col.id}`}
                                                    placeholder="e.g., Male, Female, Other"
                                                    className="text-xs"
                                                    value={col.optionsString || ''}
                                                    onChange={e => handleColumnChange(index, 'optionsString', e.target.value)}
                                                    disabled={!!readOnly}
                                                />
                                                <p className="text-xs text-muted-foreground">Comma-separated values for dropdown select.</p>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    
                    <DialogFooter>
                        <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
                        <Button type="submit" disabled={!!readOnly}>Submit for Approval</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

function UploadDataViewerDialog({ upload, onClose }: {
    upload: DataProvisioningUpload | null;
    onClose: () => void;
}) {
    const [data, setData] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalRows, setTotalRows] = useState(0);
    const rowsPerPage = 100;

    useEffect(() => {
        if (upload) {
            const fetchData = async () => {
                setIsLoading(true);
                try {
                    const response = await fetch(`/api/settings/data-provisioning-uploads/view?uploadId=${upload.id}&page=${page}&limit=${rowsPerPage}`);
                    if (!response.ok) {
                        throw new Error('Failed to fetch uploaded data');
                    }
                    const result = await response.json();
                    setData(result.data);
                    setTotalPages(result.totalPages);
                    setTotalRows(result.totalRows);
                } catch (error) {
                    console.error(error);
                } finally {
                    setIsLoading(false);
                }
            };
            fetchData();
        }
    }, [upload, page]);

    if (!upload) return null;

    const headers = data.length > 0 ? Object.keys(data[0]) : [];

    return (
        <Dialog open={!!upload} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Viewing Upload: {upload.fileName}</DialogTitle>
                    <DialogDescription>
                        Displaying {data.length} of {totalRows} rows from the uploaded file.
                    </DialogDescription>
                </DialogHeader>
                <div className="flex-grow overflow-auto border rounded-md">
                    {isLoading ? (
                        <div className="flex items-center justify-center h-full">
                            <Loader className="h-8 w-8 animate-spin" />
                        </div>
                    ) : (
                        <Table>
                            <TableHeader className="sticky top-0 bg-background">
                                <TableRow>
                                    {headers.map(header => <TableHead key={header} className="capitalize">{header.replace(/([A-Z])/g, ' $1')}</TableHead>)}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {data.map((row, rowIndex) => (
                                    <TableRow key={rowIndex}>
                                        {headers.map(header => <TableCell key={`${rowIndex}-${header}`}>{row[header]}</TableCell>)}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </div>
                <DialogFooter className="justify-between items-center pt-4">
                    <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => setPage(p => p - 1)} disabled={page === 1}>
                            <ChevronLeft className="h-4 w-4 mr-2" /> Previous
                        </Button>
                        <Button variant="outline" onClick={() => setPage(p => p + 1)} disabled={page === totalPages}>
                            Next <ChevronRight className="h-4 w-4 ml-2" />
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
    

    











