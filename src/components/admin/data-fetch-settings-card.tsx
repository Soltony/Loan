'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/use-permissions';

export type DataFetchSettings = {
  statementMonths: number;
  statementRefreshDays: number;
  statementMaxAgeDays: number;
  customerInfoRefreshDays: number;
  updatedAt?: string | null;
};

/** How current the statement data is (statementDataFreshness in lib/statement-figures.ts). */
type StatementFreshness = {
  newestTransactionDate: string | null; // YYYYMMDD
  accountsChecked: number;
  daysOld: number | null;
  stale: boolean;
};

const showDate = (ymd: string) => `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;

/**
 * How customer data is fetched: months of statement, how often it is fetched again, how old figures
 * may be, and how often customer info is refreshed. Saved straight away (no approval).
 */
export function DataFetchSettingsCard({ onSettings }: { onSettings?: (settings: DataFetchSettings) => void }) {
  const { toast } = useToast();
  const { canModule } = usePermissions();
  const canUpdate = canModule('scoring-engine', 'update');

  const [form, setForm] = useState<DataFetchSettings | null>(null);
  const [freshness, setFreshness] = useState<StatementFreshness | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/data-fetch');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Could not load the data settings.');
      setForm(data.settings);
      setFreshness(data.freshness ?? null);
      onSettings?.(data.settings);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
    // onSettings is only reported upward; re-running on its identity would reload in a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const set = (field: keyof DataFetchSettings, value: string) =>
    setForm((f) => (f ? { ...f, [field]: value === '' ? ('' as any) : Number(value) } : f));

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const res = await fetch('/api/settings/data-fetch', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Could not save the settings.');
      setForm(data.settings);
      onSettings?.(data.settings);
      toast({ title: 'Saved', description: 'New settings apply from each customer’s next refresh.' });
    } catch (e: any) {
      toast({ title: 'Not saved', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Customer Data Fetching</CardTitle>
        <CardDescription>
          How much statement history the figures use, and how often data is fetched from the bank. Changes apply from
          each customer&apos;s next refresh; nobody&apos;s figures are recalculated immediately.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!form ? (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <Label>Statement history</Label>
                <Select
                  value={String(form.statementMonths)}
                  onValueChange={(v) => set('statementMonths', v)}
                  disabled={!canUpdate}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <SelectItem key={m} value={String(m)}>{m} {m === 1 ? 'month' : 'months'}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Complete months used for every figure. The current month is never included.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="df-refresh">Fetch statements every</Label>
                <div className="flex items-center gap-2">
                  <Input id="df-refresh" type="number" min={1} max={90} value={form.statementRefreshDays} onChange={(e) => set('statementRefreshDays', e.target.value)} disabled={!canUpdate} />
                  <span className="text-sm text-muted-foreground">days</span>
                </div>
                <p className="text-xs text-muted-foreground">A customer&apos;s statement is fetched again on their first visit after this.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="df-maxage">Stop using figures after</Label>
                <div className="flex items-center gap-2">
                  <Input id="df-maxage" type="number" min={1} max={365} value={form.statementMaxAgeDays} onChange={(e) => set('statementMaxAgeDays', e.target.value)} disabled={!canUpdate} />
                  <span className="text-sm text-muted-foreground">days</span>
                </div>
                <p className="text-xs text-muted-foreground">Older figures are not used: products scored on them answer &quot;still checking&quot; until they are fetched again. Must be at least the fetch interval.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="df-customer">Fetch customer info every</Label>
                <div className="flex items-center gap-2">
                  <Input id="df-customer" type="number" min={0} max={365} value={form.customerInfoRefreshDays} onChange={(e) => set('customerInfoRefreshDays', e.target.value)} disabled={!canUpdate} />
                  <span className="text-sm text-muted-foreground">days</span>
                </div>
                <p className="text-xs text-muted-foreground">0 = fetch once and keep. A new account is always fetched.</p>
                {Number(form.customerInfoRefreshDays) === 0 && (
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Customer info is never refreshed: income, branch and TIN stay as first fetched. 30 to 90 days is recommended.
                  </p>
                )}
              </div>
            </div>

            {freshness && (
              <div
                className={
                  freshness.stale
                    ? 'rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100'
                    : 'text-sm text-muted-foreground'
                }
              >
                {freshness.newestTransactionDate ? (
                  <p>
                    {`Newest transaction in the statements fetched over the last 7 days: ${showDate(freshness.newestTransactionDate)}` +
                      (freshness.daysOld !== null ? ` (${freshness.daysOld} ${freshness.daysOld === 1 ? 'day' : 'days'} ago)` : '') +
                      ` - ${freshness.accountsChecked} ${freshness.accountsChecked === 1 ? 'account' : 'accounts'} checked.`}
                  </p>
                ) : (
                  <p>No statements fetched in the last 7 days yet, so how current the bank data is cannot be shown.</p>
                )}
                {freshness.stale && (
                  <p className="mt-1">
                    Statements look out of date: check that ODS is loading every day. Missing months count as zero in every figure, so scores fall.
                  </p>
                )}
              </div>
            )}

            {canUpdate && (
              <div className="flex items-center gap-3">
                <Button onClick={save} disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save
                </Button>
                {form.updatedAt && (
                  <span className="text-xs text-muted-foreground">Last changed {new Date(form.updatedAt).toLocaleString()}</span>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
