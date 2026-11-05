'use client';

import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { formatMoney } from './lib/format';

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
