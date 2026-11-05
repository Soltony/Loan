'use client';

import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { formatDateTime, formatMoney, formatRelative } from './format';

/** A borrower: name, then phone and bank account in full. */
export function BorrowerCell({
  name,
  phone,
  account,
}: {
  name?: string | null;
  phone?: string | null;
  account?: string | null;
}) {
  return (
    <div className="min-w-40">
      {name ? (
        <div className="font-medium">{name}</div>
      ) : (
        <div className="italic text-muted-foreground">Name not on file</div>
      )}
      <div className="font-mono text-xs text-muted-foreground">{[phone, account].filter(Boolean).join(' · ') || '—'}</div>
    </div>
  );
}

/** A long id shortened to its last 8 characters; hover shows it whole, the button copies it. */
export function IdCell({ id }: { id: string | null | undefined }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  if (!id) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="font-mono text-xs" tabIndex={0}>
            …{id.slice(-8)}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <span className="font-mono">{id}</span>
        </TooltipContent>
      </Tooltip>
      <button
        type="button"
        aria-label={copied ? 'Copied' : `Copy ${id}`}
        className="rounded-sm p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => {
          void navigator.clipboard?.writeText(id).then(() => setCopied(true));
        }}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </span>
  );
}

export function Money({ value, bold }: { value: number | null | undefined; bold?: boolean }) {
  return <span className={cn('tabular-nums', bold && 'font-semibold')}>{formatMoney(value)}</span>;
}

/** Status of a loan in the loan reports. */
export function LoanStatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return null;
  return (
    <Badge
      variant={status === 'Overdue' || status === 'Defaulted' ? 'destructive' : status === 'Paid' ? 'default' : 'secondary'}
      className={cn('whitespace-nowrap', status === 'Paid' && 'bg-green-600 text-white hover:bg-green-600/80')}
    >
      {status}
    </Badge>
  );
}

/** Outcome of a disbursement or repayment transaction (Success, Failure, Pending, POSTED, …). */
export function TxnStatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return null;
  const value = status.toLowerCase();
  const failed = value === 'failure' || value === 'failed' || value.startsWith('status ');
  const pending = value === 'pending' || value === 'sent';
  return (
    <Badge
      variant={failed ? 'destructive' : 'secondary'}
      className={cn(
        'whitespace-nowrap',
        value === 'success' && 'bg-green-600 text-white hover:bg-green-600/80',
        pending && 'bg-amber-100 text-amber-900 hover:bg-amber-100/80 dark:bg-amber-500/20 dark:text-amber-200',
      )}
    >
      {status}
    </Badge>
  );
}

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TONE_WORDS: Array<[StatusTone, RegExp]> = [
  ['danger', /\b(reject|rejected|fail|failed|failure|error|declined|overdue|defaulted|loss|blocked|locked|inactive|cancel+ed|reversed|npl)\b/],
  ['warning', /\b(pending|processing|sent|submitted|awaiting|review|requested|queued|retry|retrying|partial)\b/],
  ['success', /\b(approved|success|successful|succeeded|paid|completed|complete|active|resolved|posted|disbursed|delivered|done|settled|closed)\b/],
];

const TONE_CLASSES: Record<StatusTone, string> = {
  success: 'border-transparent bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300',
  warning: 'border-transparent bg-amber-100 text-amber-900 hover:bg-amber-100 dark:bg-amber-500/15 dark:text-amber-300',
  danger: 'border-transparent bg-red-100 text-red-800 hover:bg-red-100 dark:bg-red-500/15 dark:text-red-300',
  info: 'border-transparent bg-sky-100 text-sky-800 hover:bg-sky-100 dark:bg-sky-500/15 dark:text-sky-300',
  neutral: '',
};

/** The tone a status word reads as (PENDING_APPROVAL → warning, FAILED → danger, …). */
export function statusTone(status: string): StatusTone {
  const words = status.toLowerCase().replace(/[^a-z]+/g, ' ');
  return TONE_WORDS.find(([, pattern]) => pattern.test(words))?.[0] ?? 'neutral';
}

/**
 * Any status, coloured by what it says: approved/paid/success green,
 * pending/processing amber, rejected/failed red, anything else plain.
 * `PENDING_APPROVAL` reads as "Pending approval".
 */
export function StatusBadge({
  status,
  tone,
  label,
}: {
  status: string | null | undefined;
  tone?: StatusTone;
  /** Shown instead of the status itself. */
  label?: string;
}) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  const resolved = tone ?? statusTone(status);
  const text =
    label ??
    (/^[A-Z0-9_]+$/.test(status)
      ? status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, ' ')
      : status);
  return (
    <Badge variant={resolved === 'neutral' ? 'secondary' : 'outline'} className={cn('whitespace-nowrap', TONE_CLASSES[resolved])}>
      {text}
    </Badge>
  );
}

/** A date and time on the user's calendar, with how long ago it was underneath. */
export function DateTimeCell({ value, relative = true }: { value: string | Date | null | undefined; relative?: boolean }) {
  const text = formatDateTime(value);
  if (!text) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="whitespace-nowrap">
      <div className="tabular-nums">{text}</div>
      {relative ? <div className="text-xs text-muted-foreground">{formatRelative(value)}</div> : null}
    </div>
  );
}

/** Aging class of a borrower or facility. */
export function AgingBadge({ classification }: { classification: string }) {
  const severe = ['Substandard', 'Doubtful', 'Loss'].includes(classification);
  return (
    <Badge
      variant={severe ? 'destructive' : 'secondary'}
      className={cn('whitespace-nowrap', classification === 'Closed' && 'bg-green-600 text-white hover:bg-green-600/80')}
    >
      {classification}
    </Badge>
  );
}
