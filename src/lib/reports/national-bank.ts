import { differenceInDays, format } from 'date-fns';
import type { Prisma, PrismaClient } from '@prisma/client';
import { calculateTotalRepayable } from '../loan-calculator';
import { loanSearchWhere } from './borrowers';
import {
  chunked,
  compareBy,
  periodFilter,
  reportPage,
  skipOf,
  type Paging,
  type ReportPage,
  type ReportPeriod,
  type ReportSort,
} from './params';
import { asCalculatorLoan, asCalculatorProduct, PRODUCT_TERMS } from './product';
import { pageWithinScope } from './scope';

export const NATIONAL_BANK_SORT_COLUMNS = [
  'disbursementDate',
  'loanAccountRefNo',
  'applicationAmount',
  'approvedAmount',
] as const;
export type NationalBankSortColumn = (typeof NATIONAL_BANK_SORT_COLUMNS)[number];
export const DEFAULT_NATIONAL_BANK_SORT: ReportSort<NationalBankSortColumn> = {
  by: 'disbursementDate',
  dir: 'desc',
};

function nationalBankOrder(sort: ReportSort<NationalBankSortColumn>): Prisma.LoanOrderByWithRelationInput[] {
  switch (sort.by) {
    case 'loanAccountRefNo':
      return [{ id: sort.dir }];
    case 'applicationAmount':
      return [{ loanApplication: { loanAmount: sort.dir } }, { id: 'desc' }];
    case 'approvedAmount':
      return [{ loanAmount: sort.dir }, { id: 'desc' }];
    default:
      return [{ disbursedDate: sort.dir }, { id: 'desc' }];
  }
}

interface FacilityKey {
  id: string;
  disbursedDate: Date;
  loanAmount: number;
  loanApplication: { loanAmount: number | null } | null;
}

function compareFacilityKeys(sort: ReportSort<NationalBankSortColumn>) {
  const primary = compareBy<FacilityKey>((k) => {
    switch (sort.by) {
      case 'loanAccountRefNo':
        return k.id;
      case 'applicationAmount':
        return k.loanApplication?.loanAmount;
      case 'approvedAmount':
        return k.loanAmount;
      default:
        return k.disbursedDate.getTime();
    }
  }, sort.dir);
  const tiebreak = compareBy<FacilityKey>((k) => k.id, 'desc');
  return (a: FacilityKey, b: FacilityKey) => primary(a, b) || (sort.by === 'loanAccountRefNo' ? 0 : tiebreak(a, b));
}

export interface NationalBankFilter {
  /** null = every provider. */
  providerId: string | null;
  /** Disbursement date. */
  period: ReportPeriod;
  /** Borrower phone, bank account, name or loan id. */
  search?: string;
  /** Borrowers in the user's branch scope; null = no restriction. */
  scope: string[] | null;
}

/** A field of a flattened provisioned-data record under any of its aliases (case-insensitive). */
function extractField(data: Record<string, unknown>, ...aliases: string[]): string {
  const lowerAliases = aliases.map((a) => a.toLowerCase());
  for (const key of Object.keys(data)) {
    if (lowerAliases.includes(key.toLowerCase())) {
      const value = data[key];
      if (value != null && value !== '') return String(value);
    }
  }
  return '';
}

/**
 * All of a borrower's provisioned data as one flat record. Entries may carry a
 * nested `detail` object (customer info) or flat pairs (data uploads); `detail`
 * fields win.
 */
function flattenProvisionedData(entries: { data: string }[]): Record<string, unknown> {
  let result: Record<string, unknown> = {};
  for (const entry of entries) {
    try {
      const parsed = JSON.parse(entry.data);
      result =
        parsed.detail && typeof parsed.detail === 'object'
          ? { ...result, ...parsed, ...parsed.detail }
          : { ...result, ...parsed };
    } catch {
      // Unparseable entries are skipped.
    }
  }
  return result;
}

/** "GEMECHU URGE SEGNI" → [first, middle, last]; two parts leave the middle empty. */
export function splitFullName(fullName: string): [string, string, string] {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length >= 3) return [parts[0], parts[1], parts.slice(2).join(' ')];
  if (parts.length === 2) return [parts[0], '', parts[1]];
  return [parts[0] || '', '', ''];
}

export type FacilityType = 'personal' | 'workingCapital' | 'bnpl' | 'revolving' | 'msme' | 'other';

/** The single NBE facility type (columns 16–21) a product is reported under. */
export function facilityType(productName: string, isSalaryAdvance: boolean): FacilityType {
  const name = productName.toLowerCase();
  if (name.includes('bnpl') || name.includes('buy now pay later')) return 'bnpl';
  if (!isSalaryAdvance && (name.includes('personal') || name.includes('consumer'))) return 'personal';
  if (name.includes('working') || name.includes('capital')) return 'workingCapital';
  if (name.includes('revolving') || name.includes('credit limit')) return 'revolving';
  if (name.includes('msme') || name.includes('micro')) return 'msme';
  return 'other';
}

/** The product's fee rule as the return shows it: "2%" or a flat value. */
function feeRuleLabel(rule: string | null | undefined): string {
  try {
    const parsed = JSON.parse(rule || '{}');
    if (parsed.value == null || parsed.value === '') return '';
    return parsed.type === 'percentage' ? `${parsed.value}%` : String(parsed.value);
  } catch {
    return '';
  }
}

const FACILITY_INCLUDE = {
  product: { select: PRODUCT_TERMS },
  payments: { select: { amount: true, date: true } },
  installments: { orderBy: { installmentNumber: 'asc' } },
  loanApplication: true,
  borrower: { include: { provisionedData: { orderBy: { createdAt: 'desc' } } } },
} satisfies Prisma.LoanInclude;

/**
 * Which facility each loan is in its borrower's history (1 = first), counting
 * every live loan of the borrowers, not just the ones on the page.
 */
async function loanCycles(prisma: PrismaClient, borrowerIds: string[]): Promise<Map<string, number>> {
  const cycles = new Map<string, number>();
  for (const chunk of chunked([...new Set(borrowerIds)])) {
    const history = await prisma.loan.findMany({
      where: { borrowerId: { in: chunk }, repaymentStatus: { not: 'REVERSED' } },
      select: { id: true, borrowerId: true },
      orderBy: [{ disbursedDate: 'asc' }, { id: 'asc' }],
    });
    const counter = new Map<string, number>();
    for (const loan of history) {
      const next = (counter.get(loan.borrowerId) ?? 0) + 1;
      counter.set(loan.borrowerId, next);
      cycles.set(loan.id, next);
    }
  }
  return cycles;
}

/** The National Bank of Ethiopia return: one row per facility, in the regulator's template. */
export async function nationalBankReport(
  prisma: PrismaClient,
  filter: NationalBankFilter,
  paging: Paging,
  sort: ReportSort<NationalBankSortColumn> = DEFAULT_NATIONAL_BANK_SORT,
) {
  // Reversed facilities are internal corrections and are not reported to the regulator.
  const conditions: Prisma.LoanWhereInput[] = [{ repaymentStatus: { not: 'REVERSED' } }];
  const disbursed = periodFilter(filter.period);
  if (disbursed) conditions.push({ disbursedDate: disbursed });
  if (filter.providerId) conditions.push({ product: { providerId: filter.providerId } });
  if (filter.search) conditions.push(await loanSearchWhere(prisma, filter.search));
  const where = (borrowerIds: string[] | null): Prisma.LoanWhereInput => ({
    AND: borrowerIds ? [...conditions, { borrowerId: { in: borrowerIds } }] : conditions,
  });

  const [{ total, rows: loans }, taxConfigs] = await Promise.all([
    pageWithinScope({
      scope: filter.scope,
      paging,
      direct: async (borrowerIds) => {
        const [count, rows] = await Promise.all([
          prisma.loan.count({ where: where(borrowerIds) }),
          prisma.loan.findMany({
            where: where(borrowerIds),
            include: FACILITY_INCLUDE,
            orderBy: nationalBankOrder(sort),
            skip: skipOf(paging),
            take: paging.pageSize,
          }),
        ]);
        return { total: count, rows };
      },
      keysIn: (borrowerIds) =>
        prisma.loan.findMany({
          where: where(borrowerIds),
          select: { id: true, disbursedDate: true, loanAmount: true, loanApplication: { select: { loanAmount: true } } },
        }),
      compare: compareFacilityKeys(sort),
      rowsById: (ids) => prisma.loan.findMany({ where: { id: { in: ids } }, include: FACILITY_INCLUDE }),
      idOf: (loan) => loan.id,
    }),
    prisma.tax.findMany(),
  ]);

  const borrowerIds = loans.map((loan) => loan.borrowerId);
  // PhoneAccount is the authoritative source of the registered name: the
  // active account, then the most recently created one.
  const phoneNameByBorrower = new Map<string, string>();
  const [cycles] = await Promise.all([
    loanCycles(prisma, borrowerIds),
    (async () => {
      for (const chunk of chunked([...new Set(borrowerIds)])) {
        const accounts = await prisma.phoneAccount.findMany({
          where: { phoneNumber: { in: chunk } },
          select: { phoneNumber: true, customerName: true },
          orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
        });
        for (const account of accounts) {
          const name = account.customerName?.trim();
          if (name && !phoneNameByBorrower.has(account.phoneNumber)) phoneNameByBorrower.set(account.phoneNumber, name);
        }
      }
    })(),
  ]);

  const today = new Date();
  const rows = loans.map((loan) => {
    const borrowerData = flattenProvisionedData(loan.borrower?.provisionedData || []);

    let firstName = extractField(borrowerData, 'firstName', 'first_name', 'first name');
    let middleName = extractField(borrowerData, 'middleName', 'middle_name', 'middle name', 'fatherName', 'father_name');
    let lastName = extractField(borrowerData, 'lastName', 'last_name', 'last name', 'grandFatherName', 'grandfather_name');
    const phoneAccountName = phoneNameByBorrower.get(loan.borrowerId) || '';
    if (phoneAccountName) {
      [firstName, middleName, lastName] = splitFullName(phoneAccountName);
    } else if (!firstName) {
      const fullName = extractField(borrowerData, 'CustomerName', 'customername', 'fullName', 'full_name', 'full name', 'name');
      if (fullName) [firstName, middleName, lastName] = splitFullName(fullName);
    }

    // Each facility is reported under exactly one type.
    const type = facilityType(loan.product?.name || '', loan.product?.isSalaryAdvance || false);
    const amountIf = (t: FacilityType) => (type === t ? loan.loanAmount : 0);

    let repaymentFrequency = 'One-time';
    const intervalDays = loan.product?.repaymentIntervalDays;
    const installmentCount = loan.product?.installments;
    if (installmentCount && installmentCount > 1 && intervalDays) {
      if (intervalDays <= 7) repaymentFrequency = 'Weekly';
      else if (intervalDays <= 15) repaymentFrequency = 'Bi-weekly';
      else if (intervalDays <= 31) repaymentFrequency = 'Monthly';
      else if (intervalDays <= 92) repaymentFrequency = 'Quarterly';
      else repaymentFrequency = `Every ${intervalDays} days`;
    }

    const { total } = calculateTotalRepayable(asCalculatorLoan(loan), asCalculatorProduct(loan.product), taxConfigs, today, true);
    const outstandingBalance = Math.max(0, total - (loan.repaidAmount || 0));

    // The last repayment of a fully settled facility.
    const settlementDate =
      loan.repaymentStatus === 'Paid' && loan.payments.length > 0
        ? format(new Date(Math.max(...loan.payments.map((p) => new Date(p.date).getTime()))), 'yyyy-MM-dd')
        : '';

    // NBE asset classification by days past due.
    const daysOverdue = differenceInDays(today, loan.dueDate);
    let loanClassification = 'Pass';
    if (loan.repaymentStatus === 'Paid' || outstandingBalance <= 0.01) loanClassification = 'Closed';
    else if (daysOverdue > 360) loanClassification = 'Loss';
    else if (daysOverdue > 180) loanClassification = 'Doubtful';
    else if (daysOverdue > 90) loanClassification = 'Substandard';
    else if (daysOverdue > 30) loanClassification = 'Special Mention';

    return {
      firstName,
      middleName,
      lastName,
      gender: extractField(borrowerData, 'gender', 'sex'),
      personalIncomeLevel: extractField(
        borrowerData,
        'NetMonthlyIncome',
        'income',
        'incomeLevel',
        'income_level',
        'personalIncome',
        'personal_income',
        'salary',
        'monthlyIncome',
      ),
      nationalId: extractField(borrowerData, 'NationalId', 'national_id', 'faydaNo', 'fayda_no', 'faydaNumber', 'nationalIdNo'),
      tin: extractField(borrowerData, 'TINNo', 'tin', 'taxId', 'tax_id'),
      otherIdNo: extractField(borrowerData, 'otherIdNo', 'other_id', 'otherId', 'idNo', 'id_no', 'AccountNumber'),
      region: extractField(borrowerData, 'ResidenceRegion', 'region'),
      zone: extractField(borrowerData, 'zone', 'Street'),
      subCity: extractField(borrowerData, 'SubCity', 'sub_city', 'City'),
      woreda: extractField(borrowerData, 'Woreda', 'worda'),
      kebele: extractField(borrowerData, 'kebele'),
      houseNo: extractField(borrowerData, 'houseNo', 'house_no', 'houseNumber'),
      // The borrower id is the phone number.
      phoneNo: loan.borrowerId,
      personalLoan: amountIf('personal'),
      workingCapitalLoan: amountIf('workingCapital'),
      buyNowPayLater: amountIf('bnpl'),
      revolvingCredit: amountIf('revolving'),
      msmeLoans: amountIf('msme'),
      otherLoanType: amountIf('other'),
      applicationAmount: loan.loanApplication?.loanAmount ?? loan.loanAmount,
      purposeOfLoan: extractField(borrowerData, 'purpose', 'loanPurpose', 'loan_purpose') || loan.product?.name || '',
      loanAccountRefNo: loan.id,
      approvedAmount: loan.loanAmount,
      disbursementDate: loan.disbursedDate ? format(new Date(loan.disbursedDate), 'yyyy-MM-dd') : '',
      repaymentFrequency,
      durationDays: loan.product?.duration || 0,
      outstandingBalance,
      settlementDate,
      loanClassification,
      loanCycle: cycles.get(loan.id) ?? '',
      // The product's daily fee rule.
      interestRate: feeRuleLabel(loan.product?.dailyFee),
      // The product's service fee rule.
      serviceCharge: feeRuleLabel(loan.product?.serviceFee),
      creditScore: extractField(borrowerData, 'creditScore', 'credit_score', 'score'),
    };
  });

  return reportPage(rows, total, paging);
}

export type NationalBankRow = Awaited<ReturnType<typeof nationalBankReport>>['data'][number];
export type NationalBankPage = ReportPage<NationalBankRow>;
