// Turns account statement lines into the figures used by credit scoring.
//
// Lines are classified by their description (the bank's transaction type, e.g. "Telebirr Debit")
// and narrative (free text), never by their reference: that is a random transaction code, and short
// words match it by chance ("tv" in FT25336TVXSP). The patterns come from the descriptions the bank
// middleware actually returned (January 2026, 127k lines).

export type StatementLine = {
  bookDate?: string | null;
  valueDate?: string | null;
  reference?: string | null;
  description?: string | null;
  narrative?: string | null;
  debit?: number | null;
  credit?: number | null;
  closingBalance?: number | null;
};

/** Default number of complete calendar months the figures cover; the Scoring Engine can change it. */
export const FIGURE_MONTHS = 6;

/** Mobile-wallet activity: Telebirr and e-birr (run by Kaafi). "ebirr" is also inside "telebirr". */
const WALLET = /e-?birr|tele[\s-]?birr|kaafi/i;
/** Airtime purchases (money out only): "Ethio telecom Airtime Dr", transfers noted "topup". */
const AIRTIME = /airtime|\btop ?up\b/i;
/** Bill payments (money out only): "ET telecom bill debit", "Derash Water Bill", narratives such as "bills". */
const BILL_DESCRIPTION = /bill debit|water bill|derash|electric|dstv|gotv/i;
const BILL_NARRATIVE = /\bbills?\b|telebill|electricity|water bill|\bdstv\b|\bgotv\b|school fee|tuition/i;

// Money in that is not income.
const LOAN_DISBURSEMENT = /loan disbursement|loan txn|nibtera lending/i;
const INTEREST = /credit profit/i;
// A credit carrying a money-out transaction type is that payment coming back ("ATM Cash
// Withdrawal", "Tax Amount Due" ...); refunds say so in the narrative ("IPS PAYABLE REFUND").
const REVERSAL_DESCRIPTION = /refund|withdrawal|outward|repayment|tax amount due|commission paid|close loop|closure debit/i;
const REFUND_NARRATIVE = /refund|revers/i;

type Exclusion = 'loanDisbursements' | 'interest' | 'reversals';

/**
 * A statement figure defined in the Scoring Engine (the StatementParameter table): lines of the
 * given direction whose description or narrative contains any match word and no exclude word.
 */
export type StatementParameterDefinition = {
  field: string;
  name: string;
  direction: 'IN' | 'OUT' | 'BOTH';
  /** Comma-separated words or phrases, matched case-insensitively anywhere in the text. */
  matchWords: string;
  excludeWords?: string | null;
  measure: 'COUNT_PER_MONTH' | 'AMOUNT_PER_MONTH' | 'MONTHS_WITH_ANY' | 'SHARE_OF_INCOME';
  minAmount?: number | null;
};

/** The field name scoring uses for a parameter name; the same conversion eligibility applies to rule fields. */
export function fieldFromName(name: string): string {
  return String(name ?? '')
    .replace(/[^a-zA-Z0-9]+(.)?/g, (_m, chr) => (chr ? chr.toUpperCase() : ''))
    .replace(/^./, (m) => m.toLowerCase());
}

/** Comma-separated words as a clean, lower-case list. */
export function parseWords(words: string | null | undefined): string[] {
  return Array.from(
    new Set(
      String(words ?? '')
        .split(',')
        .map((w) => w.trim().toLowerCase().replace(/\s+/g, ' '))
        .filter(Boolean)
    )
  );
}

type PreparedDefinition = StatementParameterDefinition & { match: string[]; exclude: string[] };

function prepare(definitions: StatementParameterDefinition[]): PreparedDefinition[] {
  return definitions.map((d) => ({ ...d, match: parseWords(d.matchWords), exclude: parseWords(d.excludeWords) }));
}

/** The line's amount when it counts for the definition, else null. */
function matchedAmount(def: PreparedDefinition, line: StatementLine): number | null {
  const credit = line.credit ?? 0;
  const debit = line.debit ?? 0;
  const amount = def.direction === 'IN' ? credit : def.direction === 'OUT' ? debit : credit || debit;
  if (!(amount > 0) || (def.minAmount != null && amount < def.minAmount)) return null;
  const text = `${line.description ?? ''} ${line.narrative ?? ''}`.toLowerCase().replace(/\s+/g, ' ');
  if (!def.match.some((w) => text.includes(w))) return null;
  if (def.exclude.some((w) => text.includes(w))) return null;
  return amount;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** An amount such as 1200.5, "1,200.50" or "-300"; null when missing or not a number. Zero stays 0. */
export function parseAmount(v: any): number | null {
  if (v == null) return null;
  const s = String(v).replace(/[^0-9.-]+/g, '');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Map upstream statement rows to StatementLine. Accepts both spellings in use: the bank
 * middleware has sent Description/ValueDate, while the Nibtera Data API and the Postman
 * spec send Description2/ValueDate2. A single row sent as an object (not an array) is accepted too.
 */
export function normalizeStatementLines(rows: any[] | Record<string, any> | null | undefined): StatementLine[] {
  const list = Array.isArray(rows) ? rows : rows && typeof rows === 'object' ? [rows] : [];
  return list.map((row: any) => ({
    bookDate: row.BookDate ?? row.bookDate ?? null,
    valueDate: row.ValueDate ?? row.ValueDate2 ?? row.valueDate ?? null,
    reference: row.Reference ?? row.reference ?? null,
    description: row.Description ?? row.Description2 ?? row.description ?? null,
    narrative: row.Narrative != null ? String(row.Narrative) : (row.narrative != null ? String(row.narrative) : null),
    debit: parseAmount(row.Debit),
    credit: parseAmount(row.Credit),
    closingBalance: parseAmount(row.ClosingBalance),
  }));
}

/** A statement date ('30 APR 25', '20250430' or ISO) as a UTC day number, or null. */
export function statementDay(value: string | null | undefined): number | null {
  if (!value) return null;
  const s = String(value).trim();
  const ymd = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  const dmy = s.match(/^(\d{1,2})[\s-]+([A-Za-z]{3})[A-Za-z]*[\s-]+(\d{2}|\d{4})$/);
  let parts: [number, number, number] | null = null;
  if (ymd) {
    parts = [Number(ymd[1]), Number(ymd[2]), Number(ymd[3])];
  } else if (dmy) {
    const month = MONTH_NAMES.indexOf(dmy[2].toUpperCase()) + 1;
    const year = Number(dmy[3]);
    if (month > 0) parts = [year < 100 ? 2000 + year : year, month, Number(dmy[1])];
  } else {
    const d = new Date(s);
    if (!isNaN(d.getTime())) parts = [d.getFullYear(), d.getMonth() + 1, d.getDate()];
  }
  return parts ? Math.floor(Date.UTC(parts[0], parts[1] - 1, parts[2]) / DAY_MS) : null;
}

function monthKey(day: number) {
  const d = new Date(day * DAY_MS);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** The `count` complete calendar months before the month of `periodEnd` (YYYYMMDD; today if invalid), oldest first. */
function monthsBefore(periodEnd: string, count: number) {
  const now = new Date();
  const valid = /^\d{8}$/.test(periodEnd);
  const year = valid ? Number(periodEnd.slice(0, 4)) : now.getFullYear();
  const month = valid ? Number(periodEnd.slice(4, 6)) : now.getMonth() + 1;
  return Array.from({ length: count }, (_, i) => {
    const back = count - i;
    const firstDay = Date.UTC(year, month - 1 - back, 1) / DAY_MS;
    const lastDay = Date.UTC(year, month - back, 0) / DAY_MS;
    return { key: monthKey(firstDay), firstDay, lastDay };
  });
}

function creditExclusion(description: string, narrative: string): Exclusion | null {
  if (LOAN_DISBURSEMENT.test(description)) return 'loanDisbursements';
  if (INTEREST.test(description)) return 'interest';
  if (REVERSAL_DESCRIPTION.test(description) || REFUND_NARRATIVE.test(narrative)) return 'reversals';
  return null;
}

/** Who the money came from, as far as the statement says: the narrative, else the transaction type. */
function depositSource(line: StatementLine) {
  return String(line.narrative || line.description || 'unknown').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 200);
}

function mean(values: number[]) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

/** Mean without the highest and lowest value (when there are at least 4), so one unusual month does not dominate. */
function middleMean(values: number[]) {
  if (values.length < 4) return mean(values);
  return mean(values.slice().sort((a, b) => a - b).slice(1, -1));
}

/**
 * Average end-of-day balance over every day from firstDay to lastDay. The balance entering the
 * window is the last balance before it, else `openingBalance` (the balance before the statement's
 * first line), else worked back from the first line.
 */
function dailyAverageBalance(
  dated: { line: StatementLine; day: number }[],
  firstDay: number,
  lastDay: number,
  openingBalance: number | null
): number | null {
  let balance: number | null = null;
  let i = 0;
  for (; i < dated.length && dated[i].day < firstDay; i++) {
    if (dated[i].line.closingBalance != null) balance = dated[i].line.closingBalance!;
  }
  if (balance == null) balance = openingBalance;
  if (balance == null) {
    const first = dated.slice(i).find((x) => x.line.closingBalance != null);
    if (first) balance = first.line.closingBalance! - (first.line.credit ?? 0) + (first.line.debit ?? 0);
  }
  if (balance == null) return null;

  let sum = 0;
  for (let day = firstDay; day <= lastDay; day++) {
    for (; i < dated.length && dated[i].day <= day; i++) {
      if (dated[i].line.closingBalance != null) balance = dated[i].line.closingBalance!;
    }
    sum += balance;
  }
  return sum / (lastDay - firstDay + 1);
}

/** Lines with a readable booking date, oldest first (same-day lines keep statement order). */
function datedLines(lines: StatementLine[]) {
  return lines
    .map((line) => ({ line, day: statementDay(line.bookDate ?? line.valueDate) }))
    .filter((x): x is { line: StatementLine; day: number } => x.day != null)
    .sort((a, b) => a.day - b.day);
}

/**
 * The lines inside the figures' months that count for `definition`, newest first (for previews).
 */
export function linesMatchingDefinition(
  lines: StatementLine[],
  periodEnd: string,
  definition: StatementParameterDefinition,
  monthCount: number = FIGURE_MONTHS
) {
  const months = monthsBefore(periodEnd, monthCount);
  const firstDay = months[0].firstDay;
  const lastDay = months[months.length - 1].lastDay;
  const [def] = prepare([definition]);
  return datedLines(lines)
    .filter(({ line, day }) => day >= firstDay && day <= lastDay && matchedAmount(def, line) != null)
    .map(({ line }) => line)
    .reverse();
}

/**
 * Scoring figures for the `monthCount` complete calendar months before `periodEnd` (YYYYMMDD).
 * The month the statement was fetched in is left out because it is not finished; months without
 * transactions count as zero. Lines are placed by booking date, which the statement period and
 * running balances follow.
 *
 * @param openingBalance the balance before the statement's first line, if known
 * @param definitions statement parameters defined in the Scoring Engine; their values are in `custom`
 * @param monthCount how many complete months to cover (Scoring Engine setting)
 */
export function computeMetrics(
  lines: StatementLine[],
  periodEnd: string,
  openingBalance: number | null = null,
  definitions: StatementParameterDefinition[] = [],
  monthCount: number = FIGURE_MONTHS
) {
  const months = monthsBefore(periodEnd, monthCount);
  const firstDay = months[0].firstDay;
  const lastDay = months[months.length - 1].lastDay;
  const buckets = new Map(
    months.map((m) => [m.key, { deposits: 0, sources: new Set<string>(), airtimeCount: 0, airtimeValue: 0, wallet: false }])
  );
  const defs = prepare(definitions);
  const customTotals = defs.map(() => ({ count: 0, amount: 0, months: new Set<string>() }));

  const dated = datedLines(lines);

  let txCountRelevant = 0;
  let billPaymentsCount = 0;
  let moneyIn = 0;
  let moneyOut = 0;
  const excluded: Record<Exclusion, number> = { loanDisbursements: 0, interest: 0, reversals: 0 };

  for (const { line, day } of dated) {
    if (day < firstDay || day > lastDay) continue;
    const bucket = buckets.get(monthKey(day))!;
    const description = line.description ?? '';
    const narrative = line.narrative ?? '';
    const credit = line.credit ?? 0;
    const debit = line.debit ?? 0;

    if (WALLET.test(`${description} ${narrative}`)) bucket.wallet = true;

    // Defined parameters see every line as-is: no loan/interest/reversal exclusions.
    defs.forEach((def, i) => {
      const amount = matchedAmount(def, line);
      if (amount == null) return;
      customTotals[i].count++;
      customTotals[i].amount += amount;
      customTotals[i].months.add(monthKey(day));
    });

    if (credit > 0) {
      const notIncome = creditExclusion(description, narrative);
      if (notIncome) {
        excluded[notIncome] += credit;
        continue;
      }
      bucket.deposits += credit;
      moneyIn += credit;
      if (credit >= 50) txCountRelevant++;
      bucket.sources.add(depositSource(line));
    }

    if (debit > 0) {
      moneyOut += debit;
      if (AIRTIME.test(`${description} ${narrative}`)) {
        bucket.airtimeCount++;
        bucket.airtimeValue += debit;
      }
      if (BILL_DESCRIPTION.test(description) || BILL_NARRATIVE.test(narrative)) billPaymentsCount++;
    }
  }

  const perMonth = months.map((m) => buckets.get(m.key)!);
  const monthlyDepositTotals = perMonth.map((b) => b.deposits);
  // Reversals and refunds give back money that went out: they reduce money out instead of counting as income.
  const netMoneyOut = Math.max(0, moneyOut - excluded.reversals);

  const custom: Record<string, number | null> = {};
  defs.forEach((def, i) => {
    const t = customTotals[i];
    custom[def.field] =
      def.measure === 'COUNT_PER_MONTH' ? t.count / months.length
      : def.measure === 'AMOUNT_PER_MONTH' ? t.amount / months.length
      : def.measure === 'MONTHS_WITH_ANY' ? t.months.size
      : moneyIn > 0 ? (t.amount / moneyIn) * 100 // SHARE_OF_INCOME, in percent of the income above
      : null;
  });

  return {
    /** Months (of FIGURE_MONTHS) with any Telebirr or e-birr transaction. */
    monthsAtEbirr: perMonth.filter((b) => b.wallet).length,
    /** Income credits of 50 or more, in total over the months (not per month). */
    txCountRelevant,
    /** Bill payments (money out), in total over the months. */
    billPaymentsCount,
    /** Monthly income without the best and worst month. Loans, interest and reversals are not income. */
    avgMonthlyDeposit: middleMean(monthlyDepositTotals),
    /** Different payers per month (by narrative). */
    avgUniqueDepositSources: mean(perMonth.map((b) => b.sources.size)),
    avgMonthlyAirtimeCount: mean(perMonth.map((b) => b.airtimeCount)),
    avgMonthlyAirtimeValue: mean(perMonth.map((b) => b.airtimeValue)),
    /** All money out (less reversals) divided by income. */
    withdrawalToDepositRatio: moneyIn > 0 ? netMoneyOut / moneyIn : null,
    /** Average end-of-day balance. */
    avgBalance: dailyAverageBalance(dated, firstDay, lastDay, openingBalance),
    /** Values of the defined statement parameters, by field. */
    custom,
    derived: {
      monthsConsidered: months.map((m) => m.key),
      monthlyDepositTotals,
      monthlyAirtimeCounts: perMonth.map((b) => b.airtimeCount),
      monthlyAirtimeValues: perMonth.map((b) => b.airtimeValue),
      excludedFromDeposits: excluded,
    },
  };
}
