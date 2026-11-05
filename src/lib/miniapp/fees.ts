/**
 * Plain-language descriptions of a product's fees for the customer mini-app. A fee is
 * described only when the loan calculator would charge it (its `...Enabled` flag is on
 * and its value is above zero), so the screens never list a fee that is not charged.
 */
import type { FeeRule, LoanProduct, PenaltyRule, Tax } from '@/lib/types';
import { formatMoney } from './format';

const positive = (value: number | '' | null | undefined): number | null => {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const describeRate = (rule: FeeRule | undefined): string | null => {
  const v = positive(rule?.value);
  if (v === null || !rule) return null;
  return rule.type === 'percentage' ? `${v}%` : `${formatMoney(v)} ETB`;
};

/** "2%" or "50.00 ETB", when the product charges a service fee. */
export function serviceFeeText(product: Pick<LoanProduct, 'serviceFee' | 'serviceFeeEnabled'>): string | null {
  return product.serviceFeeEnabled ? describeRate(product.serviceFee) : null;
}

/** "0.001% per day" or "5.00 ETB per day", when the product charges a daily fee. */
export function dailyFeeText(product: Pick<LoanProduct, 'dailyFee' | 'dailyFeeEnabled'>): string | null {
  const rate = product.dailyFeeEnabled ? describeRate(product.dailyFee) : null;
  return rate ? `${rate} per day` : null;
}

/** The product's late-payment rules, when it applies any. */
export function activePenaltyRules(
  product: Pick<LoanProduct, 'penaltyRules' | 'penaltyRulesEnabled'>,
): PenaltyRule[] {
  if (!product.penaltyRulesEnabled || !Array.isArray(product.penaltyRules)) return [];
  return product.penaltyRules.filter((rule) => positive(rule.value) !== null);
}

/** "1.00 ETB per day, from day 1 to day 30 after the due date". */
export function describePenalty(rule: PenaltyRule): string {
  const v = Number(rule.value) || 0;
  const what =
    rule.type === 'fixed'
      ? `${formatMoney(v)} ETB`
      : rule.type === 'percentageOfPrincipal'
        ? `${v}% of the loan amount`
        : `${v}% of the amount owed`;
  const how = rule.frequency === 'one-time' ? 'once' : 'per day';
  const from = rule.fromDay === '' || rule.fromDay === null || rule.fromDay === undefined ? 1 : Number(rule.fromDay);
  const to = Number(rule.toDay);
  const when =
    rule.toDay === '' || rule.toDay === null || rule.toDay === undefined || !Number.isFinite(to)
      ? `from day ${from} after the due date`
      : `from day ${from} to day ${to} after the due date`;
  return `${what} ${how}, ${when}`;
}

const taxLabels: Record<string, string> = {
  serviceFee: 'service fee',
  interest: 'daily fee',
  penalty: 'penalty',
};

/** "15% on the service fee and daily fee" for each tax charged on top of fees. */
export function feeTaxTexts(taxConfigs: Tax[] | null | undefined): string[] {
  const out: string[] = [];
  for (const tax of taxConfigs ?? []) {
    if (!(tax.rate > 0)) continue;
    let appliedTo: string[] = [];
    try {
      appliedTo = JSON.parse(tax.appliedTo || '[]');
    } catch {
      appliedTo = [];
    }
    const parts = appliedTo.map((key) => taxLabels[key]).filter(Boolean);
    if (parts.length === 0) continue;
    const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
    out.push(`${tax.rate}% on the ${list}`);
  }
  return out;
}
