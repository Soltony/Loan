'use client';

import { Badge } from '@/components/ui/badge';
import {
  MANUAL_REPAYMENT_STATUS_LABELS,
  PAYMENT_SOURCE_LABELS,
  type ManualRepaymentStatus,
  type PaymentSource,
} from '@/lib/manual-repayment';
import type { OutstandingBreakdown } from './types';

const STATUS_CLASSES: Record<string, string> = {
  PENDING_APPROVAL: 'bg-amber-500 text-white hover:bg-amber-500/90',
  APPROVED: 'bg-emerald-600 text-white hover:bg-emerald-600/90',
  REJECTED: 'bg-red-600 text-white hover:bg-red-600/90',
  PENDING_REVERSAL: 'bg-orange-600 text-white hover:bg-orange-600/90',
  REVERSED: 'bg-slate-600 text-white hover:bg-slate-600/90',
};

export function StatusBadge({ status }: { status: string }) {
  const label = MANUAL_REPAYMENT_STATUS_LABELS[status as ManualRepaymentStatus] ?? status;
  const className = STATUS_CLASSES[status];
  return className ? <Badge className={className}>{label}</Badge> : <Badge variant="outline">{label}</Badge>;
}

export function sourceLabel(source: string) {
  return PAYMENT_SOURCE_LABELS[source as PaymentSource] ?? source;
}

const birrFormat = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function money(amount: number | null | undefined) {
  return birrFormat.format(Number(amount ?? 0));
}

export function dateTime(value: string | null | undefined) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

export function dateOnly(value: string | null | undefined) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

/** The outstanding split the Maker and Checker both work from (BRD 3.3). */
export function BalanceBreakdown({
  balance,
  title = 'Outstanding balance',
}: {
  balance: OutstandingBreakdown;
  title?: string;
}) {
  const rows: [string, number][] = [
    ['Principal', balance.principal],
    ['Interest', balance.interest],
    ['Service fee', balance.serviceFee],
    ['Penalty', balance.penalty],
    ['Tax', balance.tax],
  ];

  return (
    <div className="rounded-lg border bg-muted/30 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{money(balance.total)} ETB</p>
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-5">
        {rows.map(([label, value]) => (
          <div key={label} className="flex flex-col">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="tabular-nums">{money(value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
