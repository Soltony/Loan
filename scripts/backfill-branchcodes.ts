/**
 * One-time Branchcode backfill.
 *
 * ExternalCustomerInfo payloads cached before the CBS customer-info service
 * started returning `Branchcode` have no branch data, so those customers never
 * match any branch filter. This script finds every ProvisionedData row whose
 * payload has an account number but no Branchcode, re-calls the CBS service
 * once per unique account, and merges the fresh `detail` into the stored JSON
 * (existing fields such as TINNo are preserved; fresh fields win on conflict).
 *
 * Rows are only written when the fresh response actually contains a
 * Branchcode; accounts that still come back without one are reported instead.
 *
 * Usage:
 *   npx tsx -r tsconfig-paths/register scripts/backfill-branchcodes.ts [options]
 *
 * Options:
 *   --apply        Actually call the CBS service and write changes. Without
 *                  this the script runs a DRY-RUN (no upstream calls, no writes)
 *                  and just reports which rows/accounts need backfilling.
 *   --limit <n>    Only process the first <n> unique accounts (for testing).
 *   --delay <ms>   Pause between upstream calls (default 300ms).
 */

import prisma from '../src/lib/prisma';

const EXTERNAL_CUSTOMER_INFO = 'ExternalCustomerInfo';

function parseArgs(argv: string[]) {
  const args = { apply: false, limit: 0, delay: 300 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--limit') args.limit = parseInt(argv[++i] ?? '0', 10) || 0;
    else if (a === '--delay') args.delay = parseInt(argv[++i] ?? '300', 10) || 300;
  }
  return args;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Recursively find a Branchcode/branchcode key (it lives under `detail` in CBS payloads). */
function extractBranchCode(value: unknown): number | null {
  if (value == null || typeof value !== 'object') return null;
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (key.toLowerCase() === 'branchcode') {
      const n = typeof v === 'number' ? v : parseInt(String(v), 10);
      if (Number.isFinite(n)) return n;
    } else if (v && typeof v === 'object') {
      const nested = extractBranchCode(v);
      if (nested != null) return nested;
    }
  }
  return null;
}

function extractAccountNumber(payload: any): string | null {
  const candidate = payload?.detail ?? payload;
  const account =
    payload?.accountNumber ??
    candidate?.AccountNumber ??
    candidate?.accountNumber ??
    candidate?.account_number ??
    null;
  return account != null ? String(account) : null;
}

async function fetchCustomerInfo(
  accountNumber: string,
  auth: string,
  apiUrl: string
): Promise<{ detail: any } | { error: string }> {
  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({ accountNumber }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { error: `upstream ${res.status} ${text.slice(0, 200)}` };
    }
    const data = await res.json().catch(() => null);
    const detail = data?.detail ?? data?.details ?? data;
    if (!detail || typeof detail !== 'object') return { error: 'empty/unparseable response' };
    return { detail };
  } catch (e: any) {
    return { error: String(e?.message ?? e) };
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const rows = await prisma.provisionedData.findMany({
    where: { config: { name: EXTERNAL_CUSTOMER_INFO } },
    select: { id: true, borrowerId: true, data: true },
  });

  // Group rows missing a Branchcode by account number (same account can be
  // provisioned under several provider configs — fetch once, update all rows).
  const byAccount = new Map<string, { id: string; borrowerId: string; payload: any }[]>();
  let unparseable = 0;
  let noAccount = 0;
  let alreadyHasCode = 0;

  for (const row of rows) {
    let payload: any;
    try {
      payload = JSON.parse(row.data);
    } catch {
      unparseable++;
      continue;
    }
    if (extractBranchCode(payload) != null) {
      alreadyHasCode++;
      continue;
    }
    const account = extractAccountNumber(payload);
    if (!account) {
      noAccount++;
      continue;
    }
    const list = byAccount.get(account) ?? [];
    list.push({ id: row.id, borrowerId: row.borrowerId, payload });
    byAccount.set(account, list);
  }

  let accounts = [...byAccount.keys()];
  if (args.limit > 0) accounts = accounts.slice(0, args.limit);

  console.log(`ExternalCustomerInfo rows scanned : ${rows.length}`);
  console.log(`  already have Branchcode        : ${alreadyHasCode}`);
  console.log(`  missing Branchcode (backfill)  : ${byAccount.size} account(s)`);
  console.log(`  no account number (skipped)    : ${noAccount}`);
  console.log(`  unparseable JSON (skipped)     : ${unparseable}`);

  if (!args.apply) {
    const PREVIEW = 20;
    for (const account of accounts.slice(0, PREVIEW)) {
      const rowsForAccount = byAccount.get(account)!;
      const names = rowsForAccount
        .map((r) => r.payload?.detail?.CustomerName ?? '?')
        .filter((v, i, a) => a.indexOf(v) === i);
      console.log(`  would backfill ${account} (${rowsForAccount.length} row(s), ${names.join(', ')})`);
    }
    if (accounts.length > PREVIEW) {
      console.log(`  ... and ${accounts.length - PREVIEW} more account(s)`);
    }
    console.log('\nDRY-RUN: no upstream calls made, nothing written. Re-run with --apply to backfill.');
    return;
  }

  const apiUrl = process.env.EXTERNAL_CUSTOMER_INFO_URL ?? '';
  const user = process.env.EXTERNAL_API_USERNAME;
  const pass = process.env.EXTERNAL_API_PASSWORD;
  if (!apiUrl || !user || !pass) {
    console.error(
      'EXTERNAL_CUSTOMER_INFO_URL / EXTERNAL_API_USERNAME / EXTERNAL_API_PASSWORD must be set.'
    );
    process.exitCode = 1;
    return;
  }
  const auth = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');

  let updatedRows = 0;
  let stillMissing = 0;
  const failures: string[] = [];

  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i];
    if (i > 0) await sleep(args.delay);

    const result = await fetchCustomerInfo(account, auth, apiUrl);
    if ('error' in result) {
      failures.push(`${account}: ${result.error}`);
      console.warn(`[${i + 1}/${accounts.length}] ${account} FAILED: ${result.error}`);
      continue;
    }

    const freshCode = extractBranchCode(result.detail);
    if (freshCode == null) {
      stillMissing++;
      console.warn(`[${i + 1}/${accounts.length}] ${account} still has no Branchcode upstream — row left unchanged`);
      continue;
    }

    for (const row of byAccount.get(account)!) {
      // Merge instead of overwrite: keep fields the fresh response doesn't
      // return (e.g. TINNo added by the TIN migration).
      const oldDetail =
        row.payload?.detail && typeof row.payload.detail === 'object' ? row.payload.detail : {};
      const merged = {
        ...row.payload,
        source: 'external-customer-info',
        accountNumber: account,
        fetchedAt: new Date().toISOString(),
        detail: { ...oldDetail, ...result.detail },
      };
      await prisma.provisionedData.update({
        where: { id: row.id },
        data: { data: JSON.stringify(merged) },
      });
      updatedRows++;
    }
    console.log(`[${i + 1}/${accounts.length}] ${account} -> Branchcode ${freshCode} (${byAccount.get(account)!.length} row(s) updated)`);
  }

  console.log('\nSummary');
  console.log(`  accounts processed   : ${accounts.length}`);
  console.log(`  rows updated         : ${updatedRows}`);
  console.log(`  still no Branchcode  : ${stillMissing}`);
  console.log(`  fetch failures       : ${failures.length}`);
  for (const f of failures) console.log(`    ${f}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
