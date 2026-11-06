/**
 * Page frame for the customer mini-app: brand colours, phone-width column with side
 * gutters, an optional sticky header with a back button, and an optional sticky footer
 * for the screen's main action.
 */
import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { brandCssVars } from '@/lib/miniapp/brand';
import { cn } from '@/lib/utils';
import { RepaymentWatcher } from './repayment-watcher';

/**
 * Puts the brand colours on :root, so sheets and toasts (which portal out of the page)
 * get them too. The values are rebuilt from parsed hex digits, so nothing from the
 * provider record reaches the stylesheet as-is.
 */
export function BrandStyle({ color }: { color?: string | null }) {
  const css = `:root{${Object.entries(brandCssVars(color))
    .map(([name, value]) => `${name}:${value}`)
    .join(';')}}`;
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}

const backButtonClass =
  'grid h-10 w-10 shrink-0 place-items-center rounded-full text-gray-700 hover:bg-gray-100 active:bg-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink';

export interface MiniAppShellProps {
  brandColor?: string | null;
  title?: React.ReactNode;
  /** Back button that runs a handler (client pages). */
  onBack?: () => void;
  /** Back button that links somewhere (usable from server pages). */
  backHref?: string;
  backLabel?: string;
  headerRight?: React.ReactNode;
  /** Sticky bottom bar, e.g. the screen's main button. */
  footer?: React.ReactNode;
  mainClassName?: string;
  /**
   * false: do not raise the repayment status screen here. For screens with no borrower
   * session (connect), where a resumed wait could only poll into a 401.
   */
  watchRepayments?: boolean;
  children: React.ReactNode;
}

export function MiniAppShell({
  brandColor,
  title,
  onBack,
  backHref,
  backLabel = 'Back',
  headerRight,
  footer,
  mainClassName,
  watchRepayments = true,
  children,
}: MiniAppShellProps) {
  const hasHeader = title !== undefined || !!onBack || !!backHref || !!headerRight;
  return (
    <div className="miniapp flex min-h-screen flex-col bg-gray-100 text-gray-900 antialiased">
      <BrandStyle color={brandColor} />
      {hasHeader && (
        <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur">
          <div className="mx-auto flex h-14 w-full max-w-md items-center gap-1 px-2">
            {onBack ? (
              <button type="button" onClick={onBack} aria-label={backLabel} className={backButtonClass}>
                <ArrowLeft className="h-5 w-5" />
              </button>
            ) : backHref ? (
              <Link href={backHref} aria-label={backLabel} className={backButtonClass}>
                <ArrowLeft className="h-5 w-5" />
              </Link>
            ) : (
              <span className="w-3" aria-hidden />
            )}
            <h1 className="min-w-0 flex-1 truncate text-[17px] font-semibold">{title}</h1>
            {headerRight}
          </div>
        </header>
      )}
      <main className={cn('mx-auto w-full max-w-md flex-1 px-4 pb-8 pt-4', mainClassName)}>{children}</main>
      {footer && (
        <div className="sticky bottom-0 z-20 border-t border-gray-200 bg-white/95 backdrop-blur">
          <div className="mx-auto w-full max-w-md px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3">{footer}</div>
        </div>
      )}
      {watchRepayments && <RepaymentWatcher />}
    </div>
  );
}
