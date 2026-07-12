import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { getPhoneNumbersForAccount, getActiveAccountNumber } from '@/lib/account-utils';

/**
 * @fileOverview Shared helpers for reading/writing a borrower's TIN (Tax Identification Number).
 *
 * The TIN is stored as an additional `TINNo` property inside the existing `data` JSON of a
 * borrower's ProvisionedData row (preferring the `ExternalCustomerInfo` config), without
 * disturbing any other fields already present in that JSON object.
 */

export const EXTERNAL_CUSTOMER_INFO_CONFIG = 'ExternalCustomerInfo';

/** Property name used to persist the TIN inside the ProvisionedData `data` JSON. */
export const TIN_JSON_KEY = 'TINNo';

function safeParse(json: string | null | undefined): Record<string, any> | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Extract a stored TIN from a ProvisionedData `data` JSON string, checking a few reasonable
 * key spellings/locations. Returns a trimmed non-empty string or null.
 */
export function extractTinFromData(json: string | null | undefined): string | null {
  const parsed = safeParse(json);
  if (!parsed) return null;
  const detail = parsed.detail && typeof parsed.detail === 'object' ? parsed.detail : {};
  const candidates = [
    parsed.TINNo, parsed.TinNo, parsed.tinNo, parsed.TIN, parsed.tin,
    detail.TINNo, detail.TinNo, detail.tinNo, detail.TIN, detail.tin,
  ];
  for (const c of candidates) {
    if (c !== null && c !== undefined && String(c).trim() !== '') {
      return String(c).trim();
    }
  }
  return null;
}

/**
 * Resolve every borrowerId under which this borrower's provisioned data might be stored:
 * all phone numbers linked to the same account(s), plus the active account number itself
 * (some provisioned datasets are keyed by AccountNumber rather than phone).
 */
async function resolveLookupIds(borrowerId: string): Promise<string[]> {
  const ids = new Set<string>();
  ids.add(String(borrowerId));
  try {
    const phones = await getPhoneNumbersForAccount(borrowerId);
    for (const p of phones) if (p) ids.add(String(p));
  } catch {
    /* fall back to just borrowerId */
  }
  try {
    const active = await getActiveAccountNumber(borrowerId);
    if (active) ids.add(String(active));
  } catch {
    /* ignore */
  }
  return Array.from(ids).filter((v) => v && v.trim() !== '');
}

/**
 * Return the borrower's stored TIN, or null if none is on file yet.
 */
export async function readTinForBorrower(borrowerId: string): Promise<string | null> {
  const ids = await resolveLookupIds(borrowerId);
  if (ids.length === 0) return null;

  const rows = await prisma.provisionedData.findMany({
    where: { borrowerId: { in: ids } },
    orderBy: { updatedAt: 'desc' },
    select: { data: true },
  });

  for (const row of rows) {
    const tin = extractTinFromData(row.data as string);
    if (tin) return tin;
  }
  return null;
}

/** Locate a usable ExternalCustomerInfo config, creating a minimal one for the provider if needed. */
async function ensureConfigForTin(providerId?: string | null): Promise<{ id: string } | null> {
  if (providerId) {
    const scoped = await prisma.dataProvisioningConfig.findFirst({
      where: { providerId, name: EXTERNAL_CUSTOMER_INFO_CONFIG },
      select: { id: true },
    });
    if (scoped) return scoped;
  }

  const anyConfig = await prisma.dataProvisioningConfig.findFirst({
    where: { name: EXTERNAL_CUSTOMER_INFO_CONFIG },
    select: { id: true },
  });
  if (anyConfig) return anyConfig;

  if (providerId) {
    const created = await prisma.dataProvisioningConfig.create({
      data: {
        providerId,
        name: EXTERNAL_CUSTOMER_INFO_CONFIG,
        columns: JSON.stringify([
          { id: 'col-tin-0', name: 'AccountNumber', type: 'string', isIdentifier: true, options: [] },
          { id: 'col-tin-1', name: 'TINNo', type: 'string', isIdentifier: false, options: [] },
        ]),
      },
      select: { id: true },
    });
    return created;
  }
  return null;
}

async function ensureBorrower(borrowerId: string): Promise<void> {
  try {
    await prisma.borrower.create({ data: { id: borrowerId, status: 'Active' } });
  } catch (e: any) {
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) {
      throw e;
    }
  }
}

/**
 * Persist a borrower's TIN. Merges `TINNo` into an existing ProvisionedData row when one exists
 * (preferring the ExternalCustomerInfo row, provider-scoped when possible), preserving all other
 * JSON fields. Falls back to creating a minimal row if the borrower has no provisioned data yet.
 */
export async function writeTinForBorrower(
  borrowerId: string,
  rawTin: string,
  providerId?: string | null,
): Promise<{ tin: string }> {
  const tin = String(rawTin ?? '').trim();
  if (!tin) throw new Error('TIN Number is required');

  const ids = await resolveLookupIds(borrowerId);

  // Prefer an existing ExternalCustomerInfo row (provider-scoped first, then most recent).
  const externalRows = await prisma.provisionedData.findMany({
    where: { borrowerId: { in: ids }, config: { name: EXTERNAL_CUSTOMER_INFO_CONFIG } },
    include: { config: { select: { providerId: true } } },
    orderBy: { updatedAt: 'desc' },
  });

  type TargetRow = (typeof externalRows)[number];

  let target: TargetRow | null = null;
  if (providerId) {
    target = externalRows.find((r) => r.config?.providerId === providerId) ?? null;
  }
  if (!target) target = externalRows[0] ?? null;

  // Otherwise fall back to any provisioned data row for this borrower.
  if (!target) {
    target = await prisma.provisionedData.findFirst({
      where: { borrowerId: { in: ids } },
      include: { config: { select: { providerId: true } } },
      orderBy: { updatedAt: 'desc' },
    });
  }

  if (target) {
    const parsed = safeParse(target.data as string) ?? {};
    parsed[TIN_JSON_KEY] = tin;
    await prisma.provisionedData.update({
      where: { id: target.id },
      data: { data: JSON.stringify(parsed) },
    });
    return { tin };
  }

  // No provisioned data at all for this borrower — create a minimal row to hold the TIN.
  const config = await ensureConfigForTin(providerId);
  if (!config) {
    throw new Error('No data provisioning config is available to store the TIN.');
  }
  await ensureBorrower(String(borrowerId));
  const payload = {
    source: 'tin-collection',
    [TIN_JSON_KEY]: tin,
    savedAt: new Date().toISOString(),
  };
  await prisma.provisionedData.create({
    data: { borrowerId: String(borrowerId), configId: config.id, data: JSON.stringify(payload) },
  });
  return { tin };
}
