'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Edit, Loader2, PlusCircle, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/use-permissions';
import { postPendingChange } from '@/lib/fetch-utils';
import { fieldFromName } from '@/lib/statement-utils';

type Direction = 'IN' | 'OUT' | 'BOTH';
type Measure = 'COUNT_PER_MONTH' | 'AMOUNT_PER_MONTH' | 'MONTHS_WITH_ANY' | 'SHARE_OF_INCOME';

type StatementParameter = {
  id: string;
  field: string;
  name: string;
  direction: Direction;
  matchWords: string;
  excludeWords: string | null;
  measure: Measure;
  minAmount: number | null;
};

type PendingItem = {
  id: string;
  entityId: string | null;
  changeType: 'CREATE' | 'UPDATE' | 'DELETE';
  createdAt: string;
  proposed: Partial<StatementParameter> | null;
};

type Preview = {
  field: string;
  value: number | null;
  months: string[];
  matchedCount: number;
  sample: { date: string | null; direction: 'IN' | 'OUT'; amount: number; description: string | null; narrative: string | null }[];
};

const DIRECTION_LABELS: Record<Direction, string> = {
  IN: 'Money in',
  OUT: 'Money out',
  BOTH: 'Money in and out',
};

const measureLabels = (months: number): Record<Measure, string> => ({
  COUNT_PER_MONTH: 'Number of transactions per month',
  AMOUNT_PER_MONTH: 'Amount per month',
  MONTHS_WITH_ANY: `Months with any (0-${months})`,
  SHARE_OF_INCOME: 'Share of income (%)',
});

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (key: string) => `${MONTH_NAMES[Number(key.slice(4, 6)) - 1]} ${key.slice(0, 4)}`;

function formatValue(measure: Measure, value: number | null) {
  if (value == null) return 'No income in these months';
  switch (measure) {
    case 'COUNT_PER_MONTH':
      return `${value.toFixed(2)} transactions per month`;
    case 'AMOUNT_PER_MONTH':
      return `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })} per month`;
    case 'MONTHS_WITH_ANY':
      return `${value} of 6 months`;
    default:
      return `${value.toFixed(1)}% of income`;
  }
}

/** The definition fields sent for approval (what the approver sees). */
function toPayload(p: Omit<StatementParameter, 'id'>) {
  return {
    name: p.name,
    field: p.field,
    direction: p.direction,
    matchWords: p.matchWords,
    excludeWords: p.excludeWords || null,
    measure: p.measure,
    minAmount: p.minAmount,
  };
}

/**
 * Statement parameters: statement figures defined here instead of in code (see
 * src/lib/statement-parameters.ts). Shared by all providers; changes need approval.
 */
export function StatementParametersCard({ months = 6 }: { months?: number }) {
  const MEASURE_LABELS = measureLabels(months);
  const { toast } = useToast();
  const { canModule } = usePermissions();
  const canCreate = canModule('scoring-engine', 'create');
  const canUpdate = canModule('scoring-engine', 'update');
  const canDelete = canModule('scoring-engine', 'delete');

  const [parameters, setParameters] = useState<StatementParameter[]>([]);
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<StatementParameter | 'new' | null>(null);
  const [removing, setRemoving] = useState<StatementParameter | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/settings/statement-parameters');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Could not load statement parameters.');
      setParameters(data.parameters);
      setPending(data.pending);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRemove = async () => {
    if (!removing) return;
    try {
      await postPendingChange(
        {
          entityType: 'StatementParameter',
          entityId: removing.id,
          changeType: 'DELETE',
          payload: JSON.stringify({ original: toPayload(removing) }),
        },
        'Failed to submit the removal for approval.'
      );
      toast({ title: 'Sent for approval', description: `Removing "${removing.name}" is waiting for approval.` });
      load();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setRemoving(null);
    }
  };

  const pendingFor = (id: string) => pending.find((p) => p.entityId === id);
  const pendingCreates = pending.filter((p) => p.changeType === 'CREATE');

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Statement Parameters</CardTitle>
          <CardDescription>
            Figures calculated from each customer&apos;s account statement over the last 6 complete months. Once
            approved, they can be used in the rules of every provider. A customer&apos;s value is recalculated the
            next time their statement figures refresh (usually on their next visit).
          </CardDescription>
        </div>
        {canCreate && (
          <Button onClick={() => setEditing('new')}>
            <PlusCircle className="mr-2 h-4 w-4" /> Add Parameter
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : parameters.length === 0 && pendingCreates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No statement parameters yet. The built-in statement figures (average monthly deposit, months with e-birr
            activity and so on) are always available.
          </p>
        ) : (
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Counts</TableHead>
                  <TableHead>Measure</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parameters.map((p) => {
                  const change = pendingFor(p.id);
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="font-medium">{p.name}</div>
                        <div className="font-mono text-xs text-muted-foreground">{p.field}</div>
                      </TableCell>
                      <TableCell className="text-sm">
                        <div>{DIRECTION_LABELS[p.direction]} containing: {p.matchWords}</div>
                        {p.excludeWords && <div className="text-muted-foreground">but not: {p.excludeWords}</div>}
                        {p.minAmount != null && <div className="text-muted-foreground">from {p.minAmount.toLocaleString()} up</div>}
                      </TableCell>
                      <TableCell className="text-sm">{MEASURE_LABELS[p.measure]}</TableCell>
                      <TableCell>
                        {change ? (
                          <Badge variant="outline">{change.changeType === 'DELETE' ? 'Removal awaiting approval' : 'Change awaiting approval'}</Badge>
                        ) : (
                          <Badge variant="secondary">Active</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <Button variant="ghost" size="icon" title="View or edit" onClick={() => setEditing(p)} disabled={!!change}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        {canDelete && (
                          <Button variant="ghost" size="icon" title="Remove" onClick={() => setRemoving(p)} disabled={!!change}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {pendingCreates.map((c) => (
                  <TableRow key={c.id} className="opacity-70">
                    <TableCell>
                      <div className="font-medium">{c.proposed?.name}</div>
                      <div className="font-mono text-xs text-muted-foreground">{c.proposed?.field}</div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {c.proposed?.direction ? DIRECTION_LABELS[c.proposed.direction] : ''} containing: {c.proposed?.matchWords}
                    </TableCell>
                    <TableCell className="text-sm">{c.proposed?.measure ? MEASURE_LABELS[c.proposed.measure] : ''}</TableCell>
                    <TableCell>
                      <Badge variant="outline">New, awaiting approval</Badge>
                    </TableCell>
                    <TableCell />
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {editing && (
        <StatementParameterDialog
          months={months}
          parameter={editing === 'new' ? null : editing}
          readOnly={editing === 'new' ? !canCreate : !canUpdate}
          onClose={() => setEditing(null)}
          onSubmitted={() => {
            setEditing(null);
            load();
          }}
        />
      )}

      <AlertDialog open={!!removing} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove &quot;{removing?.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              This sends the removal for approval. It can only be approved when no scoring rule uses this parameter.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemove}>Send for approval</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function StatementParameterDialog({
  parameter,
  months,
  readOnly,
  onClose,
  onSubmitted,
}: {
  parameter: StatementParameter | null;
  months: number;
  readOnly: boolean;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const MEASURE_LABELS = measureLabels(months);
  const { toast } = useToast();
  const [name, setName] = useState(parameter?.name ?? '');
  const [direction, setDirection] = useState<Direction>(parameter?.direction ?? 'OUT');
  const [matchWords, setMatchWords] = useState(parameter?.matchWords ?? '');
  const [excludeWords, setExcludeWords] = useState(parameter?.excludeWords ?? '');
  const [measure, setMeasure] = useState<Measure>(parameter?.measure ?? 'COUNT_PER_MONTH');
  const [minAmount, setMinAmount] = useState(parameter?.minAmount != null ? String(parameter.minAmount) : '');
  const [saving, setSaving] = useState(false);

  const [accountNumber, setAccountNumber] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // A new parameter's field follows its name; an existing one keeps its field (rules refer to it).
  const field = parameter?.field ?? fieldFromName(name);
  const definition = () => ({
    name: name.trim(),
    field,
    direction,
    matchWords,
    excludeWords: excludeWords.trim() || null,
    measure,
    minAmount: minAmount.trim() === '' ? null : Number(minAmount),
  });

  // An earlier preview no longer matches the form once anything changes.
  useEffect(() => {
    setPreview(null);
    setPreviewError(null);
  }, [name, direction, matchWords, excludeWords, measure, minAmount]);

  const runPreview = async () => {
    setPreviewing(true);
    setPreview(null);
    setPreviewError(null);
    try {
      const res = await fetch('/api/settings/statement-parameters/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ definition: definition(), accountNumber: accountNumber.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Could not compute the preview.');
      setPreview(data);
    } catch (e: any) {
      setPreviewError(e.message);
    } finally {
      setPreviewing(false);
    }
  };

  const submit = async () => {
    setSaving(true);
    try {
      const def = definition();
      await postPendingChange(
        parameter
          ? {
              entityType: 'StatementParameter',
              entityId: parameter.id,
              changeType: 'UPDATE',
              payload: JSON.stringify({ original: toPayload(parameter), updated: toPayload(def) }),
            }
          : {
              entityType: 'StatementParameter',
              changeType: 'CREATE',
              payload: JSON.stringify({ created: toPayload(def) }),
            },
        'Failed to submit for approval.'
      );
      toast({ title: 'Sent for approval', description: `"${def.name}" will be available once it is approved.` });
      onSubmitted();
    } catch (e: any) {
      toast({ title: 'Not sent', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{parameter ? parameter.name : 'Add Statement Parameter'}</DialogTitle>
          <DialogDescription>
            Counts the statement lines whose description or narrative contains any of the words. Upper or lower case
            does not matter. Loans, interest and reversals are not left out automatically: add words to leave out.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="sp-name">Name</Label>
            <Input id="sp-name" value={name} onChange={(e) => setName(e.target.value)} disabled={readOnly} placeholder="Telebirr transactions" />
            <p className="text-xs text-muted-foreground">
              Used in rules as <span className="font-mono">{field || '...'}</span>
              {parameter ? ' (does not change when renamed)' : ''}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Which money</Label>
            <Select value={direction} onValueChange={(v) => setDirection(v as Direction)} disabled={readOnly}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(DIRECTION_LABELS) as Direction[]).map((d) => (
                  <SelectItem key={d} value={d}>{DIRECTION_LABELS[d]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Measure</Label>
            <Select value={measure} onValueChange={(v) => setMeasure(v as Measure)} disabled={readOnly}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(MEASURE_LABELS) as Measure[]).map((m) => (
                  <SelectItem key={m} value={m}>{MEASURE_LABELS[m]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="sp-match">Words to match</Label>
            <Input id="sp-match" value={matchWords} onChange={(e) => setMatchWords(e.target.value)} disabled={readOnly} placeholder="telebirr, tele birr" />
            <p className="text-xs text-muted-foreground">Separate with commas. A line counts if it contains any of them.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sp-exclude">Words to leave out (optional)</Label>
            <Input id="sp-exclude" value={excludeWords} onChange={(e) => setExcludeWords(e.target.value)} disabled={readOnly} placeholder="refund" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sp-min">Minimum amount (optional)</Label>
            <Input id="sp-min" type="number" min={0} value={minAmount} onChange={(e) => setMinAmount(e.target.value)} disabled={readOnly} placeholder="50" />
          </div>
        </div>

        {!readOnly && (
          <div className="mt-2 space-y-3 rounded-md border p-4">
            <div>
              <p className="font-medium">Try it</p>
              <p className="text-xs text-muted-foreground">
                Calculates this parameter for one account, from the same months scoring uses. The lookup is recorded
                in the audit log.
              </p>
            </div>
            <div className="flex gap-2">
              <Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="Account number" className="max-w-xs" />
              <Button variant="outline" onClick={runPreview} disabled={previewing || !accountNumber.trim() || !name.trim() || !matchWords.trim()}>
                {previewing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Calculate
              </Button>
            </div>
            {previewError && <p className="text-sm text-destructive">{previewError}</p>}
            {preview && (
              <div className="space-y-2">
                <p className="text-sm">
                  <span className="text-lg font-semibold">{formatValue(measure, preview.value)}</span>
                  <span className="text-muted-foreground">
                    {' '}· {preview.matchedCount} matching transactions, {monthLabel(preview.months[0])} to{' '}
                    {monthLabel(preview.months[preview.months.length - 1])}
                  </span>
                </p>
                {preview.sample.length > 0 && (
                  <div className="max-h-64 overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>In/Out</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Narrative</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preview.sample.map((s, i) => (
                          <TableRow key={i}>
                            <TableCell className="whitespace-nowrap">{s.date}</TableCell>
                            <TableCell>{s.direction === 'IN' ? 'In' : 'Out'}</TableCell>
                            <TableCell className="text-right">{s.amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}</TableCell>
                            <TableCell>{s.description}</TableCell>
                            <TableCell>{s.narrative}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {preview.matchedCount > preview.sample.length && (
                      <p className="mt-1 text-xs text-muted-foreground">Showing the latest {preview.sample.length}.</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{readOnly ? 'Close' : 'Cancel'}</Button>
          {!readOnly && (
            <Button onClick={submit} disabled={saving || !name.trim() || !matchWords.trim()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Send for approval
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
