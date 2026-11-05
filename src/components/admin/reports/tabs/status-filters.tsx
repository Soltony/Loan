'use client';

import { Button } from '@/components/ui/button';
import { LOAN_STATUSES } from '../lib/report-filters';
import { AGING_CLASSES, type AgingClass, type LoanStatus } from '../types';

function Segmented<V extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ value?: V; label: string }>;
  value?: V;
  onChange: (value?: V) => void;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex flex-wrap gap-1">
      {options.map((option) => (
        <Button
          key={option.label}
          type="button"
          size="sm"
          variant={value === option.value ? 'default' : 'outline'}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

/** Loan status filter of the loan tabs. */
export function LoanStatusFilter({ value, onChange }: { value?: LoanStatus; onChange: (status?: LoanStatus) => void }) {
  return (
    <Segmented label="Loan status" options={[{ label: 'All statuses' }, ...LOAN_STATUSES]} value={value} onChange={onChange} />
  );
}

/** Aging class filter of the borrower-level aging table. */
export function AgingClassFilter({ value, onChange }: { value?: AgingClass; onChange: (agingClass?: AgingClass) => void }) {
  return (
    <Segmented
      label="Aging class"
      options={[{ label: 'All classes' }, ...AGING_CLASSES.map((c) => ({ value: c.key, label: c.label }))]}
      value={value}
      onChange={onChange}
    />
  );
}
