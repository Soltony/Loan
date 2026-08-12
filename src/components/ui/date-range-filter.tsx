"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * From/To day filter built on native date inputs. Values are `yyyy-MM-dd`
 * (empty string = unset), which is what `parseDayStart`/`parseDayEnd` read.
 */
export interface DateRangeFilterProps {
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  /** Omit to hide the Clear button. */
  onClear?: () => void;
  fromLabel?: string;
  toLabel?: string;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
}

export function DateRangeFilter({
  from,
  to,
  onFromChange,
  onToChange,
  onClear,
  fromLabel = "From",
  toLabel = "To",
  className,
  inputClassName,
  disabled,
}: DateRangeFilterProps) {
  return (
    <div className={cn("flex flex-wrap items-end gap-2", className)}>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">{fromLabel}</span>
        <Input
          type="date"
          value={from}
          max={to || undefined}
          onChange={(e) => onFromChange(e.target.value)}
          className={cn("w-[160px]", inputClassName)}
          disabled={disabled}
        />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">{toLabel}</span>
        <Input
          type="date"
          value={to}
          min={from || undefined}
          onChange={(e) => onToChange(e.target.value)}
          className={cn("w-[160px]", inputClassName)}
          disabled={disabled}
        />
      </div>
      {onClear && (from || to) && (
        <Button variant="ghost" size="sm" onClick={onClear} title="Clear date filter" disabled={disabled}>
          <X className="mr-1 h-4 w-4" /> Clear
        </Button>
      )}
    </div>
  );
}

/** Formats a Date as the `yyyy-MM-dd` value a date input expects. */
export function toDayValue(date: Date | undefined | null): string {
  if (!date || Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
