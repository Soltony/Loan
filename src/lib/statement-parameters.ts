import { createHash } from 'crypto';
import prisma from './prisma';
import { fetchAccountStatement } from './customer-data-api';
import { loadDataFetchSettings } from './data-fetch-settings';
import {
  computeMetrics,
  fieldFromName,
  linesMatchingDefinition,
  normalizeStatementLines,
  parseAmount,
  parseWords,
  type StatementParameterDefinition,
} from './statement-utils';

/**
 * @fileOverview Statement parameters: statement figures defined in the Scoring Engine without code
 * ("count of Telebirr transactions per month", "share of income spent on bills" ...).
 *
 * They are created, changed and removed through maker-checker approval (PendingChange with
 * entityType "StatementParameter"). Approved definitions are computed with the built-in figures
 * (see statement-figures.ts) and offered as fields to scoring rules.
 */

export const DIRECTIONS = ['IN', 'OUT', 'BOTH'] as const;
export const MEASURES = ['COUNT_PER_MONTH', 'AMOUNT_PER_MONTH', 'MONTHS_WITH_ANY', 'SHARE_OF_INCOME'] as const;

/** Field names scoring already uses: built-in statement figures and loan history. */
const RESERVED_FIELDS = [
  'monthsAtEbirr', 'txCountRelevant', 'billPaymentsCount', 'avgMonthlyDeposit', 'avgUniqueDepositSources',
  'avgMonthlyAirtimeCount', 'avgMonthlyAirtimeValue', 'withdrawalToDepositRatio', 'avgBalance', 'accountMetricsRaw',
  'totalLoansCount', 'loansOnTime', 'loansLate', 'loansEarly', 'loansOnTimeTop5', 'loansLateTop5', 'loansEarlyTop5', 'id',
];

const MAX_WORDS = 20;

/** A definition with every value checked and tidied, or the first problem found. */
export function validateDefinition(
  input: any
): { ok: true; definition: StatementParameterDefinition } | { ok: false; error: string } {
  const name = String(input?.name ?? '').trim().replace(/\s+/g, ' ');
  if (name.length < 3 || name.length > 60) return { ok: false, error: 'Name must be 3 to 60 characters.' };

  const field = input?.field ? String(input.field) : fieldFromName(name);
  if (!/^[a-z][A-Za-z0-9]{2,49}$/.test(field)) {
    return { ok: false, error: 'Name must start with a letter and contain letters or digits.' };
  }
  if (RESERVED_FIELDS.some((f) => f.toLowerCase() === field.toLowerCase())) {
    return { ok: false, error: `"${field}" is already a built-in scoring field. Choose another name.` };
  }

  const direction = String(input?.direction ?? '');
  if (!(DIRECTIONS as readonly string[]).includes(direction)) return { ok: false, error: 'Choose money in, money out or both.' };
  const measure = String(input?.measure ?? '');
  if (!(MEASURES as readonly string[]).includes(measure)) return { ok: false, error: 'Choose what to measure.' };
  if (measure === 'SHARE_OF_INCOME' && direction === 'BOTH') {
    return { ok: false, error: 'Share of income needs money in or money out, not both.' };
  }

  const match = parseWords(input?.matchWords);
  const exclude = parseWords(input?.excludeWords);
  if (match.length === 0) return { ok: false, error: 'Enter at least one word to match.' };
  for (const w of [...match, ...exclude]) {
    if (w.length < 2 || w.length > 40) return { ok: false, error: `"${w}": each word must be 2 to 40 characters.` };
  }
  if (match.length > MAX_WORDS || exclude.length > MAX_WORDS) return { ok: false, error: `Use at most ${MAX_WORDS} words per list.` };

  let minAmount: number | null = null;
  if (input?.minAmount !== undefined && input?.minAmount !== null && String(input.minAmount).trim() !== '') {
    minAmount = Number(input.minAmount);
    if (!Number.isFinite(minAmount) || minAmount < 0) return { ok: false, error: 'Minimum amount must be 0 or more.' };
  }

  return {
    ok: true,
    definition: {
      field,
      name,
      direction: direction as StatementParameterDefinition['direction'],
      matchWords: match.join(', '),
      excludeWords: exclude.length ? exclude.join(', ') : null,
      measure: measure as StatementParameterDefinition['measure'],
      minAmount,
    },
  };
}

function toDefinition(row: {
  field: string; name: string; direction: string; matchWords: string; excludeWords?: string | null; measure: string; minAmount?: number | null;
}): StatementParameterDefinition {
  return {
    field: row.field,
    name: row.name,
    direction: row.direction as StatementParameterDefinition['direction'],
    matchWords: row.matchWords,
    excludeWords: row.excludeWords ?? null,
    measure: row.measure as StatementParameterDefinition['measure'],
    minAmount: row.minAmount ?? null,
  };
}

/** All approved definitions, ordered by field. */
export async function loadStatementParameters(): Promise<StatementParameterDefinition[]> {
  const rows = await prisma.statementParameter.findMany({ orderBy: { field: 'asc' } });
  return rows.map(toDefinition);
}

/** Changes whenever any definition changes, so stored figures know to be recomputed. */
export function definitionsVersion(definitions: StatementParameterDefinition[]): string {
  const canonical = definitions.map(toDefinition).sort((a, b) => a.field.localeCompare(b.field));
  return createHash('sha1').update(JSON.stringify(canonical)).digest('hex').slice(0, 12);
}

/** camelCase names of every data-provisioning column, which rules also use as fields. */
async function provisionedFieldNames(): Promise<Set<string>> {
  const configs = await prisma.dataProvisioningConfig.findMany({ select: { columns: true } });
  const names = new Set<string>();
  for (const c of configs) {
    try {
      for (const col of JSON.parse(c.columns) ?? []) if (col?.name) names.add(fieldFromName(col.name).toLowerCase());
    } catch {
      // ignore unreadable column lists
    }
  }
  return names;
}

type ChangeType = 'CREATE' | 'UPDATE' | 'DELETE';

/**
 * Checks a StatementParameter change request against the database. Used when the request is made
 * and again when it is approved, since other changes may have happened in between.
 * Returns the definition to store (CREATE/UPDATE), or an error message.
 */
export async function checkStatementParameterChange(
  changeType: ChangeType,
  entityId: string | null | undefined,
  payload: any
): Promise<{ ok: true; definition: StatementParameterDefinition | null } | { ok: false; error: string }> {
  if (changeType === 'CREATE') {
    const checked = validateDefinition(payload?.created);
    if (!checked.ok) return checked;
    const { field } = checked.definition;
    const existing = await prisma.statementParameter.findFirst({ where: { field } });
    if (existing) return { ok: false, error: `A statement parameter named "${existing.name}" already uses the field "${field}".` };
    if ((await provisionedFieldNames()).has(field.toLowerCase())) {
      return { ok: false, error: `"${field}" is already a column in uploaded data. Choose another name.` };
    }
    return checked;
  }

  const current = entityId ? await prisma.statementParameter.findUnique({ where: { id: entityId } }) : null;
  if (!current) return { ok: false, error: 'That statement parameter no longer exists.' };

  if (changeType === 'UPDATE') {
    // The field is what rules refer to, so it never changes; renaming only changes the label.
    const checked = validateDefinition({ ...payload?.updated, field: current.field });
    return checked;
  }

  const usedBy = await prisma.rule.findMany({
    where: { field: current.field },
    select: { parameter: { select: { provider: { select: { name: true } } } } },
  });
  if (usedBy.length > 0) {
    const providers = Array.from(new Set(usedBy.map((r) => r.parameter.provider.name))).join(', ');
    return { ok: false, error: `Scoring rules still use "${current.name}" (${providers}). Remove those rules first.` };
  }
  return { ok: true, definition: null };
}

/** Applies an approved StatementParameter change (called from /api/approvals). */
export async function applyStatementParameterChange(change: {
  changeType: string;
  entityId: string | null;
  payload: string;
}) {
  const changeType = change.changeType as ChangeType;
  const checked = await checkStatementParameterChange(changeType, change.entityId, JSON.parse(change.payload));
  if (!checked.ok) throw new Error(checked.error);

  if (changeType === 'CREATE') {
    await prisma.statementParameter.create({ data: checked.definition! });
  } else if (changeType === 'UPDATE') {
    const { name, direction, matchWords, excludeWords, measure, minAmount } = checked.definition!;
    await prisma.statementParameter.update({
      where: { id: change.entityId! },
      data: { name, direction, matchWords, excludeWords, measure, minAmount },
    });
  } else {
    await prisma.statementParameter.delete({ where: { id: change.entityId! } });
  }
}

export type StatementParameterPreview =
  | {
      ok: true;
      field: string;
      value: number | null;
      months: string[];
      matchedCount: number;
      sample: { date: string | null; direction: 'IN' | 'OUT'; amount: number; description: string | null; narrative: string | null }[];
    }
  | { ok: false; status: number; error: string };

/**
 * Computes a definition (saved or not) for one account, from the same months and statement the
 * figures use, and shows the lines it matched. Lets the author check it before sending it for approval.
 */
export async function previewStatementParameter(input: any, accountNumber: string): Promise<StatementParameterPreview> {
  const checked = validateDefinition(input);
  if (!checked.ok) return { ok: false, status: 400, error: checked.error };
  if (!/^\d{6,19}$/.test(accountNumber)) return { ok: false, status: 400, error: 'Enter an account number (digits only).' };

  // Same window as the stored figures: whole months, ending with last month.
  const { statementMonths } = await loadDataFetchSettings();
  const today = new Date();
  const ymd = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const periodStart = ymd(new Date(today.getFullYear(), today.getMonth() - statementMonths, 1));
  const periodEnd = ymd(new Date(today.getFullYear(), today.getMonth(), 0));
  const asOf = ymd(today);

  const upstream = await fetchAccountStatement(accountNumber, periodStart, periodEnd);
  const info = upstream.ok ? (upstream.body?.details ?? upstream.body) : null;
  if (!upstream.ok || !info || typeof info !== 'object') {
    const status = upstream.ok ? 502 : upstream.status;
    return { ok: false, status: status === 404 ? 404 : 502, error: status === 404 ? 'Account not found.' : 'Could not get the statement. Try again later.' };
  }

  const lines = normalizeStatementLines(info.statementDetails);
  const definition = checked.definition;
  const metrics = computeMetrics(lines, asOf, parseAmount(info.OpeningBalance), [definition], statementMonths);
  const matched = linesMatchingDefinition(lines, asOf, definition, statementMonths);
  return {
    ok: true,
    field: definition.field,
    value: metrics.custom[definition.field] ?? null,
    months: metrics.derived.monthsConsidered,
    matchedCount: matched.length,
    sample: matched.slice(0, 25).map((l) => ({
      date: l.bookDate ?? null,
      direction: (l.credit ?? 0) > 0 ? 'IN' : 'OUT',
      amount: (l.credit ?? 0) > 0 ? l.credit! : (l.debit ?? 0),
      description: l.description ?? null,
      narrative: l.narrative ?? null,
    })),
  };
}
