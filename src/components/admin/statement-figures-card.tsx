'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Search } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import type { FiguresLookupResult } from '@/lib/statement-figures-lookup';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatValue(value: number | null, kind: string) {
  if (value == null) return '—';
  return kind === 'count'
    ? value.toLocaleString('en-US', { maximumFractionDigits: 0 })
    : value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const money = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const monthName = (key: string) => `${MONTHS[Number(key.slice(4, 6)) - 1] ?? key.slice(4, 6)} ${key.slice(0, 4)}`;
const day = (ymd: string) => `${ymd.slice(6, 8)}/${ymd.slice(4, 6)}/${ymd.slice(0, 4)}`;

/**
 * Looks up the statement figures saved for an account or phone: the values scoring uses, whether
 * it may use them now, and the monthly totals behind the averages. Reads saved figures only.
 */
export function StatementFiguresCard() {
  const { canModule } = usePermissions();
  const canView = canModule('scoring-engine', 'create') || canModule('scoring-engine', 'update');

  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{ query: string; results: FiguresLookupResult[]; withoutBalances: boolean } | null>(null);

  if (!canView) return null;

  const lookUp = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/settings/statement-figures?q=${encodeURIComponent(query.trim())}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'Could not look up the figures.');
      setData(body);
    } catch (e: any) {
      setData(null);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Saved Statement Figures</CardTitle>
        <CardDescription>
          The figures scoring uses for an account, as last saved by the background statement fetch. Enter an
          account number or a phone number. Nothing is fetched; each lookup is recorded in the audit log.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (query.trim()) lookUp();
          }}
        >
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="7000101737506 or 251911223344"
            inputMode="numeric"
            className="sm:max-w-sm"
          />
          <Button type="submit" variant="outline" disabled={loading || !query.trim()}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
            Look up
          </Button>
        </form>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {data && data.results.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No figures are saved for {data.query}. They are saved in the background after the customer opens the
            mini-app with this account; if they never appear, look for &quot;[statement-figures]&quot; in the app log.
          </p>
        )}

        {data?.results.map((r) => (
          <div key={r.accountNumber} className="space-y-4 rounded-lg border p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold">Account {r.accountNumber}</p>
                <p className="text-sm text-muted-foreground">
                  {r.borrowers.map((b) => `${b.phone}${b.isActiveAccount ? ' (active account)' : ''}`).join(', ')}
                </p>
                <p className="text-sm text-muted-foreground">
                  Saved {new Date(r.computedAt).toLocaleString()} ({r.ageDays < 1 ? 'today' : `${Math.floor(r.ageDays)} days ago`}),
                  from {r.transactionCount} transactions between {day(r.periodStart)} and {day(r.periodEnd)}
                </p>
              </div>
              {r.usedForScoring
                ? <Badge>Used for scoring</Badge>
                : <Badge variant="destructive">Not used for scoring: {r.notUsedBecause}</Badge>}
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Figure</TableHead>
                  <TableHead>Field in rules</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead className="hidden md:table-cell">What it is</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {r.figures.map((f) => (
                  <TableRow key={f.field}>
                    <TableCell className="font-medium">{f.label}</TableCell>
                    <TableCell><code className="text-xs">{f.field}</code></TableCell>
                    <TableCell className="text-right tabular-nums">
                      {f.value == null && f.field === 'avgBalance' && data.withoutBalances ? 'not calculated' : formatValue(f.value, f.kind)}
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{f.about}</TableCell>
                  </TableRow>
                ))}
                {r.custom.map((c) => (
                  <TableRow key={c.field}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell><code className="text-xs">{c.field}</code></TableCell>
                    <TableCell className="text-right tabular-nums">{formatValue(c.value, 'decimal')}</TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                      Statement parameter{c.current ? '' : ' - defined or changed after these figures were saved, so not used until the next fetch'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {r.months.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Month by month</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Month</TableHead>
                      <TableHead className="text-right">Income</TableHead>
                      <TableHead className="text-right">Airtime purchases</TableHead>
                      <TableHead className="text-right">Airtime spend</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {r.months.map((m) => (
                      <TableRow key={m.month}>
                        <TableCell>{monthName(m.month)}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(m.income)}</TableCell>
                        <TableCell className="text-right tabular-nums">{m.airtimeCount}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(m.airtimeValue)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {r.excludedFromIncome && (
                  <p className="text-xs text-muted-foreground">
                    Not counted as income: loan disbursements {money(r.excludedFromIncome.loanDisbursements)}, interest{' '}
                    {money(r.excludedFromIncome.interest)}, reversals {money(r.excludedFromIncome.reversals)}.
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
