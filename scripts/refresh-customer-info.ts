/**
 * Fetches customer info again for every borrower's active account whose stored copy is older than
 * --older-than-days (default 30). Run once before launch: copies kept since the "fetch once" days
 * still hold old income and lack Branchcode / Kebele / Tinno. After that, the "Fetch customer info
 * every" setting keeps them current on each borrower's visit.
 *
 * Read-only unless --write (it then only counts what it would fetch). A few fetches run at once
 * (--concurrency, default 3) so the data API's queue is not flooded.
 *
 * Usage:
 *   npx tsx -r tsconfig-paths/register scripts/refresh-customer-info.ts
 *   npx tsx -r tsconfig-paths/register scripts/refresh-customer-info.ts --phone 251949385646 --write
 *   npx tsx -r tsconfig-paths/register scripts/refresh-customer-info.ts --write --limit 500
 */
import path from 'path';
import { loadEnvConfig } from '@next/env';
import prisma from '../src/lib/prisma';
import { isFetchedWithin, parseStoredPayload, storedAccountNumber } from '../src/lib/customer-data-api';
import { loadCustomerInfoCopies, syncCustomerInfo } from '../src/lib/customer-info';

const DAY_MS = 24 * 60 * 60 * 1000;

function parseArgs(argv: string[]) {
  const args = { phone: '', write: false, limit: Infinity, olderThanDays: 30, concurrency: 3 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--phone') args.phone = argv[++i] ?? '';
    else if (argv[i] === '--write') args.write = true;
    else if (argv[i] === '--limit') args.limit = Number(argv[++i]);
    else if (argv[i] === '--older-than-days') args.olderThanDays = Number(argv[++i]);
    else if (argv[i] === '--concurrency') args.concurrency = Math.max(1, Number(argv[++i]) || 1);
  }
  return args;
}

async function main() {
  // Read .env the way the app does: a "\$" in a quoted password becomes "$" (plain dotenv keeps the
  // backslash and the data API refuses the login).
  loadEnvConfig(path.resolve(__dirname, '..'));
  const args = parseArgs(process.argv.slice(2));

  const config = await prisma.dataProvisioningConfig.findFirst({ where: { name: 'ExternalCustomerInfo' }, select: { id: true } });
  if (!config) throw new Error('No ExternalCustomerInfo config exists.');

  const links = await prisma.phoneAccount.findMany({
    where: { isActive: true, ...(args.phone ? { phoneNumber: args.phone } : {}) },
    select: { phoneNumber: true, accountNumber: true },
    orderBy: { phoneNumber: 'asc' },
  });

  // Copies of this account fetched within the window are left alone.
  const due: typeof links = [];
  for (const link of links) {
    const copies = (await loadCustomerInfoCopies(link.phoneNumber)).map((c) => parseStoredPayload(c.data));
    const copy = copies.findLast((p) => storedAccountNumber(p) === link.accountNumber);
    if (!copy || !isFetchedWithin(copy, args.olderThanDays * DAY_MS)) due.push(link);
  }
  const todo = due.slice(0, args.limit);
  console.log(`active accounts: ${links.length} | customer info older than ${args.olderThanDays} days or missing: ${due.length} | this run: ${todo.length}`);
  if (!args.write) {
    console.log('\nNothing fetched. Add --write to fetch these.');
    return;
  }

  const counts = { saved: 0, reused: 0, stale: 0, failed: 0 };
  const failures = new Map<string, number>();
  let next = 0;
  let done = 0;
  const started = Date.now();
  const worker = async () => {
    while (next < todo.length) {
      const link = todo[next++];
      try {
        const result = await syncCustomerInfo(link.phoneNumber, link.accountNumber, config.id, { force: true });
        if (result.ok) counts[result.outcome]++;
        else {
          counts.failed++;
          failures.set(String(result.status), (failures.get(String(result.status)) ?? 0) + 1);
        }
      } catch (e: any) {
        counts.failed++;
        failures.set(String(e?.message ?? e).slice(0, 60), (failures.get(String(e?.message ?? e).slice(0, 60)) ?? 0) + 1);
      }
      if (++done % 50 === 0 || done === todo.length) {
        console.log(`   ${done}/${todo.length} after ${Math.round((Date.now() - started) / 1000)}s`);
      }
    }
  };
  await Promise.all(Array.from({ length: args.concurrency }, worker));

  // "stale" = the data API could not be reached and the old copy was kept.
  console.log(`\nsaved ${counts.saved} | kept old copy because the data API failed ${counts.stale} | failed ${counts.failed}`);
  for (const [why, n] of failures) console.log(`   failed (${why}): ${n}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
