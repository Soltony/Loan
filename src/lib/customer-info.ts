import { Prisma } from '@prisma/client';
import prisma from './prisma';
import {
  buildCustomerInfoPayload,
  fetchCustomerInfo,
  isFetchedWithin,
  parseStoredPayload,
  storedAccountNumber,
} from './customer-data-api';
import { loadDataFetchSettings } from './data-fetch-settings';

const EXTERNAL_CUSTOMER_INFO = 'ExternalCustomerInfo';
const DAY_MS = 24 * 60 * 60 * 1000;

export type CustomerInfoSyncResult =
  | { ok: true; outcome: 'reused' | 'saved' | 'stale'; provisionedDataId: string }
  | { ok: false; status: number; body: string | null };

/** The borrower's customer-info rows, oldest first. Normally one; older data can hold one per provider. */
export function loadCustomerInfoCopies(borrowerId: string) {
  return prisma.provisionedData.findMany({
    where: { borrowerId, uploadId: null, config: { name: EXTERNAL_CUSTOMER_INFO } },
    orderBy: { updatedAt: 'asc' },
    select: { id: true, data: true },
  });
}

/**
 * Makes sure the borrower's stored customer info for `accountNumber` is there and current enough.
 *
 * Customer details barely change, so by default they are fetched once and kept; the Scoring Engine
 * can set a refresh interval in days. A different account is always fetched.
 *
 * Each borrower has ONE customer-info copy, shared by every provider. Older data can still hold one
 * copy per provider; all of them are rewritten with the same content so scoring never mixes them.
 * `configId` is only used when the borrower has no copy yet.
 */
export async function syncCustomerInfo(
  borrowerId: string,
  accountNumber: string,
  configId: string
): Promise<CustomerInfoSyncResult> {
  const copies = await loadCustomerInfoCopies(borrowerId);
  const parsed = copies.map((c) => parseStoredPayload(c.data));
  const newest = copies.length - 1;
  const isThisAccount = (p: Record<string, any> | null) => storedAccountNumber(p) === accountNumber;

  const { customerInfoRefreshDays } = await loadDataFetchSettings();
  const keepForever = customerInfoRefreshDays === 0;
  if (
    parsed.length > 0 &&
    parsed.every(isThisAccount) &&
    (keepForever || isFetchedWithin(parsed[newest], customerInfoRefreshDays * DAY_MS))
  ) {
    return { ok: true, outcome: 'reused', provisionedDataId: copies[newest].id };
  }

  const upstream = await fetchCustomerInfo(accountNumber);
  const detail = upstream.ok ? (upstream.body?.detail ?? upstream.body?.details) : null;
  const hasDetail = detail && typeof detail === 'object' && !Array.isArray(detail);

  if (!upstream.ok || !hasDetail) {
    const failure = upstream.ok
      ? { ok: false as const, status: 502, body: JSON.stringify(upstream.body) }
      : upstream;
    console.warn('[customer-info] upstream returned', failure.status, failure.body);
    // Scoring keeps using the stored copy of this account until the API is reachable again.
    const storedIndex = parsed.findLastIndex(isThisAccount);
    if (storedIndex >= 0) {
      return { ok: true, outcome: 'stale', provisionedDataId: copies[storedIndex].id };
    }
    return failure;
  }

  // Re-read: a background statement refresh may have stored figures while we waited for the API.
  const latest = await loadCustomerInfoCopies(borrowerId);
  const data = JSON.stringify(
    buildCustomerInfoPayload(
      latest.map((c) => parseStoredPayload(c.data)),
      {
        source: 'external-customer-info',
        accountNumber,
        fetchedAt: new Date().toISOString(),
        odsFetchedAt: upstream.odsFetchedAt,
        detail,
      }
    )
  );

  if (latest.length > 0) {
    await prisma.$transaction(
      latest.map((c) => prisma.provisionedData.update({ where: { id: c.id }, data: { data } }))
    );
    return { ok: true, outcome: 'saved', provisionedDataId: latest[latest.length - 1].id };
  }

  try {
    const created = await prisma.provisionedData.create({ data: { borrowerId, configId, data } });
    return { ok: true, outcome: 'saved', provisionedDataId: created.id };
  } catch (e) {
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
    // A concurrent request created the copy first: store this fetch in it.
    const existing = await prisma.provisionedData.findFirst({
      where: { borrowerId, configId, uploadId: null },
      select: { id: true },
    });
    if (!existing) throw e;
    await prisma.provisionedData.update({ where: { id: existing.id }, data: { data } });
    return { ok: true, outcome: 'saved', provisionedDataId: existing.id };
  }
}
