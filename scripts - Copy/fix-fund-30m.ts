/**
 * One-off data fix:
 *  - Reset NIB BANK startingCapital (Initial fund) from 100,000,000 back to 70,000,000.
 *  - Record the 30,000,000 that was manually injected as a FundReplenishment history entry.
 *  - Leave initialBalance (Available for disbursement) UNCHANGED — the 30M is already in it.
 *
 * Dry run by default. Pass --apply to commit the changes.
 */
import prisma from '../src/lib/prisma';

const PROVIDER_NAME = 'NIB BANK';
const NEW_STARTING_CAPITAL = 70_000_000;
const EXPECTED_OLD_STARTING_CAPITAL = 100_000_000;
const REPLENISH_AMOUNT = 30_000_000;
const REPLENISH_DATE = new Date('2026-05-26T09:00:00.000Z');
const BALANCE_BEFORE = 0; // fund was depleted ("finished") before the injection
const BALANCE_AFTER = BALANCE_BEFORE + REPLENISH_AMOUNT;
const REMARKS =
  'Retroactive replenishment: 30,000,000 capital injection made on 2026-05-26 to continue lending after the initial 70,000,000 fund was depleted. Recorded after the revolving-fund feature was added; initial fund reset from 100,000,000 to 70,000,000.';

async function run() {
  const apply = process.argv.includes('--apply');

  const provider = await prisma.loanProvider.findUnique({
    where: { name: PROVIDER_NAME },
    select: { id: true, name: true, startingCapital: true, initialBalance: true },
  });
  if (!provider) throw new Error(`Provider "${PROVIDER_NAME}" not found.`);

  console.log('--- BEFORE ---');
  console.log(`startingCapital : ${provider.startingCapital.toLocaleString()}`);
  console.log(`initialBalance  : ${provider.initialBalance.toLocaleString()}`);

  if (provider.startingCapital !== EXPECTED_OLD_STARTING_CAPITAL) {
    console.warn(
      `\n[!] startingCapital is ${provider.startingCapital.toLocaleString()}, expected ${EXPECTED_OLD_STARTING_CAPITAL.toLocaleString()}. Aborting to be safe.`,
    );
    return;
  }

  const existing = await (prisma as any).fundReplenishment.findFirst({
    where: { providerId: provider.id, amount: REPLENISH_AMOUNT },
  });
  if (existing) {
    console.warn(
      `\n[!] A ${REPLENISH_AMOUNT.toLocaleString()} replenishment already exists (id=${existing.id}). Aborting to avoid a duplicate.`,
    );
    return;
  }

  const recorder = await prisma.user.findFirst({
    where: { email: 'admin@example.com' },
    select: { id: true, fullName: true },
  });
  if (!recorder) throw new Error('Recorder user (admin@example.com) not found.');

  console.log('\n--- PLANNED CHANGES ---');
  console.log(`startingCapital : ${provider.startingCapital.toLocaleString()} -> ${NEW_STARTING_CAPITAL.toLocaleString()}`);
  console.log(`initialBalance  : ${provider.initialBalance.toLocaleString()} (UNCHANGED)`);
  console.log(
    `+ FundReplenishment: amount=${REPLENISH_AMOUNT.toLocaleString()}, date=${REPLENISH_DATE.toISOString()}, before=${BALANCE_BEFORE.toLocaleString()}, after=${BALANCE_AFTER.toLocaleString()}, by=${recorder.fullName}`,
  );

  if (!apply) {
    console.log('\nDRY RUN — no changes written. Re-run with --apply to commit.');
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.loanProvider.update({
      where: { id: provider.id },
      data: { startingCapital: NEW_STARTING_CAPITAL },
    });

    const record = await (tx as any).fundReplenishment.create({
      data: {
        providerId: provider.id,
        amount: REPLENISH_AMOUNT,
        remarks: REMARKS,
        replenishmentDate: REPLENISH_DATE,
        balanceBefore: BALANCE_BEFORE,
        balanceAfter: BALANCE_AFTER,
        recordedByUserId: recorder.id,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: recorder.id,
        action: 'RECORD_FUND_REPLENISHMENT',
        entity: 'FundReplenishment',
        entityId: record.id,
        details: JSON.stringify({
          providerId: provider.id,
          providerName: provider.name,
          amount: REPLENISH_AMOUNT,
          remarks: REMARKS,
          replenishmentDate: REPLENISH_DATE.toISOString(),
          balanceBefore: BALANCE_BEFORE,
          balanceAfter: BALANCE_AFTER,
          note: 'Retroactive back-fill; startingCapital reset 100,000,000 -> 70,000,000.',
        }),
      },
    });
  });

  const after = await prisma.loanProvider.findUnique({
    where: { id: provider.id },
    select: { startingCapital: true, initialBalance: true },
  });
  console.log('\n--- AFTER ---');
  console.log(`startingCapital : ${after!.startingCapital.toLocaleString()}`);
  console.log(`initialBalance  : ${after!.initialBalance.toLocaleString()}`);
  console.log('\nDone.');
}

run()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
