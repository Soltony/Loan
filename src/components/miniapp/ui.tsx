'use client';

/**
 * Small building blocks for the customer mini-app screens. Brand colours come from the
 * `brand` Tailwind colours, which read the CSS variables MiniAppShell sets.
 */
import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DueTone } from '@/lib/miniapp/format';

type ButtonVariant = 'solid' | 'soft' | 'outline' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

const enabledClass: Record<ButtonVariant, string> = {
  solid: 'bg-brand text-brand-fg shadow-sm hover:brightness-[.97] active:brightness-95',
  soft: 'bg-brand-soft text-brand-ink hover:brightness-[.98] active:brightness-95',
  outline: 'border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 active:bg-gray-100',
  ghost: 'text-brand-ink hover:bg-brand-soft active:bg-brand-soft',
};

const disabledClass: Record<ButtonVariant, string> = {
  solid: 'bg-gray-200 text-gray-500',
  soft: 'bg-gray-100 text-gray-400',
  outline: 'border border-gray-200 bg-white text-gray-400',
  ghost: 'text-gray-400',
};

const sizeClass: Record<ButtonSize, string> = {
  sm: 'h-9 rounded-lg px-3 text-sm',
  md: 'h-11 rounded-xl px-4 text-sm',
  lg: 'h-12 rounded-xl px-5 text-base',
};

export interface BrandButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and blocks taps, keeping the button's colours. */
  loading?: boolean;
  block?: boolean;
}

export const BrandButton = React.forwardRef<HTMLButtonElement, BrandButtonProps>(
  (
    { variant = 'solid', size = 'md', loading = false, block = false, className, children, disabled, type = 'button', ...props },
    ref,
  ) => (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex select-none items-center justify-center gap-2 font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink focus-visible:ring-offset-2',
        disabled && !loading ? cn(disabledClass[variant], 'cursor-not-allowed') : enabledClass[variant],
        loading && 'cursor-wait',
        sizeClass[size],
        block && 'w-full',
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  ),
);
BrandButton.displayName = 'BrandButton';

export type Tone = 'success' | 'danger' | 'warning' | 'neutral' | 'brand';

const pillTone: Record<Tone, string> = {
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  danger: 'bg-red-50 text-red-700 ring-red-600/20',
  warning: 'bg-amber-50 text-amber-800 ring-amber-600/25',
  neutral: 'bg-gray-100 text-gray-700 ring-gray-500/15',
  brand: 'bg-brand-soft text-brand-ink ring-transparent',
};

export function StatusPill({
  tone = 'neutral',
  icon,
  className,
  children,
}: {
  tone?: Tone;
  icon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold leading-none ring-1 ring-inset',
        pillTone[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/** Pill tone for a due date: red once overdue, amber when due within a few days. */
export function dueTone(tone: DueTone): Tone {
  if (tone === 'overdue') return 'danger';
  if (tone === 'today' || tone === 'soon') return 'warning';
  return 'neutral';
}

const noticeTone: Record<Tone, string> = {
  success: 'bg-emerald-50 text-emerald-800',
  danger: 'bg-red-50 text-red-800',
  warning: 'bg-amber-50 text-amber-900',
  neutral: 'bg-gray-50 text-gray-600',
  brand: 'bg-brand-soft text-brand-ink',
};

/** An inline message box (used where the old screens hid text in hover tooltips). */
export function Notice({
  tone = 'neutral',
  icon,
  className,
  children,
}: {
  tone?: Tone;
  icon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm leading-snug', noticeTone[tone], className)}>
      {icon && <span className="mt-0.5 shrink-0 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function ProgressBar({
  value,
  label,
  className,
  barClassName,
}: {
  /** 0..1 */
  value: number;
  label: string;
  className?: string;
  barClassName?: string;
}) {
  const pct = Math.round(Math.min(1, Math.max(0, value || 0)) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-gray-100', className)}
    >
      <div
        className={cn('h-full rounded-full bg-brand-ink transition-[width] duration-500', barClassName)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function Panel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-2xl border border-gray-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.05)]', className)}
      {...props}
    />
  );
}

export function SectionTitle({
  children,
  action,
  className,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-2 mt-6 flex items-center justify-between gap-3 px-1', className)}>
      <h2 className="text-[15px] font-semibold text-gray-900">{children}</h2>
      {action}
    </div>
  );
}

/** A label/value line in a summary or breakdown. */
export function DetailRow({
  label,
  value,
  hint,
  strong = false,
  className,
  valueClassName,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  strong?: boolean;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4 py-1.5 text-sm', className)}>
      <div className="min-w-0">
        <p className={cn(strong ? 'font-semibold text-gray-900' : 'text-gray-500')}>{label}</p>
        {hint && <p className="mt-0.5 text-xs text-gray-400">{hint}</p>}
      </div>
      <div className={cn('shrink-0 text-right tabular-nums text-gray-900', strong && 'font-semibold', valueClassName)}>
        {value}
      </div>
    </div>
  );
}

/** A large amount with a smaller currency label. */
export function Amount({
  value,
  className,
  currencyClassName,
}: {
  value: React.ReactNode;
  className?: string;
  currencyClassName?: string;
}) {
  return (
    <span className={cn('font-bold tabular-nums tracking-tight', className)}>
      {value}
      <span className={cn('ml-1 text-[0.5em] font-semibold opacity-70', currencyClassName)}>ETB</span>
    </span>
  );
}
