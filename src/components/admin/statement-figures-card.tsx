'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, RefreshCw, Search } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import type { FiguresLookupResponse, FiguresLookupResult } from '@/lib/statement-figures-lookup';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** How long the card keeps asking before it leaves a fetch to finish in the background. */
const FETCH_GIVE_UP_MS = 15 * 60 * 1000;

function formatValue(value: number | null, kind: string) {
  if (value == null) return '—';
  return kind === 'count'
    ? value.toLocaleString('en-US', { maximumFractionDigits: 0 })
    : value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const money = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const monthName = (key: string) => `${MONTHS[Number(key.slice(4, 6)) - 1] ?? key.slice(4, 6)} ${key.slice(0, 4)}`;
const day = (ymd: string) => `${ymd.slice(6, 8)}/${ymd.slice(4, 6)}/${ymd.slice(0, 4)}`;

type Borrower = FiguresLookupResponse['borrowers'][number];
type FetchState = { running: true } | { running: false; error: string };
type Lookup = { controller: AbortController; autoFetched: Set<string> };
type Panel = { account: string | null; result: FiguresLookupResult | null; borrowers: Borrower[] };

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

function withoutKey<T>(record: Record<string, T>, key: string) {
  const next = { ...record };
  delete next[key];
  return next;
}

/** One panel per account: the active accounts of the phones looked up first, then other saved figures. */
function panelsOf(data: FiguresLookupResponse): Panel[] {
  const byAccount = new Map<string, Panel>();
  const withoutAccount: Panel[] = [];
  for (const b of data.borrowers) {
    if (!b.activeAccount) {
      withoutAccount.push({ account: null, result: null, borrowers: [b] });
      continue;
    }
    const panel = byAccount.get(b.activeAccount) ?? { account: b.activeAccount, result: null, borrowers: [] };
    panel.borrowers.push(b);
    byAccount.set(b.activeAccount, panel);
  }
  for (const r of data.results) {
    const panel = byAccount.get(r.accountNumber) ?? { account: r.accountNumber, result: null, borrowers: [] };
    panel.result = r;
    byAccount.set(r.accountNumber, panel);
  }
  return [...byAccount.values(), ...withoutAccount];
}

/** The phones of a panel: those whose customer info holds the figures, and those scored on the account. */
function phonesOf(panel: Panel) {
  const phones = new Map<string, boolean>();
  for (const b of panel.result?.borrowers ?? []) phones.set(b.phone, b.isActiveAccount);
  for (const b of panel.borrowers) phones.set(b.phone, b.activeAccount === panel.account);
  return Array.from(phones, ([phone, active]) => `${phone}${active && panel.account ? ' (active account)' : ''}`).join(', ');
}

/**
 * Looks up the statement figures of an account or phone: the values scoring uses, whether it may
 * use them now, the monthly totals behind the averages, and the limit each active product gives.
 * When none are saved for a phone's active account, fetches them from the bank's database first,
 * the same fetch the mini-app starts when the customer opens it.
 */
export function StatementFiguresCard() {
  const { canModule } = usePermissions();
  const canView = canModule('scoring-engine', 'create') || canModule('scoring-engine', 'update');

  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<FiguresLookupResponse | null>(null);
  const [fetches, setFetches] = useState<Record<string, FetchState>>({});
  // The newest lookup wins; starting one stops following the fetches of the last (they carry on
  // in the background on the server).
  const lookupRef = useRef<Lookup | null>(null);
  useEffect(() => () => lookupRef.current?.controller.abort(), []);

  if (!canView) return null;

  const isCurrent = (lookup: Lookup) => lookupRef.current === lookup && !lookup.controller.signal.aborted;

  /** Shows what is saved and the limits, then fetches figures for phones that have none saved. */
  const show = async (lookup: Lookup, q: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/settings/statement-figures?q=${encodeURIComponent(q)}`, {
        cache: 'no-store',
        signal: lookup.controller.signal,
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || 'Could not look up the figures.');
      if (!isCurrent(lookup)) return;
      const found = body as FiguresLookupResponse;
      setData(found);
      if (!found.canFetch) return;
      for (const b of found.borrowers) {
        if (b.isBorrower && b.activeAccount && !b.figuresSaved && !lookup.autoFetched.has(b.phone)) {
          lookup.autoFetched.add(b.phone);
          void fetchFigures(lookup, q, b.phone);
        }
      }
    } catch (e) {
      if (isCurrent(lookup)) setError(messageOf(e));
    } finally {
      if (isCurrent(lookup)) setLoading(false);
    }
  };

  /** Fetches the statement of the phone's active account, asking again while it runs, then shows the new figures. */
  const fetchFigures = async (lookup: Lookup, q: string, phone: string) => {
    setFetches((prev) => ({ ...prev, [phone]: { running: true } }));
    try {
      const giveUpAt = Date.now() + FETCH_GIVE_UP_MS;
      for (;;) {
        const askedAt = Date.now();
        const res = await fetch('/api/settings/statement-figures', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone }),
          signal: lookup.controller.signal,
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error || 'Could not fetch the figures.');
        if (body?.status === 'done') break;
        if (Date.now() > giveUpAt) {
          throw new Error('Still fetching after 15 minutes. It carries on in the background; look up again later.');
        }
        // The server waits for the fetch before it answers "pending"; a quick answer means it could not.
        if (Date.now() - askedAt < 2000) await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      if (!isCurrent(lookup)) return;
      await show(lookup, q);
      if (isCurrent(lookup)) setFetches((prev) => withoutKey(prev, phone));
    } catch (e) {
      if (isCurrent(lookup)) setFetches((prev) => ({ ...prev, [phone]: { running: false, error: messageOf(e) } }));
    }
  };

  const lookUp = () => {
    lookupRef.current?.controller.abort();
    const lookup: Lookup = { controller: new AbortController(), autoFetched: new Set() };
    lookupRef.current = lookup;
    setData(null);
    setFetches({});
    void show(lookup, query.trim());
  };

  const fetchAgain = (phone: string) => {
    const lookup = lookupRef.current;
    if (lookup && data) void fetchFigures(lookup, data.query, phone);
  };

  const panels = data ? panelsOf(data) : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Saved Statement Figures</CardTitle>
        <CardDescription>
          The figures scoring uses for an account, and the loan limit each active product gives. Enter an account
          number or a phone number. When no figures are saved for a phone&apos;s active account, its statement is
          fetched from the bank&apos;s database and the figures are saved, as when the customer opens the mini-app.
          Each lookup and fetch is recorded in the audit log.
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

        {data && panels.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nothing found for {data.query}: no customer has this phone number, or this account as their active
            account. Figures and limits are worked out once the customer opens the mini-app with it.
          </p>
        )}

        {data && panels.map((panel) => {
          const r = panel.result;
          const running = panel.borrowers.some((b) => fetches[b.phone]?.running);
          return (
            <div key={panel.account ?? `phone-${panel.borrowers[0]?.phone}`} className="space-y-4 rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">
                    {panel.account ? `Account ${panel.account}` : `Phone ${panel.borrowers[0]?.phone}`}
                  </p>
                  {panel.account && <p className="text-sm text-muted-foreground">{phonesOf(panel)}</p>}
                  <p className="text-sm text-muted-foreground">
                    {r
                      ? <>Saved {new Date(r.computedAt).toLocaleString()} ({r.ageDays < 1 ? 'today' : `${Math.floor(r.ageDays)} days ago`}),
                          from {r.transactionCount} transactions between {day(r.periodStart)} and {day(r.periodEnd)}</>
                      : panel.account
                        ? 'No figures are saved for this account.'
                        : 'No account is selected for this phone, so there are no figures to fetch or score.'}
                  </p>
                </div>
                {r
                  ? r.usedForScoring
                    ? <Badge>Used for scoring</Badge>
                    : <Badge variant="destructive">Not used for scoring: {r.notUsedBecause}</Badge>
                  : running
                    ? <Badge variant="secondary">Fetching</Badge>
                    : <Badge variant="outline">{panel.account ? 'No figures saved' : 'No account selected'}</Badge>}
              </div>

              {panel.borrowers.map((b) => (
                <FetchStatus
                  key={b.phone}
                  borrower={b}
                  state={fetches[b.phone]}
                  canFetch={data.canFetch}
                  showPhone={panel.borrowers.length > 1}
                  onFetch={() => fetchAgain(b.phone)}
                />
              ))}

              {r && <FiguresTables result={r} withoutBalances={data.withoutBalances} />}

              {panel.borrowers.map((b) => (
                <LimitsFor key={b.phone} borrower={b} updating={!!fetches[b.phone]?.running} />
              ))}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

/** Whether figures are being fetched for the phone, why they cannot be, or a button to fetch them. */
function FetchStatus({ borrower: b, state, canFetch, showPhone, onFetch }: {
  borrower: Borrower;
  state: FetchState | undefined;
  canFetch: boolean;
  showPhone: boolean;
  onFetch: () => void;
}) {
  const forPhone = showPhone ? ` for ${b.phone}` : '';
  const button = (label: string) => (
    <Button type="button" size="sm" variant="outline" onClick={onFetch}>
      <RefreshCw className="mr-2 h-4 w-4" /> {label}
    </Button>
  );

  if (state?.running) {
    return (
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
        {b.figuresSaved ? 'Fetching newer figures' : 'Fetching the statement'} from the bank&apos;s database{forPhone}.
        The first fetch of an account can take a few minutes; the figures and limits update when it is done.
      </p>
    );
  }
  if (state) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-destructive">{state.error}</p>
        {button('Try again')}
      </div>
    );
  }
  if (!b.activeAccount) return null;
  if (!b.figuresSaved) {
    if (!canFetch) {
      return <p className="text-sm text-muted-foreground">Statement fetching is switched off (STATEMENT_FIGURES_ENABLED), so no figures can be fetched.</p>;
    }
    if (!b.isBorrower) {
      return <p className="text-sm text-muted-foreground">{b.phone} has not opened the mini-app yet, so there is no customer to fetch for.</p>;
    }
    return button(`Fetch figures${forPhone}`);
  }
  if (b.refetch && b.isBorrower && canFetch) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-muted-foreground">
          Newer figures can be fetched{forPhone}: these are past the refresh interval, or the statement settings changed since.
        </p>
        {button('Fetch again')}
      </div>
    );
  }
  return null;
}

/** The saved figures and the months behind the averages. */
function FiguresTables({ result: r, withoutBalances }: { result: FiguresLookupResult; withoutBalances: boolean }) {
  return (
    <>
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
                {f.value == null && f.field === 'avgBalance' && withoutBalances ? 'not calculated' : formatValue(f.value, f.kind)}
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
    </>
  );
}

/** The limit each active product gives the phone: the answer the mini-app shows the customer. */
function LimitsFor({ borrower: b, updating }: { borrower: Borrower; updating: boolean }) {
  if (!b.limits) {
    return <p className="text-sm text-muted-foreground">No loan limit for {b.phone}: it has not opened the mini-app yet.</p>;
  }
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Loan limit for {b.phone}</p>
      {b.limits.length === 0 ? (
        <p className="text-sm text-muted-foreground">There are no active products to work out a limit for.</p>
      ) : (
        <Table className={updating ? 'opacity-60' : undefined}>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Score</TableHead>
              <TableHead className="text-right">Limit</TableHead>
              <TableHead>Result</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {b.limits.map((l) => (
              <TableRow key={l.productId}>
                <TableCell>
                  <p className="font-medium">{l.productName}</p>
                  <p className="text-xs text-muted-foreground">{l.providerName}{l.isSalaryAdvance ? ' · salary advance' : ''}</p>
                </TableCell>
                <TableCell className="text-right tabular-nums">{l.isSalaryAdvance ? '—' : l.score}</TableCell>
                <TableCell className="text-right tabular-nums font-semibold">{l.isEligible ? money(l.limit) : '—'}</TableCell>
                <TableCell className="space-y-1">
                  <Badge variant={l.isEligible ? 'default' : 'secondary'}>{l.isEligible ? 'Eligible' : 'Not eligible'}</Badge>
                  <p className="text-xs text-muted-foreground">{l.reason}</p>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <p className="text-xs text-muted-foreground">
        {updating ? 'Worked out before the fetch; worked out again when it is done. ' : ''}
        The same answer the mini-app gives: the approved scoring rules, each product&apos;s amount tiers, loan-cycle and
        salary-advance settings, and the customer&apos;s loans on every phone linked to the account.
      </p>
    </div>
  );
}
