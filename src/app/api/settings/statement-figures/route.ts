import { NextRequest, NextResponse, after } from 'next/server';
import prisma from '@/lib/prisma';
import { getUserFromSession } from '@/lib/user';
import { hasPermission } from '@/lib/permissions';
import { auditRequestContext, createAuditLog } from '@/lib/audit-log';
import { openingBalanceWanted } from '@/lib/customer-data-api';
import { statementFiguresEnabled, type StatementRefreshResult } from '@/lib/statement-figures';
import { borrowerDataInProgress, syncBorrowerData, within } from '@/lib/borrower-data-sync';
import { checkLoanEligibility } from '@/actions/eligibility';
import { lookupStatementFigures, type FiguresLookupResponse, type ProductLimit } from '@/lib/statement-figures-lookup';
import type { User } from '@/lib/types';

/**
 * GET  /api/settings/statement-figures?q=<account number or phone number>
 * POST /api/settings/statement-figures  { phone }
 *
 * GET: the statement figures saved for an account (or every account of a phone), as scoring sees
 * them, and for each phone looked up the limit every active product gives it - worked out by the
 * same eligibility check the mini-app runs. Reads only; never fetches.
 *
 * POST: fetches the statement of the phone's active account from the bank's database (through the
 * data API) and saves the figures - after the customer info, when that is missing or due. It is the
 * fetch the mini-app starts when the customer opens it, so it shares that fetch's queue and its
 * 30-minute pause after a failure. Waits up to 25 s, then answers { status: 'pending' } while the
 * fetch carries on; asking again joins it. { status: 'done' } once the figures are saved, or when
 * the saved ones are still current.
 *
 * Both show customer financial figures, so only people who may create or change scoring settings
 * can use them, and every lookup and fetch is written to the audit log.
 */

const FETCH_WAIT_MS = 25_000;

async function authorize(): Promise<{ user: User; refusal: null } | { user: null; refusal: NextResponse }> {
  const user = await getUserFromSession();
  if (!user) return { user: null, refusal: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  if (!hasPermission(user, 'scoring-engine', 'create') && !hasPermission(user, 'scoring-engine', 'update')) {
    return { user: null, refusal: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { user, refusal: null };
}

/** Digits only; a local phone number (0911223344) becomes 251911223344. */
function normalizeNumber(value: unknown) {
  const digits = String(value ?? '').replace(/\s+/g, '');
  return /^0?9\d{8}$/.test(digits) ? `251${digits.slice(-9)}` : digits;
}

export async function GET(req: NextRequest) {
  const { user, refusal } = await authorize();
  if (!user) return refusal;

  const q = normalizeNumber(req.nextUrl.searchParams.get('q'));
  if (!/^\d{6,19}$/.test(q)) {
    return NextResponse.json({ error: 'Enter an account number or a phone number, digits only.' }, { status: 400 });
  }

  try {
    await createAuditLog({
      actorId: user.id,
      action: 'STATEMENT_FIGURES_VIEWED',
      entity: 'StatementFigures',
      details: { query: q },
      ...auditRequestContext(req),
    });
    const [{ results, borrowers }, providers] = await Promise.all([lookupStatementFigures(q), visibleProviders(user)]);
    const withLimits: FiguresLookupResponse['borrowers'] = [];
    for (const borrower of borrowers) {
      withLimits.push({ ...borrower, limits: borrower.isBorrower ? await limitsFor(borrower.phone, providers) : null });
    }
    const body: FiguresLookupResponse = {
      query: q,
      results,
      borrowers: withLimits,
      canFetch: statementFiguresEnabled(),
      withoutBalances: !openingBalanceWanted(),
    };
    return NextResponse.json(body);
  } catch (err) {
    console.error('[statement-figures][lookup] error', err);
    return NextResponse.json({ error: 'Could not look up the figures.' }, { status: 500 });
  }
}

/** The providers whose products this user sees on the Scoring Engine page, with their active products. */
function visibleProviders(user: User) {
  return prisma.loanProvider.findMany({
    where: user.role === 'Super Admin' || user.role === 'Admin' || !user.loanProviderId ? {} : { id: user.loanProviderId },
    orderBy: { displayOrder: 'asc' },
    select: {
      id: true,
      name: true,
      products: {
        where: { status: 'Active' },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, isSalaryAdvance: true },
      },
    },
  });
}

/** Each product's answer for this phone, from the eligibility check the mini-app runs. */
async function limitsFor(phone: string, providers: Awaited<ReturnType<typeof visibleProviders>>): Promise<ProductLimit[]> {
  const limits: ProductLimit[] = [];
  for (const provider of providers) {
    for (const product of provider.products) {
      const answer = await checkLoanEligibility(phone, provider.id, product.id);
      limits.push({
        providerId: provider.id,
        providerName: provider.name,
        productId: product.id,
        productName: product.name,
        isSalaryAdvance: product.isSalaryAdvance,
        isEligible: answer.isEligible,
        score: answer.score,
        limit: answer.isEligible ? answer.maxLoanAmount : 0,
        reason: answer.reason,
      });
    }
  }
  return limits;
}

export async function POST(req: NextRequest) {
  const { user, refusal } = await authorize();
  if (!user) return refusal;

  try {
    const body = await req.json().catch(() => null);
    const phone = normalizeNumber(body?.phone);
    if (!/^\d{9,15}$/.test(phone)) {
      return NextResponse.json({ error: 'Send the phone number to fetch the figures for.' }, { status: 400 });
    }
    if (!statementFiguresEnabled()) {
      return NextResponse.json(
        { error: 'Statement fetching is switched off (STATEMENT_FIGURES_ENABLED), so no figures can be fetched.' },
        { status: 503 }
      );
    }

    const [borrower, active, config] = await Promise.all([
      prisma.borrower.findUnique({ where: { id: phone }, select: { id: true } }),
      prisma.phoneAccount.findFirst({ where: { phoneNumber: phone, isActive: true }, select: { accountNumber: true } }),
      prisma.dataProvisioningConfig.findFirst({ where: { name: 'ExternalCustomerInfo' }, select: { id: true } }),
    ]);
    if (!borrower) {
      return NextResponse.json({ error: 'This phone has not opened the mini-app yet, so there is no customer to fetch for.' }, { status: 404 });
    }
    // Only the active account: the customer-info copy holds one account, and scoring reads that one.
    if (!active) {
      return NextResponse.json({ error: 'This phone has no account selected; figures are fetched for the account the customer selects.' }, { status: 409 });
    }
    if (!config) {
      return NextResponse.json({ error: 'No ExternalCustomerInfo data source is set up, so the figures have nowhere to be saved.' }, { status: 409 });
    }
    const account = active.accountNumber.trim();

    // Asking again while the fetch runs joins it; only a new fetch is recorded.
    if (!borrowerDataInProgress(phone, account)) {
      await createAuditLog({
        actorId: user.id,
        action: 'STATEMENT_FIGURES_FETCH_REQUESTED',
        entity: 'StatementFigures',
        entityId: phone,
        details: { phone, accountNumber: account },
        ...auditRequestContext(req),
      });
    }
    const sync = syncBorrowerData(phone, account, config.id);
    after(sync.done);
    if (!(await within(sync.done.then(() => true), FETCH_WAIT_MS))) {
      return NextResponse.json({ status: 'pending' }, { status: 202 });
    }

    const customerInfo = await sync.customerInfo;
    if (!customerInfo.ok) {
      return NextResponse.json(
        { error: `The data API did not return the customer info (${customerInfo.status}), so no statement was fetched.` },
        { status: 502 }
      );
    }
    if (customerInfo.outcome === 'stale') {
      return NextResponse.json({ error: 'The data API could not be reached, so no statement was fetched. Try again later.' }, { status: 502 });
    }
    const statement = await sync.statement;
    if (!statement) {
      return NextResponse.json({ error: 'Fetching failed; look for "[borrower-data]" in the app log.' }, { status: 500 });
    }
    if (statement.ok) return NextResponse.json({ status: 'done', outcome: statement.outcome });
    const { message, status } = refusalOf(statement);
    return NextResponse.json({ error: message }, { status });
  } catch (err) {
    console.error('[statement-figures][fetch] error', err);
    return NextResponse.json({ error: 'Could not fetch the figures.' }, { status: 500 });
  }
}

function refusalOf(result: Extract<StatementRefreshResult, { ok: false }>): { message: string; status: number } {
  switch (result.reason) {
    case 'disabled':
      return { message: 'Statement fetching is switched off (STATEMENT_FIGURES_ENABLED).', status: 503 };
    case 'no-customer-info':
    case 'account-changed':
      return { message: 'The customer changed their account while the statement was being fetched. Look up again.', status: 409 };
    case 'recent-failure':
      return {
        message: 'The last fetch for this account failed less than 30 minutes ago, so it is not tried again yet. The app log has the reason ("[statement-figures]").',
        status: 503,
      };
    case 'busy':
      return { message: 'Too many statements are being fetched right now. Try again shortly.', status: 503 };
    default:
      return {
        message: `The bank's database did not return the statement (${result.status ?? 'no answer'}). The app log has the details ("[statement-figures]").`,
        status: 502,
      };
  }
}
