/**
 * @fileOverview Which bank accounts belong to a phone number, from the bank's get-accounts service
 * (EXTERNAL_API_URL, the list the mini-app's account picker shows). Linking an account, making it
 * the active one and taking a loan are checked against it, so nobody can be scored on, or paid
 * into, someone else's account.
 */

// A successful answer is reused for a few minutes: the picker, the link and the loan request
// usually come within moments of each other.
const CACHE_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 20_000;

const cache: Map<string, { at: number; accounts: Set<string> }> = ((globalThis as any).__bankAccountsByPhone ??=
  new Map());

/** The account numbers in a get-accounts answer: `{ details: [{ AccountNumber }, ...] }`. */
export function accountNumbersFrom(body: unknown): Set<string> {
  const details = (body as { details?: unknown })?.details;
  const list = Array.isArray(details) ? details : details && typeof details === 'object' ? [details] : [];
  return new Set(
    list
      .map((item: any) => item?.AccountNumber ?? item?.accountNumber)
      .filter((value) => value !== undefined && value !== null && String(value).trim() !== '')
      .map((value) => String(value).trim())
  );
}

/** 'unavailable' = the bank could not be asked; callers refuse rather than allow. */
export type AccountOwnership = 'yes' | 'no' | 'unavailable';

/** Whether the bank lists `accountNumber` under `phoneNumber`. */
export async function accountBelongsToPhone(phoneNumber: string, accountNumber: string): Promise<AccountOwnership> {
  const account = String(accountNumber).trim();
  const url = process.env.EXTERNAL_API_URL?.trim();
  if (!url) {
    // Development machines have no bank network; allowed only where /api/dev-login is (see there).
    if (process.env.NODE_ENV !== 'production' && process.env.MINIAPP_TEST_LOGIN === 'true') {
      console.warn('[bank-accounts] EXTERNAL_API_URL is not set: account ownership NOT checked (development only)');
      return 'yes';
    }
    console.error('[bank-accounts] EXTERNAL_API_URL is not set: account ownership cannot be checked');
    return 'unavailable';
  }

  const cached = cache.get(phoneNumber);
  // Only a "yes" is taken from the cache: an account opened a minute ago is asked about again.
  if (cached && Date.now() - cached.at < CACHE_MS && cached.accounts.has(account)) return 'yes';

  const user = process.env.EXTERNAL_API_USERNAME;
  const pass = process.env.EXTERNAL_API_PASSWORD;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(user && pass ? { Authorization: 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64') } : {}),
      },
      body: JSON.stringify({ phoneNumber }),
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn('[bank-accounts] get-accounts answered', res.status);
      return 'unavailable';
    }
    const accounts = accountNumbersFrom(await res.json());
    cache.set(phoneNumber, { at: Date.now(), accounts });
    return accounts.has(account) ? 'yes' : 'no';
  } catch (err: any) {
    console.warn('[bank-accounts] get-accounts failed', String(err?.message ?? err));
    return 'unavailable';
  }
}
