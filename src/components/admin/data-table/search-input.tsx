'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * A search box whose text reaches `onChange` `delay` ms after the last
 * keystroke (trimmed), with a clear button. A different `value` from outside
 * (a link, a reset) replaces what is typed.
 */
export function SearchInput({
  value,
  onChange,
  placeholder,
  disabled = false,
  delay = 300,
  label = 'Search',
  className,
}: {
  value: string;
  onChange: (search: string) => void;
  placeholder: string;
  disabled?: boolean;
  delay?: number;
  /** Accessible name of the box. */
  label?: string;
  className?: string;
}) {
  const [text, setText] = useState(value);
  // The last value handed out: a different `value` comes from elsewhere.
  const sent = useRef(value);
  useEffect(() => {
    if (value !== sent.current) {
      sent.current = value;
      setText(value);
    }
  }, [value]);
  useEffect(() => {
    const next = text.trim();
    if (next === sent.current) return;
    const timer = setTimeout(() => {
      sent.current = next;
      onChange(next);
    }, delay);
    return () => clearTimeout(timer);
  }, [text, onChange, delay]);

  return (
    <div className={cn('relative w-full max-w-md', className)}>
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="text"
        aria-label={label}
        placeholder={placeholder}
        value={disabled ? '' : text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        className="pl-9 pr-9"
      />
      {text && !disabled ? (
        <button
          type="button"
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground hover:text-foreground"
          onClick={() => {
            setText('');
            sent.current = '';
            onChange('');
          }}
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
