/**
 * TIN Number migration / import.
 *
 * Reads the manually-collected TIN spreadsheet (Excel) and writes each TIN into the
 * matching borrower's ProvisionedData `data` JSON as a `TINNo` property, preserving all
 * existing JSON fields.
 *
 * Matching: the Account Number (column "Account Number (Starts with 7000…)") is the most
 * reliable identifier available in the sheet. Borrowers are keyed by phone number, so an
 * account number is resolved to borrower(s) via:
 *   1. PhoneAccount.accountNumber -> phoneNumber (borrowerId)
 *   2. ProvisionedData whose stored JSON accountNumber/detail.AccountNumber matches
 *
 * Records that cannot be matched (or whose account/TIN is unusable) are skipped and written
 * to a report CSV for manual review.
 *
 * Usage:
 *   npx tsx -r tsconfig-paths/register scripts/migrate-tin-numbers.ts [options]
 *
 * Options:
 *   --apply            Actually write changes. Without this the script runs a DRY-RUN (no writes).
 *   --create-missing   For accounts that map to a known borrower with NO ProvisionedData row,
 *                      create a minimal row to hold the TIN (default: skip & report instead).
 *   --file <path>      Path to the .xlsx file (default: Docs/ALL MEREGD TIN NUMBER (3).xlsx).
 *   --limit <n>        Only process the first <n> valid entries (for testing).
 */

import path from 'path';
import fs from 'fs';
import ExcelJS from 'exceljs';
import prisma from '../src/lib/prisma';
import { Prisma } from '@prisma/client';

const EXTERNAL_CUSTOMER_INFO = 'ExternalCustomerInfo';
const TIN_KEY = 'TINNo';

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
function parseArgs(argv: string[]) {
  const args = { apply: false, createMissing: false, file: '', limit: 0 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--create-missing') args.createMissing = true;
    else if (a === '--file') args.file = argv[++i] ?? '';
    else if (a === '--limit') args.limit = parseInt(argv[++i] ?? '0', 10) || 0;
  }
  if (!args.file) {
    args.file = path.join(process.cwd(), 'Docs', 'ALL MEREGD TIN NUMBER (3).xlsx');
  }
  return args;
}

// ---------------------------------------------------------------------------
// Cell / value helpers
// ---------------------------------------------------------------------------
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  const v: any = value;
  if (typeof v === 'object') {
    if (typeof v.result !== 'undefined') return cellText(v.result); // formula
    if (typeof v.text === 'string') return v.text; // hyperlink
    if (Array.isArray(v.richText)) return v.richText.map((rt: any) => rt.text).join(''); // rich text
  }
  return String(value);
}

function normalizeDigits(raw: string): string {
  return (raw || '').replace(/[^0-9]/g, '');
}

/** Clean an account number; returns the 7000… digit string or null if unusable. */
function cleanAccount(raw: string): string | null {
  const digits = normalizeDigits(raw);
  if (!digits.startsWith('7000')) return null;
  if (digits.length < 12 || digits.length > 14) return null; // canonical length is 13
  return digits;
}

/** Clean a TIN value; returns a digit string or null if it is not a usable TIN. */
function cleanTin(raw: string): string | null {
  if (raw === null || raw === undefined) return null;
  const original = String(raw).trim();
  if (!original) return null;
  const upper = original.toUpperCase();
  // Non-values seen in the sheet.
  if (upper.includes('PROCESS') || upper.includes('CONTRAT') || upper.includes('CONTRACT')) {
    return null;
  }
  let t = original.replace(/['"`,*\s]/g, ''); // strip quotes, backtick, comma, asterisk, whitespace
  t = t.replace(/[Oo]/g, '0'); // letter O mistyped as zero
  t = t.replace(/[^0-9]/g, ''); // drop any remaining non-digits (hyphens, stray letters)
  if (t.length < 5) return null; // too short to be a real TIN / leftover junk
  if (/^0+$/.test(t)) return null; // all zeros
  return t;
}

// ---------------------------------------------------------------------------
// Sheet parsing
// ---------------------------------------------------------------------------
interface RawEntry {
  account: string;
  tin: string;
  name: string;
  sheet: string;
  row: number;
}

function findHeader(ws: ExcelJS.Worksheet): { headerRow: number; accountCol: number; tinCol: number; nameCol: number } | null {
  const maxScan = Math.min(ws.rowCount, 12);
  for (let r = 1; r <= maxScan; r++) {
    const row = ws.getRow(r);
    let accountCol = -1;
    let tinCol = -1;
    let nameCol = -1;
    for (let c = 1; c <= ws.columnCount; c++) {
      const text = cellText(row.getCell(c).value).toLowerCase();
      if (!text) continue;
      if (accountCol === -1 && text.includes('account') && text.includes('number')) accountCol = c;
      if (text.includes('tin')) tinCol = c; // last "TIN" wins (avoids a stray earlier match)
      if (nameCol === -1 && text.includes('name')) nameCol = c;
    }
    if (accountCol !== -1 && tinCol !== -1) {
      return { headerRow: r, accountCol, tinCol, nameCol };
    }
  }
  return null;
}

function parseSheet(ws: ExcelJS.Worksheet): RawEntry[] {
  const header = findHeader(ws);
  if (!header) return [];
  const entries: RawEntry[] = [];
  for (let r = header.headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const account = cellText(row.getCell(header.accountCol).value).trim();
    const tin = cellText(row.getCell(header.tinCol).value).trim();
    const name = header.nameCol > 0 ? cellText(row.getCell(header.nameCol).value).trim() : '';
    if (!account && !tin && !name) continue; // blank row
    entries.push({ account, tin, name, sheet: ws.name, row: r });
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------
function csvCell(v: string): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function writeReport(fileName: string, header: string[], rows: string[][]): string {
  const outDir = path.join(process.cwd(), 'scripts', 'output');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, fileName);
  const lines = [header, ...rows].map((cols) => cols.map(csvCell).join(','));
  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
  return outPath;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');

  console.log('TIN migration');
  console.log('  file       :', args.file);
  console.log('  mode       :', args.apply ? 'APPLY (writes enabled)' : 'DRY-RUN (no writes)');
  console.log('  create-missing:', args.createMissing);
  if (args.limit) console.log('  limit      :', args.limit);
  console.log('');

  if (!fs.existsSync(args.file)) {
    console.error(`File not found: ${args.file}`);
    process.exit(1);
  }

  // --- Read the workbook -----------------------------------------------------
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.readFile(args.file);
  } catch (e: any) {
    console.error('Failed to read the Excel file. If it is open in Excel, close it and retry.');
    console.error(String(e?.message ?? e));
    process.exit(1);
  }

  let rawEntries: RawEntry[] = [];
  for (const ws of wb.worksheets) {
    if (ws.rowCount === 0) continue;
    const parsed = parseSheet(ws);
    console.log(`  sheet "${ws.name}": ${parsed.length} data rows`);
    rawEntries = rawEntries.concat(parsed);
  }
  console.log(`  total data rows: ${rawEntries.length}\n`);

  // --- Clean & dedupe --------------------------------------------------------
  const skippedBadAccount: string[][] = [];
  const skippedBadTin: string[][] = [];
  const duplicates: string[][] = [];

  // account -> { tin, name }
  const byAccount = new Map<string, { tin: string; name: string }>();

  for (const e of rawEntries) {
    const account = cleanAccount(e.account);
    if (!account) {
      skippedBadAccount.push([e.sheet, String(e.row), e.account, e.tin, e.name]);
      continue;
    }
    const tin = cleanTin(e.tin);
    if (!tin) {
      skippedBadTin.push([e.sheet, String(e.row), e.account, e.tin, e.name]);
      continue;
    }
    const existing = byAccount.get(account);
    if (existing) {
      if (existing.tin !== tin) {
        duplicates.push([account, existing.tin, tin, e.name]);
      }
      continue; // keep first
    }
    byAccount.set(account, { tin, name: e.name });
  }

  let entries = Array.from(byAccount.entries()).map(([account, v]) => ({ account, ...v }));
  if (args.limit && entries.length > args.limit) entries = entries.slice(0, args.limit);

  console.log('  cleaned entries (unique accounts):', entries.length);
  console.log('  skipped — bad/missing account   :', skippedBadAccount.length);
  console.log('  skipped — bad/missing TIN        :', skippedBadTin.length);
  console.log('  duplicate accounts (conflicting) :', duplicates.length, '\n');

  // --- Build match indexes from the DB --------------------------------------
  const phoneAccounts = await prisma.phoneAccount.findMany({
    select: { phoneNumber: true, accountNumber: true },
  });
  const acctToPhones = new Map<string, Set<string>>();
  for (const pa of phoneAccounts) {
    const acct = normalizeDigits(String(pa.accountNumber));
    if (!acct) continue;
    if (!acctToPhones.has(acct)) acctToPhones.set(acct, new Set());
    acctToPhones.get(acct)!.add(String(pa.phoneNumber));
  }

  const pdRows = await prisma.provisionedData.findMany({
    where: { config: { name: EXTERNAL_CUSTOMER_INFO } },
    select: { id: true, borrowerId: true, data: true },
  });
  const pdByBorrower = new Map<string, { id: string; data: string }[]>();
  const acctToBorrowers = new Map<string, Set<string>>();
  for (const pd of pdRows) {
    const list = pdByBorrower.get(pd.borrowerId) ?? [];
    list.push({ id: pd.id, data: pd.data as string });
    pdByBorrower.set(pd.borrowerId, list);
    try {
      const j = JSON.parse(pd.data as string);
      const d = j?.detail ?? j;
      const acct = normalizeDigits(String(d?.AccountNumber ?? d?.accountNumber ?? j?.accountNumber ?? ''));
      if (acct) {
        if (!acctToBorrowers.has(acct)) acctToBorrowers.set(acct, new Set());
        acctToBorrowers.get(acct)!.add(pd.borrowerId);
      }
    } catch {
      /* ignore unparseable rows */
    }
  }

  console.log('  PhoneAccount rows:', phoneAccounts.length);
  console.log('  ProvisionedData (ExternalCustomerInfo) rows:', pdRows.length, '\n');

  // Resolve a config id lazily (only needed with --create-missing).
  let cachedConfigId: string | null = null;
  async function getConfigId(): Promise<string | null> {
    if (cachedConfigId) return cachedConfigId;
    const cfg = await prisma.dataProvisioningConfig.findFirst({
      where: { name: EXTERNAL_CUSTOMER_INFO },
      select: { id: true },
    });
    cachedConfigId = cfg?.id ?? null;
    return cachedConfigId;
  }

  async function ensureBorrower(borrowerId: string) {
    try {
      await prisma.borrower.create({ data: { id: borrowerId, status: 'Active' } });
    } catch (e: any) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
    }
  }

  // --- Match & update --------------------------------------------------------
  let updated = 0; // accounts where >=1 PD row got a new/changed TIN
  let alreadySet = 0; // accounts where every matched PD row already had this TIN
  let created = 0; // accounts where a PD row was created (--create-missing)
  let rowsWritten = 0; // individual PD rows written
  let errors = 0;

  const unmatched: string[][] = [];
  const matchedNoPd: string[][] = [];

  for (const entry of entries) {
    try {
      const targetBorrowers = new Set<string>();
      for (const p of acctToPhones.get(entry.account) ?? []) targetBorrowers.add(p);
      for (const b of acctToBorrowers.get(entry.account) ?? []) targetBorrowers.add(b);

      if (targetBorrowers.size === 0) {
        unmatched.push([entry.account, entry.tin, entry.name, 'no borrower/account match']);
        continue;
      }

      let didWrite = false;
      let didCreate = false;
      let sawExistingSame = false;
      const noPdBorrowers: string[] = [];

      for (const borrowerId of targetBorrowers) {
        const rows = pdByBorrower.get(borrowerId);
        if (rows && rows.length) {
          for (const row of rows) {
            let parsed: Record<string, any>;
            try {
              parsed = JSON.parse(row.data);
              if (!parsed || typeof parsed !== 'object') parsed = {};
            } catch {
              parsed = {};
            }
            if (String(parsed[TIN_KEY] ?? '').trim() === entry.tin) {
              sawExistingSame = true;
              continue; // already correct — nothing to do
            }
            parsed[TIN_KEY] = entry.tin;
            const nextData = JSON.stringify(parsed);
            if (args.apply) {
              await prisma.provisionedData.update({ where: { id: row.id }, data: { data: nextData } });
            }
            row.data = nextData; // keep index fresh for later duplicate accounts
            didWrite = true;
            rowsWritten++;
          }
        } else {
          noPdBorrowers.push(borrowerId);
        }
      }

      if (noPdBorrowers.length && args.createMissing) {
        const configId = await getConfigId();
        if (!configId) {
          errors++;
          unmatched.push([entry.account, entry.tin, entry.name, 'no config to create ProvisionedData']);
          continue;
        }
        for (const borrowerId of noPdBorrowers) {
          const payload = {
            source: 'tin-migration',
            accountNumber: entry.account,
            [TIN_KEY]: entry.tin,
            savedAt: new Date().toISOString(),
          };
          if (args.apply) {
            await ensureBorrower(borrowerId);
            await prisma.provisionedData.create({
              data: { borrowerId, configId, data: JSON.stringify(payload) },
            });
          }
          // reflect in index so we don't double-create
          const list = pdByBorrower.get(borrowerId) ?? [];
          list.push({ id: `new-${borrowerId}`, data: JSON.stringify(payload) });
          pdByBorrower.set(borrowerId, list);
          didCreate = true;
          rowsWritten++;
        }
      } else if (noPdBorrowers.length && !didWrite) {
        // Matched a borrower but they have no ProvisionedData row and we're not creating one.
        matchedNoPd.push([entry.account, entry.tin, entry.name, noPdBorrowers.join('|')]);
      }

      if (didWrite) updated++;
      else if (didCreate) created++;
      else if (sawExistingSame) alreadySet++;
    } catch (e: any) {
      errors++;
      console.error(`  error on account ${entry.account}:`, String(e?.message ?? e));
    }
  }

  // --- Reports ---------------------------------------------------------------
  const reportPaths: string[] = [];
  if (unmatched.length) {
    reportPaths.push(
      writeReport(`tin-unmatched-${stamp}.csv`, ['AccountNumber', 'TIN', 'Name', 'Reason'], unmatched),
    );
  }
  if (matchedNoPd.length) {
    reportPaths.push(
      writeReport(`tin-matched-no-provisioneddata-${stamp}.csv`, ['AccountNumber', 'TIN', 'Name', 'BorrowerIds'], matchedNoPd),
    );
  }
  if (skippedBadAccount.length || skippedBadTin.length) {
    const rows = [
      ...skippedBadAccount.map((r) => ['bad-account', ...r]),
      ...skippedBadTin.map((r) => ['bad-tin', ...r]),
    ];
    reportPaths.push(
      writeReport(`tin-skipped-${stamp}.csv`, ['Reason', 'Sheet', 'Row', 'AccountRaw', 'TINRaw', 'Name'], rows),
    );
  }

  // --- Summary ---------------------------------------------------------------
  console.log('\n================ SUMMARY ================');
  console.log('Mode                         :', args.apply ? 'APPLIED' : 'DRY-RUN (no writes)');
  console.log('Data rows read               :', rawEntries.length);
  console.log('Unique account entries       :', byAccount.size, args.limit ? `(processed ${entries.length} due to --limit)` : '');
  console.log('----------------------------------------');
  console.log('Matched & updated (accounts) :', updated);
  console.log('Created (missing PD)         :', created);
  console.log('Already had this TIN         :', alreadySet);
  console.log('ProvisionedData rows written :', rowsWritten);
  console.log('----------------------------------------');
  console.log('Matched borrower, no PD row  :', matchedNoPd.length, args.createMissing ? '' : '(skipped — rerun with --create-missing to create)');
  console.log('Unmatched (no borrower)      :', unmatched.length);
  console.log('Skipped — bad/missing account:', skippedBadAccount.length);
  console.log('Skipped — bad/missing TIN     :', skippedBadTin.length);
  console.log('Duplicate accounts (conflict) :', duplicates.length);
  console.log('Errors                        :', errors);
  console.log('========================================');
  if (reportPaths.length) {
    console.log('\nReports written:');
    for (const p of reportPaths) console.log('  -', p);
  }
  if (!args.apply) {
    console.log('\nThis was a DRY-RUN. Re-run with --apply to write the TIN Numbers.');
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (e) => {
    console.error('Fatal:', e?.message ?? e);
    await prisma.$disconnect();
    process.exit(1);
  });
