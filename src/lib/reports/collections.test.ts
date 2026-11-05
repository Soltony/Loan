import { describe, expect, it } from 'vitest';
import { collectionTotals, sortCollections, type CollectionRow } from './collections';

const row = (provider: string, date: string, total: number): CollectionRow => ({
  provider,
  date,
  principal: total * 0.8,
  interest: total * 0.15,
  serviceFee: 0,
  penalty: total * 0.05,
  tax: 0,
  unapplied: 0,
  total,
  outstandingPrincipal: 1000,
  outstandingLoans: 3,
});

describe('collections', () => {
  const rows = [row('NIB BANK', '2026-05-02', 100), row('Acme', '2026-05-02', 300), row('NIB BANK', '2026-05-03', 200)];

  it('lists the latest day first, providers A–Z within a day', () => {
    expect(sortCollections(rows, { by: 'date', dir: 'desc' }).map((r) => `${r.date} ${r.provider}`)).toEqual([
      '2026-05-03 NIB BANK',
      '2026-05-02 Acme',
      '2026-05-02 NIB BANK',
    ]);
  });

  it('sorts by any amount, ties falling back to the latest day', () => {
    expect(sortCollections(rows, { by: 'total', dir: 'desc' }).map((r) => r.total)).toEqual([300, 200, 100]);
    expect(sortCollections(rows, { by: 'outstandingLoans', dir: 'asc' }).map((r) => r.date)).toEqual([
      '2026-05-03',
      '2026-05-02',
      '2026-05-02',
    ]);
  });

  it('totals the amounts of every day, not the end-of-day balances', () => {
    const totals = collectionTotals(rows);
    expect(totals.total).toBe(600);
    expect(totals.principal).toBeCloseTo(480);
    expect(totals).not.toHaveProperty('outstandingPrincipal');
    expect(collectionTotals([]).total).toBe(0);
  });
});
