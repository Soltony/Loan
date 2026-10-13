'use client';

import { useState } from 'react';
import { ArrowDown, Loader2 } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  ALLOCATION_BUCKETS,
  BUCKET_LABELS,
  DEFAULT_ALLOCATION_ORDER,
  type AllocationBucket,
} from '@/lib/manual-repayment';
import type { Policy } from './types';

/**
 * Bank-policy settings for the module (BRD 3.5 / 3.6 / 3.7). Read-only unless the
 * signed-in user is a System Admin.
 */
export function PolicyCard({
  policy,
  canEdit,
  onSaved,
}: {
  policy: Policy;
  canEdit: boolean;
  onSaved: (policy: Policy) => void;
}) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<Policy>(policy);
  const [isSaving, setIsSaving] = useState(false);

  const move = (index: number, delta: number) => {
    const next = [...draft.allocationOrder];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setDraft({ ...draft, allocationOrder: next });
  };

  const save = async () => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/manual-repayments/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allocationOrder: draft.allocationOrder,
          makerApprovalLimit: draft.makerApprovalLimit,
          overpaymentPolicy: draft.overpaymentPolicy,
          requireAttachment: draft.requireAttachment,
          notifyCustomer: draft.notifyCustomer,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'The policy could not be saved.');
      toast({ title: 'Saved', description: 'The manual repayment policy was updated.' });
      onSaved(data.policy as Policy);
    } catch (e) {
      toast({ title: 'Error', description: String((e as Error)?.message ?? e), variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const isCustomOrder =
    draft.allocationOrder.join() !== DEFAULT_ALLOCATION_ORDER.join();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Repayment policy</CardTitle>
        <CardDescription>
          How manual repayments are validated and allocated. {canEdit ? 'Only a System Admin can change these.' : 'Shown read-only — ask a System Admin to change them.'}
        </CardDescription>
      </CardHeader>

      <CardContent className="grid gap-6 md:grid-cols-2">
        <div className="space-y-3">
          <Label>Allocation order</Label>
          <ol className="space-y-1">
            {draft.allocationOrder.map((bucket, index) => (
              <li
                key={bucket}
                className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
              >
                <span>
                  <span className="mr-2 text-muted-foreground">{index + 1}.</span>
                  {BUCKET_LABELS[bucket as AllocationBucket]}
                </span>
                {canEdit && (
                  <span className="flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      aria-label={`Move ${BUCKET_LABELS[bucket as AllocationBucket]} up`}
                    >
                      <ArrowDown className="h-3.5 w-3.5 rotate-180" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => move(index, 1)}
                      disabled={index === draft.allocationOrder.length - 1}
                      aria-label={`Move ${BUCKET_LABELS[bucket as AllocationBucket]} down`}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                  </span>
                )}
              </li>
            ))}
          </ol>
          {isCustomOrder && (
            <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-300">
              A non-default order changes how a repayment is split across the general ledger. The
              outstanding balance the portal displays is still derived in the default order
              ({ALLOCATION_BUCKETS.map((b) => BUCKET_LABELS[b]).join(' → ')}), so the two will not match
              bucket for bucket.
            </p>
          )}
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="limit">Maker approval limit (ETB)</Label>
            <Input
              id="limit"
              type="number"
              min="0"
              step="0.01"
              disabled={!canEdit}
              value={draft.makerApprovalLimit ?? ''}
              placeholder="No limit"
              onChange={(e) =>
                setDraft({
                  ...draft,
                  makerApprovalLimit: e.target.value === '' ? null : Number(e.target.value),
                })
              }
            />
            <p className="text-xs text-muted-foreground">
              Repayments above this amount are refused at entry. Leave empty for no ceiling.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="overpayment">Overpayment handling</Label>
            <Select
              value={draft.overpaymentPolicy}
              disabled={!canEdit}
              onValueChange={(v) => setDraft({ ...draft, overpaymentPolicy: v as Policy['overpaymentPolicy'] })}
            >
              <SelectTrigger id="overpayment">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="REJECT">Reject — the amount may not exceed the balance</SelectItem>
                <SelectItem value="WARN">Warn — post up to the balance, flag the excess</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="attachment-required">Require a receipt</Label>
              <p className="text-xs text-muted-foreground">Every entry must carry a slip or receipt.</p>
            </div>
            <Switch
              id="attachment-required"
              checked={draft.requireAttachment}
              disabled={!canEdit}
              onCheckedChange={(v) => setDraft({ ...draft, requireAttachment: v })}
            />
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="notify">Notify the customer</Label>
              <p className="text-xs text-muted-foreground">SMS the customer once a repayment is posted.</p>
            </div>
            <Switch
              id="notify"
              checked={draft.notifyCustomer}
              disabled={!canEdit}
              onCheckedChange={(v) => setDraft({ ...draft, notifyCustomer: v })}
            />
          </div>
        </div>
      </CardContent>

      {canEdit && (
        <CardFooter className="justify-end gap-2">
          <Button variant="ghost" onClick={() => setDraft(policy)} disabled={isSaving}>
            Reset
          </Button>
          <Button onClick={save} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save policy
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
