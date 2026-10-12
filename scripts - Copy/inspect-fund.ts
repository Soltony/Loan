import prisma from '../src/lib/prisma';

async function run() {
  const providers = await prisma.loanProvider.findMany({
    select: {
      id: true,
      name: true,
      startingCapital: true,
      initialBalance: true,
    },
    orderBy: { displayOrder: 'asc' },
  });

  console.log('=== Loan Providers ===');
  for (const p of providers) {
    console.log(
      `${p.name} (${p.id})\n  startingCapital=${p.startingCapital.toLocaleString()}\n  initialBalance=${p.initialBalance.toLocaleString()}`,
    );
  }

  console.log('\n=== Fund Replenishments ===');
  const reps = await (prisma as any).fundReplenishment.findMany({
    orderBy: [{ replenishmentDate: 'asc' }, { createdAt: 'asc' }],
    include: { recordedByUser: { select: { fullName: true, email: true } } },
  });
  for (const r of reps) {
    console.log(
      `${r.id} | provider=${r.providerId} | amount=${r.amount.toLocaleString()} | before=${r.balanceBefore.toLocaleString()} | after=${r.balanceAfter.toLocaleString()} | date=${r.replenishmentDate.toISOString()} | by=${r.recordedByUser?.fullName} | remarks=${r.remarks ?? '—'}`,
    );
  }

  const agg = await (prisma as any).fundReplenishment.groupBy({
    by: ['providerId'],
    _sum: { amount: true },
  });
  console.log('\n=== Total replenished per provider ===');
  for (const a of agg) {
    console.log(`${a.providerId}: ${(a._sum.amount ?? 0).toLocaleString()}`);
  }
}

run()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
