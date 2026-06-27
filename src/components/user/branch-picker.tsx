'use client';

import React, { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { BRANCHES } from '@/lib/branches';

function useFilteredBranches(query: string) {
  return useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return BRANCHES;
    return BRANCHES.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        b.id.toLowerCase().includes(q) ||
        String(b.code).includes(q),
    );
  }, [query]);
}

interface SingleBranchPickerProps {
  value: number | null;
  onChange: (code: number | null) => void;
  placeholder?: string;
}

export function SingleBranchPicker({ value, onChange, placeholder = 'Select a branch' }: SingleBranchPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const filtered = useFilteredBranches(query);
  const selected = value != null ? BRANCHES.find((b) => b.code === value) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className={cn('truncate', !selected && 'text-muted-foreground')}>
            {selected ? `${selected.name} (${selected.code})` : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <div className="flex items-center border-b px-3">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search branch by name or code..."
            className="h-9 border-0 px-0 shadow-none focus-visible:ring-0"
          />
        </div>
        <ScrollArea className="h-64">
          <div className="p-1">
            {filtered.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">No branch found.</div>
            ) : (
              filtered.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => {
                    onChange(b.code);
                    setOpen(false);
                    setQuery('');
                  }}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                >
                  <Check className={cn('h-4 w-4', value === b.code ? 'opacity-100' : 'opacity-0')} />
                  <span className="flex-1 truncate">{b.name}</span>
                  <span className="text-xs text-muted-foreground">{b.code}</span>
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

interface MultiBranchPickerProps {
  value: number[];
  onChange: (codes: number[]) => void;
  placeholder?: string;
}

export function MultiBranchPicker({ value, onChange, placeholder = 'Select branches' }: MultiBranchPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const filtered = useFilteredBranches(query);
  const selectedSet = useMemo(() => new Set(value), [value]);

  const toggle = (code: number) => {
    if (selectedSet.has(code)) {
      onChange(value.filter((c) => c !== code));
    } else {
      onChange([...value, code]);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className={cn('truncate', value.length === 0 && 'text-muted-foreground')}>
            {value.length === 0 ? placeholder : `${value.length} branch${value.length === 1 ? '' : 'es'} selected`}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <div className="flex items-center border-b px-3">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search branch by name or code..."
            className="h-9 border-0 px-0 shadow-none focus-visible:ring-0"
          />
        </div>
        <div className="flex items-center justify-between border-b px-3 py-1.5 text-xs text-muted-foreground">
          <span>{value.length} selected</span>
          {value.length > 0 && (
            <button type="button" className="hover:text-foreground underline" onClick={() => onChange([])}>
              Clear
            </button>
          )}
        </div>
        <ScrollArea className="h-64">
          <div className="p-1">
            {filtered.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">No branch found.</div>
            ) : (
              filtered.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => toggle(b.code)}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                >
                  <Checkbox checked={selectedSet.has(b.code)} className="pointer-events-none" />
                  <span className="flex-1 truncate">{b.name}</span>
                  <span className="text-xs text-muted-foreground">{b.code}</span>
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
