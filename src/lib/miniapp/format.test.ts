import { describe, expect, it } from 'vitest';
import {
  dueStatus,
  firstName,
  formatDate,
  formatETB,
  formatMoney,
  maskAccount,
  repaidShare,
  titleCaseName,
} from './format';
import { forBorrower } from './payload';

describe('formatMoney / formatETB', () => {
  it('formats with thousands separators and two decimals', () => {
    expect(formatMoney(10000)).toBe('10,000.00');
    expect(formatETB(9800.5)).toBe('9,800.50 ETB');
  });

  it('never shows NaN or negative zero', () => {
    expect(formatMoney(undefined)).toBe('0.00');
    expect(formatMoney(Number.NaN)).toBe('0.00');
    expect(formatMoney(-0.001)).toBe('0.00');
  });
});

describe('formatDate', () => {
  it('reads as day month year', () => {
    expect(formatDate(new Date(2026, 6, 24))).toBe('24 Jul 2026');
  });

  it('shows a dash for a missing date', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate('not a date')).toBe('—');
  });
});

describe('dueStatus', () => {
  const asOf = new Date(2026, 6, 20, 15, 30);

  it('counts calendar days, not 24 hour periods', () => {
    expect(dueStatus(new Date(2026, 6, 21, 9, 0), asOf)).toMatchObject({ tone: 'soon', days: 1, label: 'Due in 1 day' });
  });

  it('flags today, soon, later and overdue', () => {
    expect(dueStatus(new Date(2026, 6, 20), asOf).tone).toBe('today');
    expect(dueStatus(new Date(2026, 6, 23), asOf).tone).toBe('soon');
    expect(dueStatus(new Date(2026, 6, 30), asOf)).toMatchObject({ tone: 'later', label: 'Due in 10 days' });
    expect(dueStatus(new Date(2026, 6, 17), asOf)).toMatchObject({ tone: 'overdue', days: 3, label: 'Overdue by 3 days' });
  });
});

describe('names and accounts', () => {
  it('masks all but the last four digits', () => {
    expect(maskAccount('7000042312237')).toBe('•••• 2237');
    expect(maskAccount('123')).toBe('123');
    expect(maskAccount(null)).toBe('');
  });

  it('title-cases upper-case bank names', () => {
    expect(titleCaseName('CHALEW NEGASH  DEGAREGE')).toBe('Chalew Negash Degarege');
    expect(firstName('CHALEW NEGASH DEGAREGE')).toBe('Chalew');
    expect(firstName(undefined)).toBe('');
  });
});

describe('repaidShare', () => {
  it('is the repaid fraction, clamped to 0..1', () => {
    expect(repaidShare(2500, 10000)).toBe(0.25);
    expect(repaidShare(12000, 10000)).toBe(1);
    expect(repaidShare(100, 0)).toBe(0);
  });
});

describe('forBorrower', () => {
  const salaries = JSON.stringify([{ accountNumber: '7000000000001', salary: 10000 }]);
  const product = {
    id: 'p1',
    name: 'Salary Advance',
    icon: 'data:image/png;base64,AAAA',
    salaryAdvanceMappings: salaries,
    provider: { id: 'v1', colorHex: '#f9c00e', icon: 'data:image/png;base64,BBBB' },
  };

  it("drops other customers' salaries and the icons, and keeps everything else", () => {
    expect(forBorrower(product)).toEqual({
      id: 'p1',
      name: 'Salary Advance',
      icon: '',
      salaryAdvanceMappings: null,
      provider: { id: 'v1', colorHex: '#f9c00e', icon: '' },
    });
    expect(product.salaryAdvanceMappings).toBe(salaries); // input untouched
    expect(product.icon).toBe('data:image/png;base64,AAAA');
  });

  it('keeps the icons for screens that draw them, never the salaries', () => {
    const out = forBorrower(product, { keepIcon: true });
    expect(out.icon).toBe('data:image/png;base64,AAAA');
    expect(out.provider.icon).toBe('data:image/png;base64,BBBB');
    expect(out.salaryAdvanceMappings).toBeNull();
  });

  it('does not add fields a product does not have', () => {
    expect(forBorrower({ id: 'p1', icon: 'x' })).toEqual({ id: 'p1', icon: '' });
  });
});
