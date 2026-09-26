/**
 * Checks that customer data fetching works, for one account.
 *
 * Read-only by default: it reads the settings, fetches the customer info and statement, computes
 * the figures and prints what WOULD be stored, without touching any customer's data. Use it on the
 * production server before switching fetching on for everyone.
 *
 * With --write it performs the real refresh for one borrower (their stored copy is updated), which
 * is the final check that the whole path works.
 *
 * Usage:
 *   npx tsx -r tsconfig-paths/register scripts/check-data-fetch.ts --account 7000101737506
 *   npx tsx -r tsconfig-paths/register scripts/check-data-fetch.ts --account 7000101737506 --phone 251911223344 --write
 */

import prisma from '../src/lib/prisma';
import { fetchAccountStatement, fetchCustomerInfo, openingBalanceWanted, parseStoredPayload, storedAccountNumber } from '../src/lib/customer-data-api';
import { loadDataFetchSettings } from '../src/lib/data-fetch-settings';
import { computeMetrics, normalizeStatementLines, parseAmount } from '../src/lib/statement-utils';
import { loadStatementParameters } from '../src/lib/statement-parameters';
import { figureWindow, figuresForAccount, statementFiguresEnabled } from '../src/lib/statement-figures';
import { loadCustomerInfoCopies, syncCustomerInfo } from '../src/lib/customer-info';
import { refreshStatementFigures } from '../src/lib/statement-figures';

function parseArgs(argv: string[]) {
  const args: { account: string; phone: string; write: boolean } = { account: '', phone: '', write: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--account') args.account = argv[++i] ?? '';
    else if (argv[i] === '--phone') args.phone = argv[++i] ?? '';
    else if (argv[i] === '--write') args.write = true;
  }
  return args;
}

let problems = 0;
const ok = (msg: string, info: any = '') => console.log('  [ok]  ', msg, info ?? '');
const warn = (msg: string, info: any = '') => { problems++; console.log('  [warn]', msg, info ?? ''); };
const fail = (msg: string, info: any = '') => { problems++; console.log('  [FAIL]', msg, info ?? ''); };
const money = (v: number | null | undefined) => (v == null ? '-' : Math.round(v).toLocaleString('en-US'));

const loginHint = (status: number) =>
  status === 401
    ? ' - the data API refused the login: CUSTOMER_DATA_API_USERNAME / _PASSWORD here must equal API_USERNAME / API_PASSWORD where the API runs'
    : '';

/** Fields the bank middleware used to return that the data API may not. */
const EXTRA_FIELDS = ['Branchcode', 'Kebele', 'Tinno'];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!/^\d{6,19}$/.test(args.account)) {
    console.error('Pass an account number: --account 7000101737506');
    process.exitCode = 1;
    return;
  }

  console.log('\n1. Settings');
  const base = process.env.CUSTOMER_DATA_API_URL?.trim();
  console.log(`   customer data comes from: ${base ? `the data API at ${base}` : 'the bank middleware (CUSTOMER_DATA_API_URL is not set)'}`);
  if (base) {
    const user = process.env.CUSTOMER_DATA_API_USERNAME;
    const pass = process.env.CUSTOMER_DATA_API_PASSWORD;
    if (!user || !pass) fail('CUSTOMER_DATA_API_USERNAME and CUSTOMER_DATA_API_PASSWORD are not both set, so no login is sent');
    // Compare this with the API_PASSWORD you chose: in .env a $ cuts the value short (write \$).
    else console.log(`   logging in as ${user} with a password of ${pass.length} characters`);
  }
  if (statementFiguresEnabled()) ok('statement fetching is ON');
  else warn('statement fetching is OFF; this check still works, the app just will not fetch by itself', '(STATEMENT_FIGURES_ENABLED / CUSTOMER_DATA_API_URL)');
  const settings = await loadDataFetchSettings();
  console.log(`   ${settings.statementMonths} months of statement | fetch every ${settings.statementRefreshDays} days | figures used for ${settings.statementMaxAgeDays} days | customer info every ${settings.customerInfoRefreshDays === 0 ? 'never after the first fetch' : `${settings.customerInfoRefreshDays} days`}`);
  console.log(`   ${settings.updatedAt ? `saved on ${settings.updatedAt.toISOString().slice(0, 16).replace('T', ' ')}` : 'never saved, using the defaults'}`);
  const definitions = await loadStatementParameters();
  console.log(`   statement parameters defined: ${definitions.length ? definitions.map((d) => d.field).join(', ') : 'none'}`);

  console.log('\n2. Customer info');
  let started = Date.now();
  const info = await fetchCustomerInfo(args.account);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (!info.ok) {
    fail(`could not fetch customer info (${info.status})${loginHint(info.status)}`, info.body);
  } else {
    const detail = info.body?.detail ?? info.body?.details;
    if (!detail || typeof detail !== 'object') {
      fail('the answer has no customer details', JSON.stringify(info.body)?.slice(0, 200));
    } else {
      ok(`fetched in ${seconds}s`, `${detail.CustomerName ?? '(no name)'} | source: ${info.source ?? 'middleware'}${info.odsFetchedAt ? ` | read from ODS at ${info.odsFetchedAt}` : ''}`);
      const missing = EXTRA_FIELDS.filter((f) => !(f in detail));
      if (missing.length) warn(`fields not returned: ${missing.join(', ')}`, '- branch reports need Branchcode');
      else ok('Branchcode, Kebele and Tinno are all returned');
      console.log(`   fields: ${Object.keys(detail).join(', ')}`);
    }
  }

  console.log('\n3. Statement');
  const { periodStart, periodEnd, asOf } = figureWindow(settings.statementMonths);
  console.log(`   asking for ${periodStart} to ${periodEnd}`);
  started = Date.now();
  const statement = await fetchAccountStatement(args.account, periodStart, periodEnd);
  const statementSeconds = (Date.now() - started) / 1000;
  const details = statement.ok ? (statement.body?.details ?? statement.body) : null;
  if (!statement.ok || !details || typeof details !== 'object') {
    fail(`could not fetch the statement (${statement.ok ? 502 : statement.status})${statement.ok ? '' : loginHint(statement.status)}`, statement.ok ? JSON.stringify(statement.body)?.slice(0, 200) : statement.body);
  } else {
    const lines = normalizeStatementLines(details.statementDetails);
    ok(`fetched in ${statementSeconds.toFixed(1)}s`, `${lines.length} transactions | source: ${statement.source ?? 'middleware'}${statement.odsFetchedAt ? ` | read from ODS at ${statement.odsFetchedAt}` : ''}`);
    if (statementSeconds > 60) warn('that is slow; the first fetch of an account is the slow one, later ones should come from the shared store');
    if (lines.length === 0) warn('no transactions in these months: every figure will be zero');
    const withDescription = lines.filter((l) => l.description).length;
    if (lines.length && withDescription === 0) fail('no transaction has a description: the keyword-based figures cannot work');
    else if (lines.length) ok(`${withDescription} of ${lines.length} transactions have a description`);

    console.log('\n4. Figures that would be stored');
    const figures = computeMetrics(lines, asOf, parseAmount(details.OpeningBalance), definitions, settings.statementMonths);
    console.log(`   months: ${figures.derived.monthsConsidered.join(', ')}`);
    console.log(`   monthly income: ${figures.derived.monthlyDepositTotals.map(money).join(' | ')}`);
    console.log(`   avgMonthlyDeposit ${money(figures.avgMonthlyDeposit)} | avgBalance ${money(figures.avgBalance)} | monthsAtEbirr ${figures.monthsAtEbirr} | txCountRelevant ${figures.txCountRelevant}`);
    console.log(`   billPaymentsCount ${figures.billPaymentsCount} | airtime per month ${figures.avgMonthlyAirtimeCount.toFixed(2)} (${money(figures.avgMonthlyAirtimeValue)}) | payers per month ${figures.avgUniqueDepositSources.toFixed(2)} | out/in ${figures.withdrawalToDepositRatio?.toFixed(2) ?? '-'}`);
    console.log(`   left out of income: loans ${money(figures.derived.excludedFromDeposits.loanDisbursements)}, interest ${money(figures.derived.excludedFromDeposits.interest)}, reversals ${money(figures.derived.excludedFromDeposits.reversals)}`);
    if (definitions.length) console.log(`   defined parameters: ${Object.entries(figures.custom).map(([k, v]) => `${k}=${v == null ? '-' : Number(v).toFixed(2)}`).join(' | ')}`);
    if (figures.avgBalance == null && !openingBalanceWanted()) {
      console.log('   avgBalance is not calculated: statements are fetched without balances (STATEMENT_OPENING_BALANCE=true adds them)');
    } else if (figures.avgBalance == null) warn('no balance could be worked out');
  }

  if (args.phone) {
    console.log('\n5. What is stored for this borrower now');
    const payloads = (await loadCustomerInfoCopies(args.phone)).map((c) => parseStoredPayload(c.data));
    if (payloads.length === 0) {
      warn('this phone has no customer-info copy yet', '(it is created when they open the mini-app)');
    } else {
      const accounts = payloads.map((p) => storedAccountNumber(p));
      ok(`${payloads.length} copy/copies`, `account(s): ${accounts.join(', ')}`);
      const stored = figuresForAccount(payloads, args.account);
      if (!stored) {
        warn('no stored figures for this account yet');
      } else {
        const ageDays = (Date.now() - Date.parse(stored.computedAt)) / 864e5;
        const line = `computed ${ageDays.toFixed(1)} days ago | ${stored.derived?.monthsConsidered?.length ?? '?'} months | avgMonthlyDeposit ${money(stored.avgMonthlyDeposit)}`;
        if (ageDays > settings.statementMaxAgeDays) warn(`stored figures are too old to be used for scoring: ${line}`);
        else ok(`stored figures: ${line}`);
      }
      const tin = payloads.map((p) => p?.TINNo).find(Boolean);
      console.log(`   TIN stored: ${tin ? 'yes' : 'no'} | Branchcode stored: ${payloads.some((p) => p?.detail?.Branchcode != null) ? 'yes' : 'no'}`);
    }

    if (args.write) {
      console.log('\n6. Real refresh for this borrower (--write)');
      const config = await prisma.dataProvisioningConfig.findFirst({ where: { name: 'ExternalCustomerInfo' } });
      const borrower = await prisma.borrower.findUnique({ where: { id: args.phone }, select: { status: true } });
      if (!config) {
        fail('no ExternalCustomerInfo config exists');
      } else if (!borrower) {
        fail(`${args.phone} is not a borrower yet`, '- pick a phone number that has used the mini-app');
      } else {
        const customer = await syncCustomerInfo(args.phone, args.account, config.id);
        if (customer.ok) ok(`customer info: ${customer.outcome}`);
        else fail(`customer info failed (${customer.status})`, customer.body);

        const refreshed = await refreshStatementFigures(args.phone, args.account);
        if (refreshed.ok) ok(`statement figures: ${refreshed.outcome}`, `avgMonthlyDeposit ${money(refreshed.figures.avgMonthlyDeposit)}`);
        else fail(`statement figures not stored: ${refreshed.reason}`, refreshed.body ?? '');
      }
    }
  } else {
    console.log('\n5. Add --phone 2519... to also see what is stored for a borrower (and --write to refresh it for real)');
  }

  console.log(`\n${problems === 0 ? 'All checks passed.' : `${problems} thing(s) to look at above.`}\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
