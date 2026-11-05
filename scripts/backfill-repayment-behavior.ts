/**
 * Sets repaymentBehavior (EARLY / ON_TIME / LATE) on repaid loans that have none, from the date of
 * the loan's last payment against its due date - the same rule the repayment paths now apply
 * (repaymentBehaviorFor in src/lib/credit-history.ts). Loans repaid through the installment paths
 * never got it before 2026-11-05, so scoring saw no repayment history for most borrowers.
 *
 * Read-only unless --write. Loans without any payment record are listed, not guessed.
 *
 * Usage:
 *   npx tsx -r tsconfig-paths/register scripts/backfill-repayment-behavior.ts
 *   npx tsx -r tsconfig-paths/register scripts/backfill-repayment-behavior.ts --phone 251949385646 --write
 *   npx tsx -r tsconfig-paths/register scripts/backfill-repayment-behavior.ts --write
 */
import prisma from '../src/lib/prisma';
import { repaymentBehaviorFor, type RepaymentBehavior } from '../src/lib/credit-history';

function parseArgs(argv: string[]) {
  const args = { phone: '', write: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--phone') args.phone = argv[++i] ?? '';
    else if (argv[i] === '--write') args.write = true;
  }
  return args;
}

// SQL Server takes at most 2100 parameters per statement: write ids in chunks.
const CHUNK = 1000;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const loans = await prisma.loan.findMany({
    where: { repaymentStatus: 'Paid', repaymentBehavior: null, ...(args.phone ? { borrowerId: args.phone } : {}) },
    select: { id: true, dueDate: true, payments: { select: { date: true }, orderBy: { date: 'desc' }, take: 1 } },
  });
  console.log(`repaid loans without a repayment behaviour${args.phone ? ` for ${args.phone}` : ''}: ${loans.length}`);

  const byBehavior: Record<RepaymentBehavior, string[]> = { EARLY: [], ON_TIME: [], LATE: [] };
  const noPayment: string[] = [];
  for (const loan of loans) {
    const lastPayment = loan.payments[0]?.date;
    if (!lastPayment) noPayment.push(loan.id);
    else byBehavior[repaymentBehaviorFor(lastPayment, loan.dueDate)].push(loan.id);
  }
  console.log(`   EARLY ${byBehavior.EARLY.length} | ON_TIME ${byBehavior.ON_TIME.length} | LATE ${byBehavior.LATE.length} | no payment record (left as is) ${noPayment.length}`);
  if (noPayment.length) console.log(`   without a payment record: ${noPayment.slice(0, 10).join(', ')}${noPayment.length > 10 ? ', ...' : ''}`);

  if (!args.write) {
    console.log('\nNothing written. Add --write to set these.');
    return;
  }
  let written = 0;
  for (const behavior of Object.keys(byBehavior) as RepaymentBehavior[]) {
    const ids = byBehavior[behavior];
    for (let i = 0; i < ids.length; i += CHUNK) {
      // repaymentBehavior: null again in the filter, so a loan set meanwhile by a repayment is kept.
      const result = await prisma.loan.updateMany({
        where: { id: { in: ids.slice(i, i + CHUNK) }, repaymentBehavior: null },
        data: { repaymentBehavior: behavior },
      });
      written += result.count;
    }
  }
  console.log(`\nwritten: ${written}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
