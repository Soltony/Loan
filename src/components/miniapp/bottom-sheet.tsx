'use client';

/**
 * A sheet that slides up from the bottom of the phone, for the mini-app's pickers,
 * keypads and confirmations. Built on the same Radix dialog as the rest of the UI.
 */
import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  /** false: the sheet cannot be closed by the user (no close button, outside tap or Escape). */
  dismissible?: boolean;
  /** false: a tap outside the sheet does not close it (the close button and Escape still do). */
  closeOnOutsideTap?: boolean;
  className?: string;
  bodyClassName?: string;
  style?: React.CSSProperties;
}

export function BottomSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  dismissible = true,
  closeOnOutsideTap = true,
  className,
  bodyClassName,
  style,
}: BottomSheetProps) {
  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && !dismissible) return;
        onOpenChange(next);
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-gray-950/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          style={style}
          onPointerDownOutside={(e) => {
            if (!dismissible || !closeOnOutsideTap) e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (!dismissible) e.preventDefault();
          }}
          className={cn(
            'miniapp miniapp-sheet-height fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-md flex-col rounded-t-3xl bg-white text-gray-900 shadow-2xl outline-none',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom data-[state=closed]:duration-200 data-[state=open]:duration-300',
            className,
          )}
        >
          <div aria-hidden className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-gray-200" />
          <div className="flex shrink-0 items-start gap-3 px-5 pt-3">
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="text-lg font-semibold leading-snug">{title}</DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-1 text-sm leading-snug text-gray-500">
                  {description}
                </DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">
                  {typeof title === 'string' ? title : 'Dialog'}
                </DialogPrimitive.Description>
              )}
            </div>
            {dismissible && (
              <DialogPrimitive.Close
                aria-label="Close"
                className="-mr-2 -mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-full text-gray-500 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink"
              >
                <X className="h-5 w-5" />
              </DialogPrimitive.Close>
            )}
          </div>
          <div
            className={cn(
              'min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-4',
              footer ? 'pb-4' : 'pb-[max(env(safe-area-inset-bottom),20px)]',
              bodyClassName,
            )}
          >
            {children}
          </div>
          {footer && (
            <div className="shrink-0 border-t border-gray-100 px-5 pb-[max(env(safe-area-inset-bottom),16px)] pt-3">
              {footer}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
