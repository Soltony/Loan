/* eslint-disable @typescript-eslint/no-explicit-any -- route and stub JSON is checked by the assertions */
/**
 * End-to-end test of one borrower's loans, from fetching their customer data to the last repayment.
 *
 * It calls the real route handlers and server actions in the order the super app, the mini-app and
 * the payment gateway call them, against a real SQL Server database:
 *
 *   connect (/api/auth/connect) -> link account (/api/phone-accounts)
 *   -> customer info + statement (/api/phone-accounts/fetch-customer) -> limit (checkLoanEligibility)
 *   -> apply (/api/loans) -> disburse (/api/external/disbursement)
 *   -> repay: /api/initiate-payment, then the gateway's /api/payment-callback
 *
 * Every system outside this app is a stub at the HTTP boundary (`fakeFetch` below), so the app's
 * own request building, parsing and error handling run for real: the data API (customer info and
 * statement), the bank (get-accounts and disbursement), the super app (token validation and payment
 * gateway) and the SMS gateway. Any other outbound request fails the run.
 *
 * Not real here: audit rows are captured, not written (AuditLog is append-only); the CBS NPL clean-up
 * after a last repayment is captured; the disbursement kill switch is a flag, not the global DB row;
 * and time passes by moving a loan's dates back. The daily interest and penalty accrual jobs do not
 * run, so Interest/Penalty Receivable go below zero for the test provider (in production the jobs
 * book those receivables before they are repaid).
 *
 * The run creates its own provider, products, scoring rules, borrower and bank account, deletes all
 * of it afterwards, and first deletes what an earlier crashed run left behind. It refuses to run
 * against a database that is not on this machine unless E2E_ALLOW_REMOTE_DB=true. Never point it at
 * production: it creates a lending provider and books loans.
 *
 * The "known gaps" at the end describe the safe behaviour and are marked `it.fails`: they pass while
 * the gap is open. When a fix lands, its test starts failing; then make it a plain `it`.
 *
 *   npm run test:e2e
 *   E2E_SHOW_GAPS=true npm run test:e2e     (runs the gaps as plain tests, to see why each fails)
 */
import { createHash, randomInt } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { differenceInCalendarDays, format, subDays } from 'date-fns';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));

// ---------------------------------------------------------------------------
// What the app modules see instead of a live Next request (vi.mock factories are hoisted).
// ---------------------------------------------------------------------------

const H = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  afterTasks: [] as Promise<unknown>[],
  audit: [] as Array<{ action: string; entity?: string; entityId?: string; actorId?: string; details?: unknown }>,
  cbsDeletionChecks: [] as string[],
  disbursementsEnabled: true,
}));

vi.mock('next/headers', () => {
  const store = {
    get: (name: string) => (H.cookies.has(name) ? { name, value: H.cookies.get(name)! } : undefined),
    getAll: () => [...H.cookies].map(([name, value]) => ({ name, value })),
    has: (name: string) => H.cookies.has(name),
    set: (name: string | { name: string; value: string }, value?: string) => {
      if (typeof name === 'object') H.cookies.set(name.name, name.value);
      else H.cookies.set(name, String(value));
    },
    delete: (name: string) => H.cookies.delete(name),
  };
  return { cookies: async () => store, headers: async () => new Headers() };
});

// after() needs a live request; its work is collected here and awaited where the test needs it.
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (task: unknown) => {
    H.afterTasks.push(Promise.resolve(typeof task === 'function' ? (task as () => unknown)() : task));
  },
}));

// AuditLog is append-only (a trigger refuses deletes), so rows are captured instead of written.
vi.mock('@/lib/audit-log', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/audit-log')>()),
  createAuditLog: async (row: any) => {
    H.audit.push(row);
  },
  createAuditLogs: async (rows: any[]) => {
    H.audit.push(...rows);
  },
  auditExternalApiRequest: async () => {},
  auditExternalApiResponse: async () => {},
  auditExternalApiError: async () => {},
}));

vi.mock('@/actions/cbs-npl', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/actions/cbs-npl')>()),
  syncCbsDeletionForBorrower: async (borrowerId: string) => {
    H.cbsDeletionChecks.push(borrowerId);
  },
}));

vi.mock('@/lib/disbursement-control', () => ({
  areDisbursementsEnabled: async () => H.disbursementsEnabled,
  getDisbursementControl: async () => ({ enabled: H.disbursementsEnabled, updatedAt: null }),
}));

// ---------------------------------------------------------------------------
// The outside world: stubs answering like the real systems (shapes copied from their responses).
// ---------------------------------------------------------------------------

const STUB = {
  dataApi: 'http://data-api.e2e.invalid/nibtera-loan',
  bank: 'http://bank.e2e.invalid',
  superApp: 'http://superapp.e2e.invalid',
  sms: 'http://sms.e2e.invalid/alert.php',
};
const DATA_API_LOGIN = ['e2e-data-user', 'e2e-data-pass'] as const;
const BANK_LOGIN = ['e2e-bank-user', 'e2e-bank-pass'] as const;
const PAYMENT_KEY = 'e2e-payment-key';
const COLLECTION_ACCOUNT = '1000999999999';
const CALLBACK_URL = 'https://lending.e2e.invalid/api/payment-callback';
const COMPANY_NAME = 'E2E Lending';

type Call = { method: string; url: URL; headers: Headers; body: any; raw: string };
const calls: Call[] = [];
const unexpectedCalls: string[] = [];
const callsTo = (path: string) => calls.filter((c) => c.url.pathname.endsWith(path));

const bank = {
  accountsByPhone: new Map<string, string[]>(),
  disbursementAnswer: 'success' as 'success' | 'http-500' | 'http-200-error',
  nextFt: 1,
};
/** Super-app tokens the validation endpoint accepts, and the phone each belongs to. */
const superAppTokens = new Map<string, string>();

/** Holds statement answers back, like a slow ODS read, until `open()` is called. */
const statementGate = { held: null as Promise<void> | null, open: () => {} };
function holdStatements() {
  statementGate.held = new Promise<void>((resolve) => {
    statementGate.open = () => {
      statementGate.held = null;
      resolve();
    };
  });
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

const basicAuth = ([user, pass]: readonly [string, string]) =>
  `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;

async function fakeFetch(input: string | URL | Request, init: RequestInit = {}): Promise<Response> {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const method = (init.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined));
  const raw = typeof init.body === 'string' ? init.body : init.body == null ? '' : String(init.body);
  let body: any = raw;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    // a form or text body stays as it is
  }
  calls.push({ method, url, headers, body, raw });

  if (url.href.startsWith(STUB.dataApi)) {
    if (headers.get('authorization') !== basicAuth(DATA_API_LOGIN)) {
      return json({ status: 'Failed', details: 'Invalid Credentials' }, 401);
    }
    if (url.pathname.endsWith('/get-customer-info')) {
      return json({ status: 'Success', status_code: 200, detail: customerInfo(body.accountNumber) }, 200, {
        'X-Data-Source': 'ods',
        'X-Data-Fetched-At': new Date().toISOString(),
      });
    }
    if (url.pathname.endsWith('/get-account-statement')) {
      if (statementGate.held) await statementGate.held;
      return json(
        { status: 'Success', status_code: 200, details: statement(body.accountNumber, body.startDate, body.endDate) },
        200,
        { 'X-Data-Source': 'ods' }
      );
    }
  }

  if (url.host === 'bank.e2e.invalid') {
    if (headers.get('authorization') !== basicAuth(BANK_LOGIN)) return json({ message: 'Unauthorized' }, 401);
    if (url.pathname === '/get-accounts') {
      const accounts = bank.accountsByPhone.get(String(body?.phoneNumber)) ?? [];
      return json({ status: 'Success', details: accounts.map((AccountNumber) => ({ AccountNumber })) });
    }
    if (url.pathname === '/disburse') return disbursementAnswer(body);
  }

  if (url.host === 'superapp.e2e.invalid') {
    if (url.pathname === '/api/Authenticate/Validate') {
      const token = (headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
      const phone = superAppTokens.get(token);
      return phone ? json({ phone }) : json({ message: 'Invalid token' }, 401);
    }
    if (url.pathname === '/api/Authenticate/Payment') {
      return json({ status: 'Success', token: `gateway-checkout-${body?.transactionId}` });
    }
  }

  if (url.href === STUB.sms) return new Response('OK', { status: 200 });

  unexpectedCalls.push(`${method} ${url.href}`);
  throw new TypeError(`fetch failed: the E2E test does not allow calls to ${url.host}`);
}

function disbursementAnswer(body: any) {
  if (bank.disbursementAnswer === 'http-500') {
    return json({ status: 'Error', status_code: 500, message: 'Core banking unavailable' }, 500);
  }
  if (bank.disbursementAnswer === 'http-200-error') {
    // A real answer of the bank middleware (stored 2026-04-16): HTTP 200, the failure is in the body.
    return json({
      creditAccount: null,
      debitAccount: null,
      debitAmount: null,
      message: 'External API Call Failed',
      providerId: null,
      status: 'Error',
      status_code: 500,
      transactionId: null,
    });
  }
  return json({
    creditAccount: body.creditAccount,
    debitAccount: 'ETB1278000010001',
    debitAmount: String(body.amount),
    message: 'Disbursement Completed Success',
    providerId: body.providerId,
    status: 'Success',
    status_code: 200,
    transactionId: `FT26E2E${String(bank.nextFt++).padStart(5, '0')}`,
  });
}

/** The data API's customer-info `detail` (field names as in api.py's CUSTOMER_SQL). */
function customerInfo(accountNumber: string) {
  return {
    AccountNumber: accountNumber,
    AccountOpeningDate: '20190315',
    CustomerName: 'E2E TEST BORROWER',
    Country: 'ET',
    Street: 'Bole Road',
    City: 'Addis Ababa',
    Nationality: 'ET',
    Residence: 'ET',
    NationalId: 'E2E000000',
    Tinno: '0000000000',
    ResidenceRegion: 'Addis Ababa',
    Gender: 'FEMALE',
    DateOfBirth: '19900101',
    MaritalStatus: 'Single',
    Occupation: 'Engineer',
    EmployersName: 'ACME PLC',
    NetMonthlyIncome: '15000',
    Woreda: '03',
    Kebele: '05',
    MotherName: 'E2E',
    SubCity: 'Bole',
    Branchcode: '409',
  };
}

const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const SALARY_CREDITS_PER_MONTH = 5;
const LINES_PER_MONTH = SALARY_CREDITS_PER_MONTH + 2;

/**
 * The data API's statement (`details` of /get-account-statement) for every month of the requested
 * window: five salary credits of 2,000, one Telebirr payment and one telecom bill a month.
 */
function statement(accountNumber: string, startDate: string, endDate: string) {
  const lines: Array<Record<string, unknown>> = [];
  let year = Number(startDate.slice(0, 4));
  let month = Number(startDate.slice(4, 6));
  const last = Number(endDate.slice(0, 6));
  while (year * 100 + month <= last) {
    // '05 MAY 26', the date format the data API sends
    const day = (d: number) => `${String(d).padStart(2, '0')} ${MONTH_NAMES[month - 1]} ${String(year).slice(2)}`;
    const line = (d: number, fields: Record<string, unknown>) => ({
      BookDate: day(d),
      Reference: `FT${year}${month}${d}${lines.length}`,
      ValueDate2: day(d),
      Debit: null,
      Credit: null,
      ClosingBalance: null,
      ...fields,
    });
    for (const d of [3, 8, 13, 18, 23].slice(0, SALARY_CREDITS_PER_MONTH)) {
      lines.push(line(d, { Description2: 'Salary Credit', Narrative: 'PAYROLL ACME PLC', Credit: 2000 }));
    }
    lines.push(line(12, { Description2: 'Telebirr Debit', Narrative: 'Wallet transfer', Debit: 150 }));
    lines.push(line(20, { Description2: 'ET telecom bill debit', Narrative: 'Monthly bill', Debit: 300 }));
    if (++month > 12) {
      month = 1;
      year++;
    }
  }
  return {
    CustomerAccount: accountNumber,
    CustomerName: 'E2E TEST BORROWER',
    Currency: 'ETB',
    OpeningBalance: null,
    ClosingBalance: null,
    statementDetails: lines,
  };
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const MARKER = 'E2E LIFECYCLE TEST';
const RUN = Date.now().toString(36);
const PROVIDER_FUND = 1_000_000;
const SCORED_LIMIT = 8_000; // tier for a score of 60-100
const SALARY = 10_000;
const ADVANCE_PERCENT = 50;

let PHONE = '';
let ACCOUNT = '';
let OTHER_ACCOUNT = ''; // someone else's account
const CUSTOMER_TOKEN = `e2e-customer-${RUN}`; // the borrower's own super-app token
const GATEWAY_TOKEN = `e2e-gateway-${RUN}`; // what the payment gateway sends with its callback

const fx = { providerId: '', scoredId: '', salaryId: '' };

type Prisma = typeof import('@/lib/prisma').default;
type Handler = (req: any, ctx?: any) => Promise<Response>;
let prisma: Prisma;
let NextRequestCtor: typeof import('next/server').NextRequest;
let checkLoanEligibility: typeof import('@/actions/eligibility').checkLoanEligibility;
const routes = {} as Record<
  'connect' | 'phoneAccounts' | 'fetchCustomer' | 'loans' | 'disbursement' | 'initiatePayment' | 'paymentCallback' | 'payments',
  Handler
>;

let taxes: Array<{ rate: number; appliedTo: string; isInclusive: boolean }> = [];
const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100 || 0; // never -0
const inclusiveTax = (amount: number) =>
  round2((amount * taxes.filter((t) => t.isInclusive && t.rate > 0).reduce((s, t) => s + t.rate, 0)) / 100);
/** Tax on the charges, as configured in the Tax table (rate per component it applies to). */
function taxOn(parts: { serviceFee?: number; interest?: number; penalty?: number }) {
  let tax = 0;
  for (const t of taxes) {
    if (!(t.rate > 0)) continue;
    const applied: string[] = JSON.parse(t.appliedTo || '[]');
    const base =
      (applied.includes('serviceFee') ? (parts.serviceFee ?? 0) : 0) +
      (applied.includes('interest') ? (parts.interest ?? 0) : 0) +
      (applied.includes('penalty') ? (parts.penalty ?? 0) : 0);
    tax += (base * t.rate) / 100;
  }
  return round2(tax);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function request(method: 'GET' | 'POST', path: string, body?: unknown, headers: Record<string, string> = {}) {
  return new NextRequestCtor(new URL(path, 'http://localhost:9002'), {
    method,
    headers: { 'content-type': 'application/json', 'user-agent': 'loan-lifecycle-e2e', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function send(handler: Handler, req: Request) {
  const res = await handler(req);
  const text = await res.text();
  let body: any = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // not JSON
  }
  return { status: res.status, body };
}

const post = (handler: Handler, path: string, body: unknown, headers?: Record<string, string>) =>
  send(handler, request('POST', path, body, headers));

async function settleBackgroundWork() {
  while (H.afterTasks.length) await Promise.allSettled(H.afterTasks.splice(0));
}

async function waitFor(check: () => boolean, what: string, ms = 5_000) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

const smsTo = (phone: string) =>
  calls
    .filter((c) => c.url.href === STUB.sms)
    .map((c) => [...new URLSearchParams(c.raw).values()])
    .filter((values) => values.includes(`0${phone.slice(-9)}`));

async function ledger() {
  const accounts = await prisma.ledgerAccount.findMany({ where: { providerId: fx.providerId } });
  return Object.fromEntries(accounts.map((a) => [`${a.category} ${a.type}`, round2(a.balance)]));
}

/** A journal entry's postings, as "<category> <type> <Debit|Credit>" -> amount. */
async function postings(journalEntryId: string) {
  const entries = await prisma.ledgerEntry.findMany({ where: { journalEntryId }, include: { ledgerAccount: true } });
  const out: Record<string, number> = {};
  for (const e of entries) {
    const key = `${e.ledgerAccount.category} ${e.ledgerAccount.type} ${e.type}`;
    out[key] = round2((out[key] ?? 0) + e.amount);
  }
  return out;
}

/** Moves a loan `days` into the past, as if that many days had gone by since it was disbursed. */
async function travel(loanId: string, days: number) {
  const loan = await prisma.loan.findUniqueOrThrow({ where: { id: loanId }, include: { installments: true } });
  await prisma.$transaction([
    prisma.loan.update({
      where: { id: loanId },
      data: { disbursedDate: subDays(loan.disbursedDate, days), dueDate: subDays(loan.dueDate, days) },
    }),
    ...loan.installments.map((i) =>
      prisma.loanInstallment.update({ where: { id: i.id }, data: { dueDate: subDays(i.dueDate, days) } })
    ),
  ]);
}

const applyFor = (productId: string, loanAmount: number, extra: Record<string, unknown> = {}) =>
  post(routes.loans, '/api/loans', { borrowerId: PHONE, productId, loanAmount, creditAccount: ACCOUNT, ...extra });

const disburse = (loanId: string, extra: Record<string, unknown> = {}) =>
  post(routes.disbursement, '/api/external/disbursement', { loanId, ...extra });

const initiatePayment = (loanId: string, amount: number) =>
  post(routes.initiatePayment, '/api/initiate-payment', { loanId, amount });

/** The gateway's callback for a payment started with /api/initiate-payment. */
function paymentCallback(
  txnRef: string,
  amount: number,
  opts: { token?: string; paidAmount?: number; signature?: string } = {}
) {
  const token = opts.token ?? GATEWAY_TOKEN;
  return post(
    routes.paymentCallback,
    '/api/payment-callback',
    {
      paidAmount: String(opts.paidAmount ?? amount),
      paidByNumber: PHONE,
      txnRef,
      transactionId: `FT${txnRef.replace(/-/g, '').slice(0, 10).toUpperCase()}`,
      transactionTime: format(new Date(), 'yyyyMMddHHmmss'),
      accountNo: COLLECTION_ACCOUNT,
      token,
      Signature: opts.signature ?? 'e2e-signature',
    },
    // The gateway wraps its token as JSON; the callback unwraps it.
    { authorization: `Bearer {"token":"${token}"}` }
  );
}

/** Repays through the gateway: start the payment, then the gateway's successful callback. */
async function repay(loanId: string, amount: number) {
  const started = await initiatePayment(loanId, amount);
  expect(started.status, JSON.stringify(started.body)).toBe(200);
  const callback = await paymentCallback(started.body.transactionId, amount);
  expect(callback, JSON.stringify(callback.body)).toMatchObject({ status: 200, body: { message: 'Payment confirmed and updated.' } });
  return started.body.transactionId as string;
}

async function unusedPhone() {
  for (;;) {
    const phone = `2519${String(randomInt(0, 100_000_000)).padStart(8, '0')}`;
    const [borrowers, links, loans] = await Promise.all([
      prisma.borrower.count({ where: { id: phone } }),
      prisma.phoneAccount.count({ where: { phoneNumber: phone } }),
      prisma.loan.count({ where: { borrowerId: phone } }),
    ]);
    if (borrowers + links + loans === 0) return phone;
  }
}

async function unusedAccount(prefix: string) {
  for (;;) {
    const account = `${prefix}${String(randomInt(0, 1_000_000)).padStart(6, '0')}`;
    const [links, data] = await Promise.all([
      prisma.phoneAccount.count({ where: { accountNumber: account } }),
      prisma.provisionedData.count({ where: { borrowerId: account } }),
    ]);
    if (links + data === 0) return account;
  }
}

// ---------------------------------------------------------------------------
// Set-up and clean-up
// ---------------------------------------------------------------------------

function configureEnvironment() {
  createRequire(import.meta.url)('@next/env').loadEnvConfig(PROJECT_ROOT);
  const db = process.env.DATABASE_URL ?? '';
  const onThisMachine = /^sqlserver:\/\/(localhost|127\.0\.0\.1|\(local\)|\.)(?=[;:\\,]|$)/i.test(db);
  if (!onThisMachine && process.env.E2E_ALLOW_REMOTE_DB !== 'true') {
    throw new Error(
      'The E2E test books loans and creates a provider. DATABASE_URL is not on this machine; set E2E_ALLOW_REMOTE_DB=true only for a disposable test database.'
    );
  }
  Object.assign(process.env, {
    CUSTOMER_DATA_API_URL: STUB.dataApi,
    CUSTOMER_DATA_API_USERNAME: DATA_API_LOGIN[0],
    CUSTOMER_DATA_API_PASSWORD: DATA_API_LOGIN[1],
    STATEMENT_FIGURES_ENABLED: 'true',
    STATEMENT_OPENING_BALANCE: 'false',
    EXTERNAL_API_URL: `${STUB.bank}/get-accounts`,
    EXTERNAL_DISBURSEMENT_URL: `${STUB.bank}/disburse`,
    EXTERNAL_API_USERNAME: BANK_LOGIN[0],
    EXTERNAL_API_PASSWORD: BANK_LOGIN[1],
    TOKEN_VALIDATION_API_URL: `${STUB.superApp}/api/Authenticate/Validate`,
    NIB_PAYMENT_URL: `${STUB.superApp}/api/Authenticate/Payment`,
    NIB_PAYMENT_KEY: PAYMENT_KEY,
    ACCOUNT_NO: COLLECTION_ACCOUNT,
    CALLBACK_URL,
    COMPANY_NAME,
    SMS_URL: STUB.sms,
  });
}

/** Deletes everything belonging to these test providers and phone numbers, children first. */
async function removeTestData(providerIds: string[], phones: string[]) {
  const productIds = (
    await prisma.loanProduct.findMany({ where: { providerId: { in: providerIds } }, select: { id: true } })
  ).map((p) => p.id);
  const loanIds = (
    await prisma.loan.findMany({
      where: { OR: [{ borrowerId: { in: phones } }, { productId: { in: productIds } }] },
      select: { id: true },
    })
  ).map((l) => l.id);
  const txnRefs = (
    await prisma.pendingPayment.findMany({ where: { loanId: { in: loanIds } }, select: { transactionId: true } })
  ).map((p) => p.transactionId);

  await prisma.paymentTransaction.deleteMany({ where: { txnRef: { in: txnRefs } } });
  await prisma.payment.deleteMany({ where: { loanId: { in: loanIds } } });
  await prisma.pendingPayment.deleteMany({ where: { loanId: { in: loanIds } } });
  await prisma.disbursementTransaction.deleteMany({ where: { loanId: { in: loanIds } } });
  // Ledger entries go with their journal entries.
  await prisma.journalEntry.deleteMany({
    where: { OR: [{ loanId: { in: loanIds } }, { providerId: { in: providerIds } }] },
  });
  await prisma.loanInstallment.deleteMany({ where: { loanId: { in: loanIds } } });
  await prisma.loan.deleteMany({ where: { id: { in: loanIds } } });
  await prisma.loanApplication.deleteMany({
    where: { OR: [{ borrowerId: { in: phones } }, { productId: { in: productIds } }] },
  });
  await prisma.provisionedData.deleteMany({ where: { borrowerId: { in: phones } } });
  await prisma.borrower.deleteMany({ where: { id: { in: phones } } });
  await prisma.phoneAccount.deleteMany({ where: { phoneNumber: { in: phones } } });
  await prisma.loanAmountTier.deleteMany({ where: { productId: { in: productIds } } });
  await prisma.loanProduct.deleteMany({ where: { id: { in: productIds } } });
  await prisma.dataProvisioningConfig.deleteMany({ where: { providerId: { in: providerIds } } });
  // Ledger accounts and scoring rules go with the provider.
  await prisma.loanProvider.deleteMany({ where: { id: { in: providerIds } } });
}

async function removeLeftoversOfEarlierRuns() {
  const providers = await prisma.loanProvider.findMany({ where: { name: { startsWith: MARKER } }, select: { id: true } });
  const phones = await prisma.phoneAccount.findMany({ where: { customerName: MARKER }, select: { phoneNumber: true } });
  if (providers.length || phones.length) {
    await removeTestData(
      providers.map((p) => p.id),
      phones.map((p) => p.phoneNumber)
    );
  }
}

const LEDGER_ACCOUNTS: Array<[category: string, type: string, name: string]> = [
  ['Principal', 'Receivable', 'Principal Receivable'],
  ['Interest', 'Receivable', 'Interest Receivable'],
  ['ServiceFee', 'Receivable', 'Service Fee Receivable'],
  ['Penalty', 'Receivable', 'Penalty Receivable'],
  ['Tax', 'Receivable', 'Tax Receivable'],
  ['Principal', 'Received', 'Principal Received'],
  ['Interest', 'Received', 'Interest Received'],
  ['ServiceFee', 'Received', 'Service Fee Received'],
  ['Penalty', 'Received', 'Penalty Received'],
  ['Tax', 'Received', 'Tax Received'],
  ['Interest', 'Income', 'Interest Income'],
  ['ServiceFee', 'Income', 'Service Fee Income'],
  ['Penalty', 'Income', 'Penalty Income'],
];

// Product terms, kept close to the live products' shapes.
const SCORED = {
  serviceFeePercent: 2,
  dailyFee: 1.5, // fixed Birr per day, up to the due date
  penaltyPerDay: 10, // fixed Birr per day overdue
  duration: 30,
};
const SALARY_ADVANCE = { dailyFee: 1, penaltyPerDay: 5, installments: 2, intervalDays: 30 };

async function createFixtures() {
  const provider = await prisma.loanProvider.create({
    data: {
      name: `${MARKER} ${RUN}`,
      icon: 'Building2',
      colorHex: '#0f766e',
      displayOrder: 999,
      startingCapital: PROVIDER_FUND,
      initialBalance: PROVIDER_FUND,
      status: 'Active',
      ledgerAccounts: { create: LEDGER_ACCOUNTS.map(([category, type, name]) => ({ category, type, name })) },
      // 40 points from the customer info, 60 from the statement: a full score needs both.
      scoringParameters: {
        create: [
          { name: 'Net monthly income', weight: 40, rules: { create: [{ field: 'NetMonthlyIncome', condition: '>=', value: '5000', score: 40 }] } },
          { name: 'txCountRelevant', weight: 30, rules: { create: [{ field: 'txCountRelevant', condition: '>', value: '20', score: 30 }] } },
          { name: 'monthsAtEbirr', weight: 30, rules: { create: [{ field: 'monthsAtEbirr', condition: '>', value: '1', score: 30 }] } },
        ],
      },
    },
  });
  fx.providerId = provider.id;

  const scored = await prisma.loanProduct.create({
    data: {
      providerId: provider.id,
      name: 'E2E Scored 30 days',
      description: MARKER,
      icon: 'Wallet',
      minLoan: 100,
      maxLoan: 50_000,
      duration: SCORED.duration,
      status: 'Active',
      serviceFee: JSON.stringify({ type: 'percentage', value: SCORED.serviceFeePercent }),
      serviceFeeEnabled: true,
      dailyFee: JSON.stringify({ type: 'fixed', value: SCORED.dailyFee, calculationBase: 'principal' }),
      dailyFeeEnabled: true,
      penaltyRules: JSON.stringify([
        { id: 'e2e-penalty', fromDay: 1, toDay: 30, type: 'fixed', value: SCORED.penaltyPerDay, frequency: 'daily' },
      ]),
      penaltyRulesEnabled: true,
      penaltyPerInstallment: false,
      loanAmountTiers: {
        create: [
          { fromScore: 0, toScore: 59, loanAmount: 0 },
          { fromScore: 60, toScore: 100, loanAmount: SCORED_LIMIT },
        ],
      },
    },
  });
  fx.scoredId = scored.id;

  const salary = await prisma.loanProduct.create({
    data: {
      providerId: provider.id,
      name: 'E2E Salary Advance',
      description: MARKER,
      icon: 'Wallet',
      minLoan: 0,
      maxLoan: 0,
      isSalaryAdvance: true,
      advancePercent: ADVANCE_PERCENT,
      salaryAdvanceMappings: JSON.stringify([{ accountNumber: ACCOUNT, salary: SALARY }]),
      duration: SALARY_ADVANCE.installments * SALARY_ADVANCE.intervalDays,
      installments: SALARY_ADVANCE.installments,
      repaymentIntervalDays: SALARY_ADVANCE.intervalDays,
      status: 'Active',
      serviceFee: JSON.stringify({ type: 'percentage', value: 0 }),
      serviceFeeEnabled: false,
      dailyFee: JSON.stringify({ type: 'fixed', value: SALARY_ADVANCE.dailyFee, calculationBase: 'principal' }),
      dailyFeeEnabled: true,
      penaltyRules: JSON.stringify([
        { id: 'e2e-penalty', fromDay: 1, toDay: 30, type: 'fixed', value: SALARY_ADVANCE.penaltyPerDay, frequency: 'daily' },
      ]),
      penaltyRulesEnabled: true,
      penaltyPerInstallment: true,
    },
  });
  fx.salaryId = salary.id;
}

beforeAll(async () => {
  configureEnvironment();
  vi.stubGlobal('fetch', fakeFetch);

  prisma = (await import('@/lib/prisma')).default;
  NextRequestCtor = (await import('next/server')).NextRequest;
  ({ checkLoanEligibility } = await import('@/actions/eligibility'));
  routes.connect = (await import('@/app/api/auth/connect/route')).POST;
  routes.phoneAccounts = (await import('@/app/api/phone-accounts/route')).POST;
  routes.fetchCustomer = (await import('@/app/api/phone-accounts/fetch-customer/route')).POST;
  routes.loans = (await import('@/app/api/loans/route')).POST;
  routes.disbursement = (await import('@/app/api/external/disbursement/route')).POST;
  routes.initiatePayment = (await import('@/app/api/initiate-payment/route')).POST;
  routes.paymentCallback = (await import('@/app/api/payment-callback/route')).POST;
  routes.payments = (await import('@/app/api/payments/route')).POST;

  await removeLeftoversOfEarlierRuns();
  PHONE = await unusedPhone();
  ACCOUNT = await unusedAccount('7000999');
  OTHER_ACCOUNT = await unusedAccount('7000998');
  bank.accountsByPhone.set(PHONE, [ACCOUNT]);
  superAppTokens.set(CUSTOMER_TOKEN, PHONE);
  superAppTokens.set(GATEWAY_TOKEN, 'gateway');
  taxes = await prisma.tax.findMany({ where: { status: { in: ['Active', 'ACTIVE'] } } });
  await createFixtures();
});

afterAll(async () => {
  try {
    statementGate.open();
    await settleBackgroundWork();
    if (prisma) await removeTestData(fx.providerId ? [fx.providerId] : [], PHONE ? [PHONE] : []);
  } finally {
    vi.unstubAllGlobals();
    await prisma?.$disconnect();
  }
});

const auditActions = () => H.audit.map((a) => a.action);

// ---------------------------------------------------------------------------
// 1. A scored loan, from the first visit to the last repayment
// ---------------------------------------------------------------------------

describe('scored loan: customer data -> limit -> disbursement -> late repayment', () => {
  // Expected figures, worked out by hand from the product terms (see SCORED).
  const AMOUNT = 5_000;
  const SERVICE_FEE = round2((AMOUNT * SCORED.serviceFeePercent) / 100); // 100
  const DAYS_LATE = 3;
  const INTEREST = round2(SCORED.duration * SCORED.dailyFee); // 30 days to the due date: 45
  const PENALTY = round2(DAYS_LATE * SCORED.penaltyPerDay); // 30
  let TAX = 0; // on the charges, per the Tax table
  let TOTAL = 0;
  const FIRST_PAYMENT = 1_000;
  let loanId = '';

  it('connects the borrower from the super app', async () => {
    const res = await post(routes.connect, '/api/auth/connect', { superAppToken: `Bearer ${CUSTOMER_TOKEN}` });
    expect(res).toMatchObject({ status: 200, body: { borrowerId: PHONE, legacy: true } });
    expect(H.cookies.has('session')).toBe(true);
    expect(auditActions()).toContain('BORROWER_CONNECT_SUCCESS');
  });

  it("links only an account the bank lists under the borrower's phone", async () => {
    const foreign = await post(routes.phoneAccounts, '/api/phone-accounts', {
      phoneNumber: PHONE,
      accountNumber: OTHER_ACCOUNT,
      customerName: MARKER,
      isActive: true,
    });
    expect(foreign.status).toBe(403);
    expect(auditActions()).toContain('BORROWER_ACCOUNT_LINK_REFUSED');

    const otherPhone = await post(routes.phoneAccounts, '/api/phone-accounts', {
      phoneNumber: '251900000000',
      accountNumber: ACCOUNT,
      isActive: true,
    });
    expect(otherPhone.status).toBe(403);

    const own = await post(routes.phoneAccounts, '/api/phone-accounts', {
      phoneNumber: PHONE,
      accountNumber: ACCOUNT,
      customerName: MARKER,
      isActive: true,
    });
    expect(own).toMatchObject({ status: 200, body: { phoneNumber: PHONE, accountNumber: ACCOUNT, isActive: true } });

    const asked = callsTo('/get-accounts');
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.every((c) => c.body.phoneNumber === PHONE)).toBe(true);
    expect(auditActions()).toContain('BORROWER_ACCOUNT_LINKED');
  });

  it('fetches the customer info, then the account statement in the background, and decides only once both are in', async () => {
    // The statement read is slow (minutes from ODS): the route answers once the customer info is in.
    holdStatements();
    const res = await post(routes.fetchCustomer, '/api/phone-accounts/fetch-customer', {
      phoneNumber: PHONE,
      accountNumber: ACCOUNT,
      providerId: fx.providerId,
    });
    expect(res, JSON.stringify(res.body)).toMatchObject({
      status: 200,
      body: { ok: true, saved: true, changed: true, pending: true, figuresComputedAt: null },
    });
    expect(await prisma.borrower.findUnique({ where: { id: PHONE } })).toMatchObject({ status: 'Active' });

    // The dashboard asks for the limit meanwhile: no decision without the statement figures.
    const waiting = await checkLoanEligibility(PHONE, fx.providerId, fx.scoredId);
    expect(waiting).toMatchObject({ isEligible: false, maxLoanAmount: 0 });
    expect(waiting.reason).toMatch(/still checking your account activity/i);

    statementGate.open();
    await settleBackgroundWork();

    const [infoCall, ...moreInfoCalls] = callsTo('/get-customer-info');
    expect(moreInfoCalls).toHaveLength(0);
    expect(infoCall.method).toBe('POST');
    expect(infoCall.body).toEqual({ accountNumber: ACCOUNT });

    const statementCalls = callsTo('/get-account-statement');
    expect(statementCalls).toHaveLength(1);
    const { startDate, endDate, withOpeningBalance, accountNumber } = statementCalls[0].body;
    expect({ accountNumber, withOpeningBalance }).toEqual({ accountNumber: ACCOUNT, withOpeningBalance: false });
    // Whole months, ending with last month, as many as the Scoring Engine asks for.
    const { loadDataFetchSettings } = await import('@/lib/data-fetch-settings');
    const months = (await loadDataFetchSettings()).statementMonths;
    const today = new Date();
    expect(startDate).toBe(format(new Date(today.getFullYear(), today.getMonth() - months, 1), 'yyyyMMdd'));
    expect(endDate).toBe(format(new Date(today.getFullYear(), today.getMonth(), 0), 'yyyyMMdd'));

    // One customer-info copy holds the bank's details and the figures computed from the statement.
    const copies = await prisma.provisionedData.findMany({ where: { borrowerId: PHONE } });
    expect(copies).toHaveLength(1);
    const stored = JSON.parse(copies[0].data);
    expect(stored).toMatchObject({
      accountNumber: ACCOUNT,
      source: 'external-customer-info',
      detail: { CustomerName: 'E2E TEST BORROWER', NetMonthlyIncome: '15000', Branchcode: '409' },
      statementFigures: {
        accountNumber: ACCOUNT,
        transactionCount: LINES_PER_MONTH * months,
        txCountRelevant: SALARY_CREDITS_PER_MONTH * months,
        monthsAtEbirr: months,
        billPaymentsCount: months,
        avgMonthlyDeposit: SALARY_CREDITS_PER_MONTH * 2000,
      },
    });
    const config = await prisma.dataProvisioningConfig.findUnique({ where: { id: copies[0].configId } });
    expect(config?.name).toBe('ExternalCustomerInfo');

    // Opening the app again reuses both: customer info is kept, the figures are fresh.
    const again = await post(routes.fetchCustomer, '/api/phone-accounts/fetch-customer', {
      phoneNumber: PHONE,
      accountNumber: ACCOUNT,
      providerId: fx.providerId,
    });
    await settleBackgroundWork();
    expect(again.body).toMatchObject({ ok: true, reused: true, changed: false });
    expect(callsTo('/get-customer-info')).toHaveLength(1);
    expect(callsTo('/get-account-statement')).toHaveLength(1);
  });

  it('scores the borrower from that data and offers the tier limit', async () => {
    const scored = await checkLoanEligibility(PHONE, fx.providerId, fx.scoredId);
    expect(scored).toMatchObject({ isEligible: true, score: 100, maxLoanAmount: SCORED_LIMIT });

    const salary = await checkLoanEligibility(PHONE, fx.providerId, fx.salaryId);
    expect(salary).toMatchObject({ isEligible: true, maxLoanAmount: (SALARY * ADVANCE_PERCENT) / 100 });
  });

  it('refuses requests outside the limit, the product range or the active account', async () => {
    const before = await prisma.loan.count({ where: { borrowerId: PHONE } });

    const overLimit = await applyFor(fx.scoredId, SCORED_LIMIT + 1_000);
    expect(overLimit.status).toBeGreaterThanOrEqual(400);
    expect(overLimit.body.error).toMatch(`exceeds the maximum allowed limit of ${SCORED_LIMIT}`);

    const belowMinimum = await applyFor(fx.scoredId, 50);
    expect(belowMinimum.status).toBeGreaterThanOrEqual(400);
    expect(belowMinimum.body.error).toMatch(/below the minimum/);

    const otherAccount = await applyFor(fx.scoredId, AMOUNT, { creditAccount: OTHER_ACCOUNT });
    expect(otherAccount.status).toBeGreaterThanOrEqual(400);
    expect(otherAccount.body.error).toMatch(/paid into your selected account/);

    const someoneElse = await applyFor(fx.scoredId, AMOUNT, { borrowerId: '251900000000' });
    expect(someoneElse.status).toBe(403);

    H.disbursementsEnabled = false;
    try {
      const switchedOff = await applyFor(fx.scoredId, AMOUNT);
      expect(switchedOff.status).toBe(503);
    } finally {
      H.disbursementsEnabled = true;
    }

    expect(await prisma.loan.count({ where: { borrowerId: PHONE } })).toBe(before);
    expect(auditActions()).toContain('LOAN_DISBURSEMENT_FAILED');
  });

  it('books the loan: application, loan, ledger, provider fund and a PENDING disbursement', async () => {
    const dataApiCallsBefore = calls.filter((c) => c.url.href.startsWith(STUB.dataApi)).length;
    const { 'Principal Receivable': principalBefore = 0 } = await ledger();

    // The dates the mini-app sends are ignored: the product sets them.
    const res = await applyFor(fx.scoredId, AMOUNT, {
      disbursedDate: '2030-01-01T00:00:00.000Z',
      dueDate: '2030-12-31T00:00:00.000Z',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    loanId = res.body.id;

    const taxDeducted = inclusiveTax(AMOUNT);
    const loan = await prisma.loan.findUniqueOrThrow({
      where: { id: loanId },
      include: { loanApplication: true, disbursementTransactions: true, installments: true },
    });
    expect(loan).toMatchObject({
      borrowerId: PHONE,
      productId: fx.scoredId,
      loanAmount: AMOUNT,
      serviceFee: SERVICE_FEE,
      taxDeducted,
      netDisbursedAmount: round2(AMOUNT - taxDeducted),
      repaymentStatus: 'Unpaid',
      repaidAmount: 0,
      loanApplication: { status: 'DISBURSED', loanAmount: AMOUNT },
    });
    expect(Math.abs(Date.now() - loan.disbursedDate.getTime())).toBeLessThan(60_000);
    expect(differenceInCalendarDays(loan.dueDate, loan.disbursedDate)).toBe(SCORED.duration);
    expect(loan.installments).toHaveLength(0);
    expect(loan.disbursementTransactions).toHaveLength(1);
    expect(loan.disbursementTransactions[0]).toMatchObject({
      disbursementStatus: 'PENDING',
      creditAccount: ACCOUNT,
      amount: round2(AMOUNT - taxDeducted),
      providerId: process.env.FORCE_PROVIDER_ID ?? 'PRO0001',
      originalProviderId: fx.providerId,
    });

    const books = await ledger();
    expect(books['Principal Receivable']).toBe(round2(principalBefore + AMOUNT));
    expect(books['ServiceFee Receivable']).toBe(SERVICE_FEE);
    expect(books['Tax Receivable']).toBe(round2(taxDeducted + taxOn({ serviceFee: SERVICE_FEE })));
    const provider = await prisma.loanProvider.findUniqueOrThrow({ where: { id: fx.providerId } });
    expect(provider.initialBalance).toBe(PROVIDER_FUND - AMOUNT);

    // Customer info and figures were current, so the decision did not fetch again.
    expect(calls.filter((c) => c.url.href.startsWith(STUB.dataApi)).length).toBe(dataApiCallsBefore);
    expect(auditActions()).toEqual(expect.arrayContaining(['LOAN_DISBURSEMENT_INITIATED', 'LOAN_DISBURSEMENT_SUCCESS']));
  });

  it("pays the money into the borrower's account through the bank and texts them", async () => {
    // The mini-app also sends an account and an amount; they must not redirect or resize the payout.
    const res = await disburse(loanId, { creditAccount: OTHER_ACCOUNT, amount: 999_999, providerId: 'X' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    const sent = callsTo('/disburse');
    expect(sent).toHaveLength(1);
    expect(sent[0].headers.get('authorization')).toBe(basicAuth(BANK_LOGIN));
    expect(sent[0].body).toEqual({
      creditAccount: ACCOUNT,
      providerId: process.env.FORCE_PROVIDER_ID ?? 'PRO0001',
      amount: round2(AMOUNT - inclusiveTax(AMOUNT)),
    });

    const record = await prisma.disbursementTransaction.findFirstOrThrow({ where: { loanId } });
    expect(record).toMatchObject({ disbursementStatus: 'SUCCESS', statusCode: 200, transactionId: expect.stringMatching(/^FT26E2E/) });

    await waitFor(() => smsTo(PHONE).length > 0, 'the disbursement SMS');
    expect(smsTo(PHONE)[0].join(' ')).toMatch(/successfully disbursed/);
  });

  it('never pays the same loan out twice', async () => {
    const again = await disburse(loanId);
    expect(again.status).toBe(409);
    expect(callsTo('/disburse')).toHaveLength(1);
  });

  it('blocks a second loan while this one is open', async () => {
    const sameProduct = await checkLoanEligibility(PHONE, fx.providerId, fx.scoredId);
    expect(sameProduct.isEligible).toBe(false);
    expect(sameProduct.reason).toMatch(/already have an active loan/);

    const otherProduct = await applyFor(fx.salaryId, 1_000);
    expect(otherProduct.status).toBeGreaterThanOrEqual(400);
    expect(otherProduct.body.error).toMatch(/exclusive loan product/);
    expect(await prisma.loan.count({ where: { borrowerId: PHONE } })).toBe(1);
  });

  it('after the due date, charges interest to the due date plus a daily penalty, and blocks new loans', async () => {
    await travel(loanId, SCORED.duration + DAYS_LATE);
    TAX = taxOn({ serviceFee: SERVICE_FEE, interest: INTEREST, penalty: PENALTY });
    TOTAL = round2(AMOUNT + SERVICE_FEE + INTEREST + PENALTY + TAX);

    const overdue = await checkLoanEligibility(PHONE, fx.providerId, fx.salaryId);
    expect(overdue.isEligible).toBe(false);
    expect(overdue.reason).toMatch(/overdue/);

    // The app's own outstanding figure, as it refuses one Birr more than the balance.
    const tooMuch = await initiatePayment(loanId, TOTAL + 1);
    expect(tooMuch.status).toBe(400);
    expect(tooMuch.body.error).toContain(`outstanding balance of ${TOTAL.toFixed(2)} ETB`);
    expect(await prisma.pendingPayment.count({ where: { loanId } })).toBe(0);
  });

  it('takes a partial repayment through the super-app gateway: penalty, fee, interest and tax first', async () => {
    const started = await initiatePayment(loanId, FIRST_PAYMENT);
    expect(started.status, JSON.stringify(started.body)).toBe(200);
    const { transactionId, paymentToken } = started.body;
    expect(paymentToken).toBe(`gateway-checkout-${transactionId}`);

    // What the gateway was asked for, signed with the shared key.
    const [checkout] = callsTo('/api/Authenticate/Payment');
    expect(checkout.headers.get('authorization')).toBe(`Bearer ${CUSTOMER_TOKEN}`);
    const b = checkout.body;
    expect(b).toMatchObject({
      accountNo: COLLECTION_ACCOUNT,
      amount: String(FIRST_PAYMENT),
      callBackURL: CALLBACK_URL,
      companyName: COMPANY_NAME,
      token: CUSTOMER_TOKEN,
      transactionId,
      transactionTime: expect.stringMatching(/^\d{14}$/),
    });
    const signed = [
      `accountNo=${COLLECTION_ACCOUNT}`,
      `amount=${b.amount}`,
      `callBackURL=${CALLBACK_URL}`,
      `companyName=${COMPANY_NAME}`,
      `Key=${PAYMENT_KEY}`,
      `token=${CUSTOMER_TOKEN}`,
      `transactionId=${transactionId}`,
      `transactionTime=${b.transactionTime}`,
    ].join('&');
    expect(b.signature).toBe(createHash('sha256').update(signed, 'utf8').digest('hex'));
    expect(await prisma.pendingPayment.findUnique({ where: { transactionId } })).toMatchObject({
      status: 'PENDING',
      amount: FIRST_PAYMENT,
      borrowerId: PHONE,
    });

    // The customer pays in the super app; the gateway calls back.
    const callback = await paymentCallback(transactionId, FIRST_PAYMENT);
    expect(callback).toMatchObject({ status: 200, body: { message: 'Payment confirmed and updated.' } });
    expect(callsTo('/api/Authenticate/Validate').at(-1)!.headers.get('authorization')).toBe(`Bearer ${GATEWAY_TOKEN}`);

    expect(await prisma.pendingPayment.findUnique({ where: { transactionId } })).toMatchObject({ status: 'COMPLETED' });
    expect(await prisma.paymentTransaction.findFirst({ where: { txnRef: transactionId } })).toMatchObject({ status: 'RECEIVED' });
    const loan = await prisma.loan.findUniqueOrThrow({ where: { id: loanId }, include: { payments: true } });
    expect(loan).toMatchObject({ repaymentStatus: 'Unpaid', repaidAmount: FIRST_PAYMENT });
    expect(loan.payments).toHaveLength(1);
    expect(loan.payments[0]).toMatchObject({ amount: FIRST_PAYMENT, outstandingBalanceBeforePayment: TOTAL });

    const principalPart = round2(FIRST_PAYMENT - PENALTY - SERVICE_FEE - INTEREST - TAX);
    expect(await postings(loan.payments[0].journalEntryId!)).toEqual({
      'Penalty Receivable Credit': PENALTY,
      'Penalty Received Debit': PENALTY,
      'Penalty Income Credit': PENALTY,
      'ServiceFee Receivable Credit': SERVICE_FEE,
      'ServiceFee Received Debit': SERVICE_FEE,
      'ServiceFee Income Credit': SERVICE_FEE,
      'Interest Receivable Credit': INTEREST,
      'Interest Received Debit': INTEREST,
      'Interest Income Credit': INTEREST,
      ...(TAX > 0 ? { 'Tax Receivable Credit': TAX, 'Tax Received Debit': TAX } : {}),
      'Principal Receivable Credit': principalPart,
      'Principal Received Debit': principalPart,
    });
    expect(auditActions()).toEqual(expect.arrayContaining(['PAYMENT_GATEWAY_REQUEST', 'REPAYMENT_SUCCESS']));
  });

  it('books a callback the gateway delivers twice only once', async () => {
    const pending = await prisma.pendingPayment.findFirstOrThrow({ where: { loanId } });
    const again = await paymentCallback(pending.transactionId, FIRST_PAYMENT);
    expect(again.status).toBe(200);
    expect(again.body.message).toMatch(/already processed/i);
    expect(await prisma.payment.count({ where: { loanId } })).toBe(1);
    expect((await prisma.loan.findUniqueOrThrow({ where: { id: loanId } })).repaidAmount).toBe(FIRST_PAYMENT);
  });

  it('closes the loan with the final repayment and clears every receivable it created', async () => {
    const rest = round2(TOTAL - FIRST_PAYMENT);
    const cbsChecksBefore = H.cbsDeletionChecks.length;
    await repay(loanId, rest);

    const loan = await prisma.loan.findUniqueOrThrow({ where: { id: loanId }, include: { payments: true } });
    expect(loan).toMatchObject({ repaymentStatus: 'Paid', repaidAmount: TOTAL, repaymentBehavior: 'LATE' });
    expect(round2(loan.payments.reduce((s, p) => s + p.amount, 0))).toBe(TOTAL);

    const books = await ledger();
    expect(books).toMatchObject({
      'Principal Receivable': 0,
      'Principal Received': AMOUNT,
      'ServiceFee Receivable': 0,
      'ServiceFee Received': SERVICE_FEE,
      'ServiceFee Income': SERVICE_FEE,
      'Interest Received': INTEREST,
      'Interest Income': INTEREST,
      'Penalty Received': PENALTY,
      'Penalty Income': PENALTY,
      'Tax Received': TAX,
      // Booked by the daily accrual jobs in production, which do not run here.
      'Interest Receivable': -INTEREST,
      'Penalty Receivable': -PENALTY,
      // The inclusive tax kept from the payout stays receivable: no repayment covers it.
      'Tax Receivable': round2(inclusiveTax(AMOUNT) + taxOn({ serviceFee: SERVICE_FEE }) - TAX),
    });
    // Repayments do not refill the provider's fund by themselves.
    expect((await prisma.loanProvider.findUniqueOrThrow({ where: { id: fx.providerId } })).initialBalance).toBe(
      PROVIDER_FUND - AMOUNT
    );
    // Asked to take the borrower off CBS NPL monitoring now that nothing is owed.
    expect(H.cbsDeletionChecks.slice(cbsChecksBefore)).toEqual([PHONE]);

    // Repaid, so the borrower may borrow again.
    expect(await checkLoanEligibility(PHONE, fx.providerId, fx.scoredId)).toMatchObject({
      isEligible: true,
      maxLoanAmount: SCORED_LIMIT,
    });
  });
});

// ---------------------------------------------------------------------------
// 2. A salary advance repaid in installments
// ---------------------------------------------------------------------------

describe('salary advance: two installments, repaid early', () => {
  const AMOUNT = 3_000;
  const INSTALLMENT = AMOUNT / SALARY_ADVANCE.installments;
  const DAYS = 10;
  const INTEREST = round2(DAYS * SALARY_ADVANCE.dailyFee);
  let loanId = '';
  let booksBefore: Record<string, number> = {};

  it('books an installment schedule from the product and pays the advance out', async () => {
    booksBefore = await ledger();
    const res = await applyFor(fx.salaryId, AMOUNT);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    loanId = res.body.id;

    const loan = await prisma.loan.findUniqueOrThrow({
      where: { id: loanId },
      include: { installments: { orderBy: { installmentNumber: 'asc' } } },
    });
    expect(loan.installments.map((i) => ({ n: i.installmentNumber, amount: i.amount, isActive: i.isActive }))).toEqual([
      { n: 1, amount: INSTALLMENT, isActive: true },
      { n: 2, amount: INSTALLMENT, isActive: false },
    ]);
    expect(loan.installments.map((i) => differenceInCalendarDays(i.dueDate, loan.disbursedDate))).toEqual([
      SALARY_ADVANCE.intervalDays,
      2 * SALARY_ADVANCE.intervalDays,
    ]);

    const before = callsTo('/disburse').length;
    expect((await disburse(loanId)).status).toBe(200);
    expect(callsTo('/disburse')).toHaveLength(before + 1);
    expect(callsTo('/disburse').at(-1)!.body.amount).toBe(round2(AMOUNT - inclusiveTax(AMOUNT)));
    expect(await prisma.disbursementTransaction.findFirstOrThrow({ where: { loanId } })).toMatchObject({
      disbursementStatus: 'SUCCESS',
    });
  });

  it('takes the first installment with the interest so far, then the rest, and closes the loan', async () => {
    await travel(loanId, DAYS);
    const tax = taxOn({ interest: INTEREST });
    const firstDue = round2(INSTALLMENT + INTEREST + tax);

    // A Birr more than the whole balance is refused before the customer is debited.
    const tooMuch = await initiatePayment(loanId, round2(AMOUNT + INTEREST + tax + 1));
    expect(tooMuch.status).toBe(400);

    await repay(loanId, firstDue);
    const afterFirst = await prisma.loan.findUniqueOrThrow({
      where: { id: loanId },
      include: { installments: { orderBy: { installmentNumber: 'asc' } }, payments: true },
    });
    expect(afterFirst).toMatchObject({ repaymentStatus: 'Unpaid', repaidAmount: firstDue });
    expect(afterFirst.installments[0].status.toUpperCase()).toBe('PAID');
    expect(afterFirst.installments[0]).toMatchObject({ isActive: false, paidAmount: INSTALLMENT });
    expect(afterFirst.installments[1]).toMatchObject({ isActive: true, paidAmount: 0 });
    expect(afterFirst.payments[0].installmentId).toBe(afterFirst.installments[0].id);

    const rest = round2(AMOUNT + INTEREST + tax - firstDue);
    await repay(loanId, rest);
    const loan = await prisma.loan.findUniqueOrThrow({
      where: { id: loanId },
      include: { installments: { orderBy: { installmentNumber: 'asc' } } },
    });
    expect(loan).toMatchObject({ repaymentStatus: 'Paid', repaymentBehavior: 'EARLY', repaidAmount: round2(AMOUNT + INTEREST + tax) });
    expect(loan.installments.map((i) => i.status.toUpperCase())).toEqual(['PAID', 'PAID']);
    // installment.paidAmount counts principal (and penalty) only; loan.repaidAmount counts everything.
    expect(round2(loan.installments.reduce((s, i) => s + (i.paidAmount ?? 0), 0))).toBe(AMOUNT);

    const books = await ledger();
    expect(books['Principal Receivable']).toBe(booksBefore['Principal Receivable']);
    expect(books['Principal Received']).toBe(round2(booksBefore['Principal Received'] + AMOUNT));
  });
});

// ---------------------------------------------------------------------------
// 3. Known gaps. Each test states the safe behaviour and FAILS today (it.fails passes while the gap
//    is open). When one is fixed, its test fails: remove `.fails` there.
// ---------------------------------------------------------------------------

describe('known gaps (expected to fail until fixed)', () => {
  /** Closes the borrower's open loans in the database, so the next probe can borrow. */
  async function closeOpenLoans() {
    await prisma.loan.updateMany({ where: { borrowerId: PHONE, repaymentStatus: 'Unpaid' }, data: { repaymentStatus: 'Paid' } });
  }

  async function bookLoan(amount: number, productId = fx.scoredId) {
    await closeOpenLoans();
    const res = await applyFor(productId, amount);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.id as string;
  }

  async function openLoan(amount: number, productId = fx.scoredId) {
    const loanId = await bookLoan(amount, productId);
    expect((await disburse(loanId)).status).toBe(200);
    return loanId;
  }

  /**
   * `setup` does everything and returns the check of the safe outcome; the check runs as an
   * `it.fails`. A failing setup fails the run instead of passing as an "expected failure".
   */
  function knownGap(name: string, setup: () => Promise<() => Promise<void>>) {
    let check: (() => Promise<void>) | undefined;
    it(`${name} (set-up)`, async () => {
      check = await setup();
    });
    // E2E_SHOW_GAPS=true runs them as plain tests, to read why each one fails.
    const gapTest = process.env.E2E_SHOW_GAPS === 'true' ? it : it.fails;
    gapTest(`KNOWN GAP: ${name}`, async () => {
      if (!check) throw new Error('set-up failed');
      try {
        await check();
      } finally {
        await closeOpenLoans();
      }
    });
  }

  knownGap("a payment callback carrying the borrower's own super-app token and a bogus Signature is not booked", async () => {
    const loanId = await openLoan(1_000);
    const started = await initiatePayment(loanId, 1_000);
    expect(started.status).toBe(200);
    // The callback checks its bearer token with the same endpoint that validates borrowers' tokens at
    // /api/auth/connect, and never checks Signature: the borrower can confirm their own payment.
    const forged = await paymentCallback(started.body.transactionId, 1_000, { token: CUSTOMER_TOKEN, signature: 'forged' });
    expect(forged.status).toBe(200);
    return async () => {
      const pending = await prisma.pendingPayment.findUniqueOrThrow({ where: { transactionId: started.body.transactionId } });
      expect(pending.status).toBe('PENDING');
      expect((await prisma.loan.findUniqueOrThrow({ where: { id: loanId } })).repaidAmount).toBe(0);
    };
  });

  knownGap('a callback reporting a smaller paidAmount than requested does not book the requested amount', async () => {
    const loanId = await openLoan(1_000);
    const started = await initiatePayment(loanId, 500);
    expect(started.status).toBe(200);
    const res = await paymentCallback(started.body.transactionId, 500, { paidAmount: 1 });
    expect(res.status).toBe(200);
    return async () => {
      expect((await prisma.loan.findUniqueOrThrow({ where: { id: loanId } })).repaidAmount).not.toBe(500);
    };
  });

  knownGap('a bank answer of HTTP 200 with status "Error" is recorded as FAILED and not texted as a success', async () => {
    const loanId = await bookLoan(1_000);
    const smsBefore = smsTo(PHONE).length;
    bank.disbursementAnswer = 'http-200-error';
    try {
      await disburse(loanId);
    } finally {
      bank.disbursementAnswer = 'success';
    }
    await waitFor(() => smsTo(PHONE).length > smsBefore, 'the disbursement SMS');
    return async () => {
      expect((await prisma.disbursementTransaction.findFirstOrThrow({ where: { loanId } })).disbursementStatus).toBe('FAILED');
      expect(smsTo(PHONE).at(-1)!.join(' ')).not.toMatch(/successfully disbursed/);
    };
  });

  knownGap('a booked loan reaches the bank even when the browser never makes the second (disbursement) call', async () => {
    const before = callsTo('/disburse').length;
    const loanId = await bookLoan(1_000);
    await settleBackgroundWork();
    return async () => {
      expect(callsTo('/disburse').length).toBe(before + 1);
      expect((await prisma.disbursementTransaction.findFirstOrThrow({ where: { loanId } })).disbursementStatus).not.toBe('PENDING');
    };
  });

  knownGap('a loan the bank refused to pay out does not stay open as a debt', async () => {
    const loanId = await bookLoan(1_000);
    bank.disbursementAnswer = 'http-500';
    try {
      expect((await disburse(loanId)).status).toBe(502);
    } finally {
      bank.disbursementAnswer = 'success';
    }
    expect((await prisma.disbursementTransaction.findFirstOrThrow({ where: { loanId } })).disbursementStatus).toBe('FAILED');
    return async () => {
      expect((await prisma.loan.findUniqueOrThrow({ where: { id: loanId } })).repaymentStatus).not.toBe('Unpaid');
    };
  });

  knownGap('a payment above the current installment but within the balance is refused before the debit, or booked', async () => {
    // Only products with 2+ installments: /api/initiate-payment allows up to the loan balance, the
    // callback refuses more than the active installment (FAILED), after the gateway took the money.
    const loanId = await openLoan(2_000, fx.salaryId);
    const started = await initiatePayment(loanId, 1_500);
    if (started.status === 200) await paymentCallback(started.body.transactionId, 1_500);
    return async () => {
      if (started.status !== 200) return; // refused before any debit: safe
      const pending = await prisma.pendingPayment.findUniqueOrThrow({ where: { transactionId: started.body.transactionId } });
      expect(pending.status).toBe('COMPLETED');
    };
  });

  knownGap('a borrower cannot record a repayment on their own loan without paying through the gateway', async () => {
    const loanId = await openLoan(1_000);
    const res = await post(routes.payments, '/api/payments', { loanId, amount: 100 });
    return async () => {
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect((await prisma.loan.findUniqueOrThrow({ where: { id: loanId } })).repaidAmount).toBe(0);
    };
  });
});

describe('isolation', () => {
  it('made no outbound request the stubs do not answer', () => {
    expect(unexpectedCalls).toEqual([]);
  });
});
