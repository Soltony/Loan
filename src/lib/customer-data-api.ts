/**
 * @fileOverview Client for customer info and account statements, plus helpers for the
 * customer-info payload this project stores in ProvisionedData.
 *
 * When CUSTOMER_DATA_API_URL is set (e.g. http://10.0.0.5:8000/nibtera-loan) the calls go to the
 * shared Nibtera Data API, logging in with CUSTOMER_DATA_API_USERNAME / CUSTOMER_DATA_API_PASSWORD.
 * Otherwise they go to the bank middleware URLs used before (EXTERNAL_CUSTOMER_INFO_URL,
 * EXTERNAL_STATEMENT_URL) with the EXTERNAL_API_* login, which disbursement and get-accounts
 * also use.
 */

export type UpstreamResult =
  | {
      ok: true;
      body: any;
      /** "ods" or "shared-store" when the data API answered; null for the bank middleware. */
      source: string | null;
      /** When the data API read this data from ODS (its X-Data-Fetched-At header), if it said. */
      odsFetchedAt: string | null;
    }
  | { ok: false; status: number; body: string | null };

// The data API reads customer info from ODS a few at a time; in a rush of new customers the rest
// wait their turn there. Wait long enough to keep that place: the fetch runs in the background
// (see borrower-data-sync.ts), so nobody looks at a spinner this long.
const CUSTOMER_INFO_TIMEOUT_MS = 180_000;
// The data API gives up on an ODS statement query after 240 s (QUERY_TIMEOUT_SECONDS in api.py).
// Wait longer than that, so a slow first fetch still reaches us instead of being abandoned.
const STATEMENT_TIMEOUT_MS = 300_000;

function endpoint(kind: 'customer' | 'statement') {
  const base = process.env.CUSTOMER_DATA_API_URL?.trim().replace(/\/+$/, '');
  if (base) {
    return {
      url: `${base}/${kind === 'customer' ? 'get-customer-info' : 'get-account-statement'}`,
      user: process.env.CUSTOMER_DATA_API_USERNAME,
      pass: process.env.CUSTOMER_DATA_API_PASSWORD,
    };
  }
  return {
    url:
      kind === 'customer'
        ? process.env.EXTERNAL_CUSTOMER_INFO_URL
        : process.env.EXTERNAL_STATEMENT_URL || process.env.EXTERNAL_CUSTOMER_STATEMENT_URL,
    user: process.env.EXTERNAL_API_USERNAME,
    pass: process.env.EXTERNAL_API_PASSWORD,
  };
}

async function post(kind: 'customer' | 'statement', body: unknown, timeoutMs: number): Promise<UpstreamResult> {
  const { url, user, pass } = endpoint(kind);
  if (!url) {
    throw new Error(
      kind === 'customer'
        ? 'Set CUSTOMER_DATA_API_URL or EXTERNAL_CUSTOMER_INFO_URL'
        : 'Set CUSTOMER_DATA_API_URL or EXTERNAL_STATEMENT_URL'
    );
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (user && pass) {
    headers.Authorization = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err: any) {
    const timedOut = err?.name === 'TimeoutError';
    return { ok: false, status: timedOut ? 504 : 502, body: String(err?.message ?? err) };
  }

  if (!res.ok) {
    return { ok: false, status: res.status, body: await res.text().catch(() => null) };
  }
  return {
    ok: true,
    body: await res.json().catch(() => null),
    source: res.headers.get('X-Data-Source'),
    odsFetchedAt: res.headers.get('X-Data-Fetched-At'),
  };
}

export function fetchCustomerInfo(accountNumber: string) {
  return post('customer', { accountNumber }, CUSTOMER_INFO_TIMEOUT_MS);
}

/**
 * startDate / endDate are YYYYMMDD.
 *
 * From the data API the statement comes without balances unless STATEMENT_OPENING_BALANCE=true:
 * the opening balance is the sum of the account's whole history, which takes minutes because ODS
 * has no index on the account, and only avgBalance needs it. The bank middleware does not know
 * the option, so it is sent to the data API only.
 */
export function fetchAccountStatement(accountNumber: string, startDate?: string, endDate?: string) {
  const body: Record<string, unknown> = { accountNumber, startDate, endDate };
  if (process.env.CUSTOMER_DATA_API_URL?.trim() && !openingBalanceWanted()) {
    body.withOpeningBalance = false;
  }
  return post('statement', body, STATEMENT_TIMEOUT_MS);
}

/** Whether statements are fetched with balances (needed for avgBalance only). */
export function openingBalanceWanted() {
  return process.env.STATEMENT_OPENING_BALANCE?.trim().toLowerCase() === 'true';
}

// ---------------------------------------------------------------------------
// Stored customer-info payload: { source, accountNumber, fetchedAt, odsFetchedAt?, detail, ...extras }
// `extras` are fields this project adds itself, such as the borrower's TINNo and the
// statementFigures computed from the account's statement (see statement-figures.ts).
// ---------------------------------------------------------------------------

const PAYLOAD_KEYS = new Set(['source', 'accountNumber', 'fetchedAt', 'odsFetchedAt', 'detail']);

export function parseStoredPayload(json: string | null | undefined): Record<string, any> | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** The bank account a stored payload describes. */
export function storedAccountNumber(payload: Record<string, any> | null | undefined): string | null {
  if (!payload) return null;
  const detail = payload.detail && typeof payload.detail === 'object' ? payload.detail : payload;
  const value =
    payload.accountNumber ?? detail.AccountNumber ?? detail.accountNumber ?? detail.account_number ?? null;
  return value != null && String(value).trim() !== '' ? String(value).trim() : null;
}

/** True when the payload was fetched less than `maxAgeMs` ago. */
export function isFetchedWithin(payload: Record<string, any> | null | undefined, maxAgeMs: number, now = Date.now()) {
  const fetchedAt = Date.parse(String(payload?.fetchedAt ?? ''));
  return Number.isFinite(fetchedAt) && now - fetchedAt < maxAgeMs;
}

/**
 * The payload to store after a fresh customer-info fetch.
 *
 * - Extras this project added (e.g. TINNo) are carried over from every stored copy, except
 *   statementFigures, which are kept only when they describe the same account.
 * - Bank fields the fresh response lacks (e.g. Branchcode, which the data API does not return yet)
 *   are kept from stored copies of the SAME account only; a different account's fields are dropped.
 * - Fresh values win on conflict, including fresh nulls.
 *
 * @param storedCopies parsed stored payloads, oldest first (later copies win).
 */
export function buildCustomerInfoPayload(
  storedCopies: Array<Record<string, any> | null>,
  fresh: {
    accountNumber: string;
    detail: Record<string, any> | null;
    fetchedAt: string;
    source: string;
    odsFetchedAt?: string | null;
  }
): Record<string, any> {
  const extras: Record<string, any> = {};
  let keptDetail: Record<string, any> = {};

  for (const copy of storedCopies) {
    if (!copy) continue;
    for (const [key, value] of Object.entries(copy)) {
      if (!PAYLOAD_KEYS.has(key)) extras[key] = value;
    }
    if (
      storedAccountNumber(copy) === fresh.accountNumber &&
      copy.detail &&
      typeof copy.detail === 'object' &&
      !Array.isArray(copy.detail)
    ) {
      keptDetail = { ...keptDetail, ...copy.detail };
    }
  }
  if (String(extras.statementFigures?.accountNumber ?? '') !== fresh.accountNumber) {
    delete extras.statementFigures;
  }

  return {
    ...extras,
    source: fresh.source,
    accountNumber: fresh.accountNumber,
    fetchedAt: fresh.fetchedAt,
    ...(fresh.odsFetchedAt ? { odsFetchedAt: fresh.odsFetchedAt } : {}),
    detail: { ...keptDetail, ...(fresh.detail ?? {}) },
  };
}
