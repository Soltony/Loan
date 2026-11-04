/**
 * Statement figures: old calculation vs new.
 *
 * Read-only. For every account with a saved statement, compares the figures scoring used
 * (the AccountStatementMetrics row saved when the statement was fetched, computed by the old
 * calculation) with the figures the current computeMetrics gives for the same transactions.
 * Use it to re-set scoring-rule thresholds on the figures before the new calculation goes live.
 *
 * Writes one row per account to scripts/output/statement-figures-comparison-<time>.csv and prints
 * a summary of each figure (10th / 50th / 90th percentile, old and new).
 *
 * Usage:
 *   npx tsx -r tsconfig-paths/register scripts/compare-statement-figures.ts
 */

import path from 'path';
import fs from 'fs';
import prisma from '../src/lib/prisma';
import { computeMetrics, parseAmount } from '../src/lib/statement-utils';

const FIGURES = [
  'avgMonthlyDeposit',
  'monthsAtEbirr',
  'txCountRelevant',
  'billPaymentsCount',
  'avgUniqueDepositSources',
  'avgMonthlyAirtimeCount',
  'avgMonthlyAirtimeValue',
  'withdrawalToDepositRatio',
  'avgBalance',
] as const;

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function percentile(values: number[], p: number): number | null {
  const s = values.filter(Number.isFinite).sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null;
}

function fmt(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '-';
  return Math.abs(v) >= 100 ? Math.round(v).toLocaleString('en-US') : v.toFixed(2);
}

function changedMuch(oldV: number | null, newV: number | null): boolean {
  if (oldV == null || newV == null) return oldV !== newV;
  if (oldV === 0) return newV !== 0;
  return Math.abs(newV - oldV) / Math.abs(oldV) > 0.2;
}

async function main() {
  // Newest statement per borrower + account
  const statements = await prisma.accountStatement.findMany({
    select: { id: true, borrowerId: true, accountNumber: true, startDate: true, endDate: true, openingBalance: true },
    orderBy: { fetchedAt: 'desc' },
  });
  const seen = new Set<string>();
  const latest = statements.filter((s) => {
    const key = `${s.borrowerId}|${s.accountNumber}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const header = ['accountNumber', 'fetchedUpTo', ...FIGURES.flatMap((f) => [`${f}_old`, `${f}_new`])];
  const rows: unknown[][] = [];
  const pairs: Record<string, { old: number | null; new: number | null }[]> = Object.fromEntries(FIGURES.map((f) => [f, []]));

  for (const s of latest) {
    const [lines, old] = await Promise.all([
      prisma.accountStatementLine.findMany({ where: { statementId: s.id }, orderBy: { id: 'asc' } }),
      prisma.accountStatementMetrics.findFirst({
        where: { borrowerId: s.borrowerId, accountNumber: s.accountNumber, periodStart: s.startDate ?? '', periodEnd: s.endDate ?? '' },
      }),
    ]);
    if (!old) continue;
    const fresh = computeMetrics(lines, s.endDate ?? '', parseAmount(s.openingBalance));

    const row: unknown[] = [s.accountNumber, s.endDate];
    for (const f of FIGURES) {
      const o = (old as any)[f] as number | null;
      const n = (fresh as any)[f] as number | null;
      pairs[f].push({ old: o, new: n });
      row.push(o, n);
    }
    rows.push(row);
  }

  const outDir = path.join(process.cwd(), 'scripts', 'output');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `statement-figures-comparison-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`);
  fs.writeFileSync(outPath, [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n'), 'utf8');

  console.log(`Compared ${rows.length} accounts. Per account: ${outPath}\n`);
  console.log(
    'figure'.padEnd(26) +
      'old p10 / p50 / p90'.padStart(30) +
      'new p10 / p50 / p90'.padStart(30) +
      'changed >20%'.padStart(14)
  );
  for (const f of FIGURES) {
    const olds = pairs[f].map((p) => p.old).filter((v): v is number => v != null);
    const news = pairs[f].map((p) => p.new).filter((v): v is number => v != null);
    const band = (v: number[]) => [0.1, 0.5, 0.9].map((p) => fmt(percentile(v, p))).join(' / ');
    const changed = pairs[f].filter((p) => changedMuch(p.old, p.new)).length;
    console.log(f.padEnd(26) + band(olds).padStart(30) + band(news).padStart(30) + `${changed} of ${pairs[f].length}`.padStart(14));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
