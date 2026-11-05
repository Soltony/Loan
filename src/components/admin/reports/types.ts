/** Rows and pages of the report routes (src/lib/reports). Dates arrive as ISO strings. */

export interface ReportPage<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export type SortDir = 'asc' | 'desc';

export interface TableSort {
  by: string;
  dir: SortDir;
}

export type LoanStatus = 'current' | 'overdue' | 'defaulted' | 'paid';

export interface LoanReportRow {
  provider: string;
  loanId: string;
  borrowerId: string;
  /** Empty when no source has the borrower's name. */
  borrowerName: string;
  borrowerPhone: string;
  borrowerAccount: string;
  disbursedDate: string;
  dueDate: string;
  principalDisbursed: number;
  principalOutstanding: number;
  interestOutstanding: number;
  serviceFeeOutstanding: number;
  penaltyOutstanding: number;
  totalOutstanding: number;
  status: 'Current' | 'Overdue' | 'Defaulted' | 'Paid';
  daysInArrears: number;
}

export interface TransactionReportRow {
  provider: string | null;
  loanId: string | null;
  customerName: string | null;
  borrowerPhone: string | null;
  transactionDate: string;
  dueDate: string | null;
  debitAccount: string;
  creditAccount: string;
  transactionStatus: string;
  reference: string;
  productType: string | null;
  borrowerId: string | null;
  borrowerAccount: string | null;
  principalDisbursed: number;
  netDisbursed: number;
  interestOutstanding: number;
  serviceFeeOutstanding: number;
  principalPaid: number;
  interestPaid: number;
  serviceFeePaid: number;
  penaltyPaid: number;
  unappliedPaid: number;
  totalPaid: number;
  status: string | null;
  cbsReference: string | null;
  cbsCreditAmount: number | null;
  disbursementStatusText: string | null;
  disbursementOutcome: string | null;
}

export interface CollectionAmounts {
  principal: number;
  interest: number;
  serviceFee: number;
  penalty: number;
  tax: number;
  unapplied: number;
  total: number;
}

export interface CollectionRow extends CollectionAmounts {
  provider: string;
  /** yyyy-MM-dd, on the user's calendar. */
  date: string;
  outstandingPrincipal: number;
  outstandingLoans: number;
}

export interface CollectionsPage extends ReportPage<CollectionRow> {
  /** Every day matching the filters, not just this page. */
  totals: CollectionAmounts;
}

export const AGING_CLASSES = [
  { key: 'Pass', label: 'Pass', days: '0-29 days' },
  { key: 'Special Mention', label: 'Special Mention', days: '30-89 days' },
  { key: 'Substandard', label: 'Substandard', days: '90-179 days' },
  { key: 'Doubtful', label: 'Doubtful', days: '180-359 days' },
  { key: 'Loss', label: 'Loss', days: '360+ days' },
] as const;

export type AgingClass = (typeof AGING_CLASSES)[number]['key'];

/** Classes past 90 days: non-performing. */
export const NPL_CLASSES: AgingClass[] = ['Substandard', 'Doubtful', 'Loss'];

export interface ProviderSummary {
  providerId: string;
  portfolioSummary: {
    disbursed: number;
    disbursedCount: number;
    repaid: number;
    outstanding: number;
    openCount: number;
  };
  collectionsReport: { principal: number; interest: number; servicefee: number; penalty: number; total: number };
  fundUtilization: number;
  agingReport: {
    /** Overdue loans per class. */
    buckets: Record<AgingClass, number>;
    /** Overdue amount per class. */
    bucketAmounts: Record<AgingClass, number>;
    totalOverdue: number;
    totalOverdueAmount: number;
    borrowerCount: number;
  };
}

export interface BorrowerAgingRow {
  providerId: string;
  provider: string;
  borrowerId: string;
  borrowerName: string;
  borrowerPhone: string;
  borrowerAccount: string;
  loanCount: number;
  daysOverdue: number;
  classification: AgingClass | 'Unknown';
  principalOutstanding: number;
  interestOutstanding: number;
  serviceFeeOutstanding: number;
  penaltyOutstanding: number;
  totalOutstanding: number;
}

/** One facility of the National Bank return; field names follow the regulator's template. */
export interface NationalBankRow {
  firstName: string;
  middleName: string;
  lastName: string;
  gender: string;
  personalIncomeLevel: string;
  nationalId: string;
  tin: string;
  otherIdNo: string;
  region: string;
  zone: string;
  subCity: string;
  woreda: string;
  kebele: string;
  houseNo: string;
  phoneNo: string;
  personalLoan: number;
  workingCapitalLoan: number;
  buyNowPayLater: number;
  revolvingCredit: number;
  msmeLoans: number;
  otherLoanType: number;
  applicationAmount: number;
  purposeOfLoan: string;
  loanAccountRefNo: string;
  approvedAmount: number;
  disbursementDate: string;
  repaymentFrequency: string;
  durationDays: number;
  outstandingBalance: number;
  settlementDate: string;
  loanClassification: string;
  loanCycle: number | string;
  interestRate: string;
  serviceCharge: string;
  creditScore: string;
}

/** The Overall tab's figures (`/api/reports/overview`). */
export interface OverviewKpis {
  disbursedAmount: number;
  loansDisbursed: number;
  uniqueBorrowers: number;
  avgLoanSize: number;
  collectedAmount: number;
  repaymentCount: number;
  collectionRate: number;
  outstandingPrincipal: number;
  outstandingBalance: number;
  outstandingLoans: number;
  overduePrincipal: number;
  overdueBalance: number;
  overdueLoans: number;
  parRatio: number;
}

export interface OverviewAgingRow {
  bucket: string;
  loans: number;
  amount: number;
}

export interface OverviewSummary {
  kpis: OverviewKpis;
  aging: OverviewAgingRow[];
  generatedAt: string;
}

export interface OverviewData extends OverviewSummary {
  income: { principal: number; interest: number; serviceFee: number; penalty: number; tax: number; total: number };
  trend: {
    granularity: 'day' | 'month';
    clamped: boolean;
    from: string;
    to: string;
    points: Array<{ period: string; disbursed: number; collected: number }>;
  };
}
