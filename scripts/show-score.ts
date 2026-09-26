/**
 * Shows why a borrower gets the score and limit they get: their statement figures and whether
 * scoring may use them, each rule on a statement figure with the value it is compared with, the
 * product's tiers, the eligibility answer the mini-app gets, and changes still waiting for approval.
 * The score is never stored; the eligibility check calculates it again every time.
 *
 * Read-only: nothing is fetched or changed.
 *
 * Usage:
 *   npx tsx -r tsconfig-paths/register scripts/show-score.ts --phone 251911223344
 *   npx tsx -r tsconfig-paths/register scripts/show-score.ts --phone 251911223344 --product Test
 */

import prisma from '../src/lib/prisma';
import { checkLoanEligibility } from '../src/actions/eligibility';
import { parseStoredPayload } from '../src/lib/customer-data-api';
import { loadCustomerInfoCopies } from '../src/lib/customer-info';
import { loadDataFetchSettings } from '../src/lib/data-fetch-settings';
import { figuresForAccount, statementFiguresEnabled, statementScoringData } from '../src/lib/statement-figures';
import { loadStatementParameters } from '../src/lib/statement-parameters';
import { evaluateCondition } from '../src/lib/utils';

const STATEMENT_FIELDS = [
  'avgMonthlyDeposit', 'avgBalance', 'monthsAtEbirr', 'txCountRelevant', 'billPaymentsCount',
  'avgMonthlyAirtimeCount', 'avgMonthlyAirtimeValue', 'avgUniqueDepositSources', 'withdrawalToDepositRatio',
];

// The same conversion the eligibility check applies to a rule's field name.
const toCamelCase = (str: string) =>
  !str ? '' : str.replace(/[^a-zA-Z0-9]+(.)?/g, (_m, chr) => (chr ? chr.toUpperCase() : '')).replace(/^./, (m) => m.toLowerCase());

function parseArgs(argv: string[]) {
  const args = { phone: '', product: '' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--phone') args.phone = argv[++i] ?? '';
    else if (argv[i] === '--product') args.product = argv[++i] ?? '';
  }
  return args;
}

const show = (v: unknown) =>
  v === undefined || v === null ? 'NO VALUE' : typeof v === 'number' ? String(Math.round(v * 100) / 100) : JSON.stringify(v);

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!/^\d{9,15}$/.test(args.phone)) {
    console.error('Pass a phone number: --phone 251911223344');
    process.exitCode = 1;
    return;
  }

  console.log(`\n1. Borrower ${args.phone}`);
  const borrower = await prisma.borrower.findUnique({ where: { id: args.phone }, select: { status: true } });
  if (!borrower) {
    console.log('   not a borrower yet (created when they first open the mini-app)\n');
    return;
  }
  const active = await prisma.phoneAccount.findFirst({ where: { phoneNumber: args.phone, isActive: true }, select: { accountNumber: true } });
  console.log(`   status ${borrower.status} | active account ${active?.accountNumber ?? 'NONE - statement figures cannot be used'}`);

  console.log('\n2. Statement figures');
  const settings = await loadDataFetchSettings();
  console.log(`   statement fetching is ${statementFiguresEnabled() ? 'ON' : 'OFF (set CUSTOMER_DATA_API_URL, or STATEMENT_FIGURES_ENABLED=true)'}`);
  const payloads = (await loadCustomerInfoCopies(args.phone)).map((c) => parseStoredPayload(c.data));
  if (payloads.length === 0) console.log('   no customer info stored yet: it is fetched when the mini-app opens, and the figures are kept in it');
  let used: Record<string, any> = {};
  if (active?.accountNumber) {
    const figures = figuresForAccount(payloads, active.accountNumber);
    used = await statementScoringData(payloads, active.accountNumber);
    if (!figures) {
      const others = payloads.map((p) => p?.statementFigures?.accountNumber).filter(Boolean);
      console.log(`   NONE stored for ${active.accountNumber}${others.length ? ` (stored for other accounts: ${others.join(', ')})` : ''}`);
      console.log('   -> the background statement fetch has not succeeded yet: look for "[statement-figures]" in the app log');
    } else {
      const ageDays = (Date.now() - Date.parse(figures.computedAt)) / 864e5;
      console.log(`   computed ${ageDays.toFixed(1)} days ago from ${figures.periodStart}-${figures.periodEnd}, ${figures.transactionCount} transactions`);
      console.log(Object.keys(used).length
        ? '   used for scoring: yes'
        : `   used for scoring: NO - older than ${settings.statementMaxAgeDays} days (Scoring Engine > Customer Data Fetching)`);
    }
  }
  const statementFields = new Set([...STATEMENT_FIELDS, ...(await loadStatementParameters()).map((d) => d.field)]);
  for (const field of statementFields) {
    if (field in used || STATEMENT_FIELDS.includes(field)) console.log(`   ${field.padEnd(26)} ${show(used[field])}`);
  }

  const product = args.product
    ? await prisma.loanProduct.findFirst({ where: { OR: [{ id: args.product }, { name: args.product }] }, select: { id: true, name: true, providerId: true } })
    : null;
  if (args.product && !product) {
    console.log(`\nNo product with the name or id "${args.product}"\n`);
    return;
  }
  const products = product ? [product] : await prisma.loanProduct.findMany({ select: { id: true, name: true, providerId: true } });

  for (const providerId of Array.from(new Set(products.map((p) => p.providerId)))) {
    const provider = await prisma.loanProvider.findUnique({ where: { id: providerId }, select: { name: true } });
    console.log(`\n3. Scoring rules of ${provider?.name ?? providerId} (approved ones only)`);
    const parameters = await prisma.scoringParameter.findMany({ where: { providerId }, include: { rules: true } });
    if (parameters.length === 0) console.log('   none approved: the mini-app says the provider has not configured scoring');
    for (const p of parameters) {
      console.log(`   ${p.name} (up to ${p.weight} points)`);
      for (const r of p.rules) {
        const field = toCamelCase(r.field);
        if (statementFields.has(field)) {
          const matched = evaluateCondition(used[field], r.condition, r.value);
          const why = used[field] == null ? '  <- no value, so this rule cannot match (see 2)' : '';
          console.log(`     ${matched ? '[match]' : '[     ]'} ${r.field} ${r.condition} ${r.value} -> ${r.score} | borrower: ${show(used[field])}${why}`);
        } else {
          console.log(`     [  ?  ] ${r.field} ${r.condition} ${r.value} -> ${r.score} | not a statement figure (customer info or loan history)`);
        }
      }
    }

    for (const prod of products.filter((x) => x.providerId === providerId)) {
      console.log(`\n4. Product "${prod.name}"`);
      const result = await checkLoanEligibility(args.phone, providerId, prod.id);
      const tiers = await prisma.loanAmountTier.findMany({ where: { productId: prod.id }, orderBy: { fromScore: 'asc' } });
      if (tiers.length === 0) console.log('   no approved amount tiers: every score gets a limit of 0');
      for (const t of tiers) {
        const here = result.score >= t.fromScore && result.score <= t.toScore;
        console.log(`   ${here ? '->' : '  '} score ${t.fromScore}-${t.toScore}: ${t.loanAmount.toLocaleString('en-US')}`);
      }
      console.log(`   score ${result.score} | ${result.isEligible ? 'eligible' : 'NOT eligible'}, limit ${result.maxLoanAmount.toLocaleString('en-US')} | "${result.reason}"`);
      if (tiers.length && !tiers.some((t) => result.score >= t.fromScore && result.score <= t.toScore)) {
        console.log(`   -> a score of ${result.score} is in no tier, so the limit is 0`);
      }
    }
  }

  const pending = await prisma.pendingChange.findMany({
    where: { status: 'PENDING', entityType: { in: ['ScoringRules', 'LoanProduct', 'StatementParameter', 'LoanCycleConfig'] } },
    select: { entityType: true, changeType: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  console.log('\n5. Changes still waiting for approval (not used until approved)');
  if (pending.length === 0) console.log('   none');
  for (const c of pending) console.log(`   ${c.entityType} ${c.changeType}, submitted ${c.createdAt.toISOString().slice(0, 16).replace('T', ' ')}`);
  console.log();
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
