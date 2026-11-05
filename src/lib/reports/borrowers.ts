import { differenceInDays, subDays } from 'date-fns';
import type { Prisma, PrismaClient } from '@prisma/client';
import { chunked } from './params';

/** Who a borrower is, as the reports show them. The borrower id is the phone number. */
export interface BorrowerIdentity {
  /** Registered name; empty when no source has one. */
  name: string;
  phone: string;
  /** Bank account; empty when no source has one. */
  account: string;
  /** Every bank account the borrower has held, best first (active, then latest). */
  accounts: string[];
}

const NAME_KEYS = [
  'fullname',
  'full name',
  'full_name',
  'customername',
  'customer name',
  'customer_name',
  'name',
];
const FIRST_NAME_KEYS = ['firstname', 'first name', 'first_name'];
const MIDDLE_NAME_KEYS = ['middlename', 'middle name', 'middle_name', 'fathername', 'father_name'];
const LAST_NAME_KEYS = ['lastname', 'last name', 'last_name', 'grandfathername', 'grandfather_name'];
const ACCOUNT_KEYS = [
  'accountnumber',
  'account number',
  'account_number',
  'accountno',
  'account_no',
  'customeraccount',
  'account',
];

/** Provisioned data as one flat record; a nested `detail` object (customer info) wins. */
export function flattenProvisioned(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const record = parsed as Record<string, unknown>;
    const detail = record.detail;
    return detail && typeof detail === 'object'
      ? { ...record, ...(detail as Record<string, unknown>) }
      : record;
  } catch {
    return {};
  }
}

/** The first non-empty text under any of the keys (compared case-insensitively), in key order. */
export function pickField(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    for (const [name, value] of Object.entries(record)) {
      if (name.toLowerCase() !== key) continue;
      if (typeof value !== 'string' && typeof value !== 'number') continue;
      const text = String(value).trim();
      if (text) return text;
    }
  }
  return '';
}

export function provisionedName(record: Record<string, unknown>): string {
  return (
    pickField(record, NAME_KEYS) ||
    [pickField(record, FIRST_NAME_KEYS), pickField(record, MIDDLE_NAME_KEYS), pickField(record, LAST_NAME_KEYS)]
      .filter(Boolean)
      .join(' ')
  );
}

export function provisionedAccount(record: Record<string, unknown>): string {
  return pickField(record, ACCOUNT_KEYS);
}

/**
 * Name, phone and bank accounts of each borrower, read in chunks: the phone
 * accounts first (the active one, then the latest), provisioned data for
 * whatever they leave out. Separate flat queries on purpose — a nested
 * `provisionedData` include with `orderBy` + `take: 1` can panic Prisma's
 * engine on SQL Server.
 */
export async function borrowerIdentities(
  prisma: PrismaClient,
  borrowerIds: Iterable<string | null | undefined>,
): Promise<Map<string, BorrowerIdentity>> {
  const ids = [...new Set(borrowerIds)].filter((id): id is string => !!id);
  const identities = new Map<string, BorrowerIdentity>(
    ids.map((id) => [id, { name: '', phone: id, account: '', accounts: [] }]),
  );

  for (const chunk of chunked(ids)) {
    const accounts = await prisma.phoneAccount.findMany({
      where: { phoneNumber: { in: chunk } },
      select: { phoneNumber: true, accountNumber: true, customerName: true },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    });
    for (const account of accounts) {
      const identity = identities.get(account.phoneNumber);
      if (!identity) continue;
      identity.account ||= account.accountNumber;
      identity.name ||= account.customerName?.trim() ?? '';
      if (account.accountNumber && !identity.accounts.includes(account.accountNumber)) {
        identity.accounts.push(account.accountNumber);
      }
    }
  }

  const incomplete = ids.filter((id) => {
    const identity = identities.get(id)!;
    return !identity.name || !identity.account;
  });
  for (const chunk of chunked(incomplete)) {
    const rows = await prisma.provisionedData.findMany({
      where: { borrowerId: { in: chunk } },
      select: { borrowerId: true, data: true },
      orderBy: { createdAt: 'desc' },
    });
    for (const row of rows) {
      const identity = identities.get(row.borrowerId);
      if (!identity || (identity.name && identity.account)) continue;
      const data = flattenProvisioned(row.data);
      identity.name ||= provisionedName(data);
      identity.account ||= provisionedAccount(data);
    }
  }
  return identities;
}

/** Phone numbers whose phone account matches the text: phone number, bank account or registered name. */
export async function phonesMatching(prisma: PrismaClient, search: string): Promise<string[]> {
  const accounts = await prisma.phoneAccount.findMany({
    where: {
      OR: [
        { accountNumber: { contains: search } },
        { phoneNumber: { contains: search } },
        { customerName: { contains: search } },
      ],
    },
    select: { phoneNumber: true },
    take: 500,
  });
  return [...new Set(accounts.map((a) => a.phoneNumber))];
}

/** Loans whose borrower phone, bank account, name or loan id contains the text. */
export async function loanSearchWhere(
  prisma: PrismaClient,
  search: string,
): Promise<Prisma.LoanWhereInput> {
  const phones = await phonesMatching(prisma, search);
  return {
    OR: [
      { borrowerId: { contains: search } },
      { id: { contains: search } },
      ...(phones.length ? [{ borrowerId: { in: phones } }] : []),
    ],
  };
}

export const LOAN_STATUS_FILTERS = ['current', 'overdue', 'defaulted', 'paid'] as const;
export type LoanStatusFilter = (typeof LOAN_STATUS_FILTERS)[number];

export function loanStatusFilter(value: string | null): LoanStatusFilter | null {
  return (LOAN_STATUS_FILTERS as readonly string[]).includes(value ?? '')
    ? (value as LoanStatusFilter)
    : null;
}

/** Days past due after which an unpaid loan reads Defaulted instead of Overdue. */
export const DEFAULTED_AFTER_DAYS = 60;

export type LoanReportStatus = 'Paid' | 'Overdue' | 'Defaulted' | 'Current';

/**
 * A loan's report status: Paid (flagged Paid, or nothing left to pay), Overdue
 * (1–60 full days past due), Defaulted (more than 60), otherwise Current; with
 * its days in arrears.
 */
export function loanReportStatus(
  loan: { repaymentStatus: string; dueDate: Date },
  now: Date,
  outstanding?: number,
): { status: LoanReportStatus; daysInArrears: number } {
  if (loan.repaymentStatus === 'Paid' || (outstanding !== undefined && outstanding <= 0.01)) {
    return { status: 'Paid', daysInArrears: 0 };
  }
  const days = differenceInDays(now, loan.dueDate);
  if (loan.repaymentStatus === 'Unpaid' && days > 0) {
    return { status: days > DEFAULTED_AFTER_DAYS ? 'Defaulted' : 'Overdue', daysInArrears: days };
  }
  return { status: 'Current', daysInArrears: 0 };
}

/**
 * The loans loanReportStatus puts under a status, as a Prisma filter. It reads
 * the status flag and due date only: an Unpaid loan with nothing left to pay
 * shows as Paid but is listed under its due-date status.
 */
export function loanStatusWhere(status: LoanStatusFilter, now: Date): Prisma.LoanWhereInput {
  const overdueFrom = subDays(now, 1);
  const defaultedFrom = subDays(now, DEFAULTED_AFTER_DAYS + 1);
  switch (status) {
    case 'paid':
      return { repaymentStatus: 'Paid' };
    case 'overdue':
      return { repaymentStatus: 'Unpaid', dueDate: { lte: overdueFrom, gt: defaultedFrom } };
    case 'defaulted':
      return { repaymentStatus: 'Unpaid', dueDate: { lte: defaultedFrom } };
    case 'current':
      return {
        NOT: [{ repaymentStatus: 'Paid' }, { repaymentStatus: 'Unpaid', dueDate: { lte: overdueFrom } }],
      };
  }
}
