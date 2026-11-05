import ExcelJS from 'exceljs';
import type { PrismaClient } from '@prisma/client';
import { agingBorrowersReport, AGING_SORT_COLUMNS, DEFAULT_AGING_SORT, type BorrowerAgingRow } from './aging-borrowers';
import { AGING_CLASSES, type AgingClass } from './aging';
import type { LoanStatusFilter } from './borrowers';
import {
  collectionRows,
  COLLECTION_SORT_COLUMNS,
  DEFAULT_COLLECTION_SORT,
  sortCollections,
  type CollectionRow,
} from './collections';
import { DEFAULT_LOAN_SORT, LOAN_SORT_COLUMNS, loansReport, type LoanReportRow } from './loans';
import {
  DEFAULT_NATIONAL_BANK_SORT,
  NATIONAL_BANK_SORT_COLUMNS,
  nationalBankReport,
  type NationalBankRow,
} from './national-bank';
import { allRows, localDay, reportSort, type Paging, type ReportPeriod } from './params';
import { providerSummary, type ProviderSummary } from './provider-summary';
import {
  DEFAULT_TRANSACTION_SORT,
  TRANSACTION_SORT_COLUMNS,
  transactionsReport,
  type TransactionReportRow,
} from './transactions';

/** The workbook's sheets, in workbook order. */
export const EXPORT_SHEETS = [
  'providerLoans',
  'collections',
  'utilization',
  'disbursements',
  'repayments',
  'aging',
  'borrowerAging',
  'borrowerPerformance',
  'nationalBank',
] as const;
export type ExportSheet = (typeof EXPORT_SHEETS)[number];

export const SHEET_NAMES: Record<ExportSheet, string> = {
  providerLoans: 'Provider Loans',
  collections: 'Collections',
  utilization: 'Fund Utilization',
  disbursements: 'Disbursements',
  repayments: 'Repayments',
  aging: 'Aging Report',
  borrowerAging: 'Borrower Aging',
  borrowerPerformance: 'Borrower Performance',
  nationalBank: 'National Bank Report',
};

/** The sheets asked for (`sheets`, comma separated) that the user may see; every allowed one when none is named. */
export function parseSheets(value: string | null, allowed: readonly ExportSheet[]): ExportSheet[] {
  const asked = new Set((value ?? '').split(',').map((s) => s.trim()));
  const sheets = allowed.filter((sheet) => asked.has(sheet));
  return sheets.length ? sheets : [...allowed];
}

export interface ExportRequest {
  sheets: ExportSheet[];
  providers: Array<{ id: string; name: string; startingCapital: number }>;
  /** null = every provider. */
  providerId: string | null;
  period: ReportPeriod;
  search?: string;
  /** Minutes east of UTC: dates are written on the user's calendar. */
  tzOffset: number;
  scope: string[] | null;
  /** Loan status of the loan sheets, when exporting that tab. */
  status: LoanStatusFilter | null;
  /** Class of the borrower aging sheet, when exporting that tab. */
  classification: AgingClass | null;
  /** `sortBy` / `sortDir`, when exporting one tab in its on-screen order. */
  params: URLSearchParams;
}

interface Column<T> {
  header: string;
  value: (row: T) => unknown;
  money?: boolean;
  width?: number;
}

const EVERYTHING: Paging = { page: 1, pageSize: Number.MAX_SAFE_INTEGER };

/** Text a spreadsheet would run as a formula is written as text. */
export function sanitize(value: unknown): unknown {
  return typeof value === 'string' && ['=', '+', '-', '@'].some((c) => value.startsWith(c)) ? `'${value}` : value;
}

/** The reports (or the chosen sheets) as an Excel workbook; each dataset is read once, in full. */
export async function buildReportWorkbook(prisma: PrismaClient, request: ExportRequest): Promise<ExcelJS.Workbook> {
  const { sheets, providerId, period, search, tzOffset, scope, params } = request;
  const wants = (...names: ExportSheet[]) => names.some((name) => sheets.includes(name));
  const day = (value: Date | string | null | undefined) => {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : localDay(date, tzOffset);
  };

  const [loanRows, collections, disbursements, repayments, summaries, borrowerAgingRows, nationalBankRows] =
    await Promise.all([
      wants('providerLoans', 'borrowerPerformance')
        ? allRows((paging) =>
            loansReport(
              prisma,
              { providerId, period, search, status: request.status, scope },
              paging,
              reportSort(params, LOAN_SORT_COLUMNS, DEFAULT_LOAN_SORT),
            ),
          )
        : [],
      wants('collections')
        ? collectionRows(prisma, { providerId, period, tzOffset, scope }).then((rows) =>
            sortCollections(rows, reportSort(params, COLLECTION_SORT_COLUMNS, DEFAULT_COLLECTION_SORT)),
          )
        : [],
      wants('disbursements')
        ? allRows(
            (paging) =>
              transactionsReport(
                prisma,
                { providerId, period, search, type: 'disbursement', scope },
                paging,
                reportSort(params, TRANSACTION_SORT_COLUMNS, DEFAULT_TRANSACTION_SORT),
              ),
            400,
          )
        : [],
      wants('repayments')
        ? allRows(
            (paging) =>
              transactionsReport(
                prisma,
                { providerId, period, search, type: 'repayment', scope },
                paging,
                reportSort(params, TRANSACTION_SORT_COLUMNS, DEFAULT_TRANSACTION_SORT),
              ),
            400,
          )
        : [],
      wants('utilization', 'aging')
        ? Promise.all(request.providers.map((p) => providerSummary(prisma, p.id, period, scope)))
        : [],
      wants('borrowerAging')
        ? agingBorrowersReport(
            prisma,
            { providerId, search, classification: request.classification, scope },
            EVERYTHING,
            reportSort(params, AGING_SORT_COLUMNS, DEFAULT_AGING_SORT),
          ).then((page) => page.data)
        : [],
      wants('nationalBank')
        ? allRows((paging) =>
            nationalBankReport(
              prisma,
              { providerId, period, search, scope },
              paging,
              reportSort(params, NATIONAL_BANK_SORT_COLUMNS, DEFAULT_NATIONAL_BANK_SORT),
            ),
          )
        : [],
    ]);

  const summaryOf = new Map<string, ProviderSummary>(summaries.map((s) => [s.providerId, s]));
  const providerRows = request.providers.flatMap((provider) => {
    const summary = summaryOf.get(provider.id);
    return summary ? [{ provider, summary }] : [];
  });
  type ProviderRow = (typeof providerRows)[number];

  const workbook = new ExcelJS.Workbook();
  const add = <T>(sheet: ExportSheet, columns: Column<T>[], rows: T[]) => {
    if (!wants(sheet) || rows.length === 0) return;
    const worksheet = workbook.addWorksheet(SHEET_NAMES[sheet], { views: [{ state: 'frozen', ySplit: 1 }] });
    worksheet.columns = columns.map((column) => ({
      header: column.header,
      key: column.header,
      width: column.width ?? Math.min(40, Math.max(12, column.header.length + 2)),
      ...(column.money && { style: { numFmt: '#,##0.00' } }),
    }));
    worksheet.getRow(1).font = { bold: true };
    for (const row of rows) worksheet.addRow(columns.map((c) => sanitize(c.value(row))));
  };

  add<LoanReportRow>(
    'providerLoans',
    [
      { header: 'Provider', value: (r) => r.provider },
      { header: 'Loan ID', value: (r) => r.loanId, width: 28 },
      { header: 'Borrower', value: (r) => r.borrowerName, width: 28 },
      { header: 'Phone', value: (r) => r.borrowerPhone, width: 16 },
      { header: 'Account', value: (r) => r.borrowerAccount, width: 18 },
      { header: 'Disbursed', value: (r) => day(r.disbursedDate) },
      { header: 'Due Date', value: (r) => day(r.dueDate) },
      { header: 'Principal Disbursed', value: (r) => r.principalDisbursed, money: true },
      { header: 'Principal Outstanding', value: (r) => r.principalOutstanding, money: true },
      { header: 'Interest (Daily Fee) Outstanding', value: (r) => r.interestOutstanding, money: true },
      { header: 'Service Fee Outstanding', value: (r) => r.serviceFeeOutstanding, money: true },
      { header: 'Penalty Outstanding', value: (r) => r.penaltyOutstanding, money: true },
      { header: 'Total Outstanding', value: (r) => r.totalOutstanding, money: true },
      { header: 'Status', value: (r) => r.status },
    ],
    loanRows,
  );

  add<CollectionRow>(
    'collections',
    [
      { header: 'Provider', value: (r) => r.provider },
      { header: 'Date', value: (r) => r.date },
      { header: 'Principal Received', value: (r) => r.principal, money: true },
      { header: 'Interest Received', value: (r) => r.interest, money: true },
      { header: 'Service Fee Received', value: (r) => r.serviceFee, money: true },
      { header: 'Penalty Received', value: (r) => r.penalty, money: true },
      { header: 'Tax Received', value: (r) => r.tax, money: true },
      { header: 'Unapplied / Overpaid', value: (r) => r.unapplied, money: true },
      { header: 'Total Collected', value: (r) => r.total, money: true },
      { header: 'Outstanding Principal', value: (r) => r.outstandingPrincipal, money: true },
      { header: 'Outstanding Loans', value: (r) => r.outstandingLoans },
    ],
    collections,
  );

  add<ProviderRow>(
    'utilization',
    [
      { header: 'Provider', value: (r) => r.provider.name },
      { header: 'Provider Fund', value: (r) => r.provider.startingCapital, money: true },
      { header: 'Loans Disbursed', value: (r) => r.summary.portfolioSummary.disbursed, money: true },
      { header: 'Outstanding Principal', value: (r) => r.summary.portfolioSummary.outstanding, money: true },
      {
        header: 'Available Fund',
        value: (r) => r.provider.startingCapital - r.summary.portfolioSummary.outstanding,
        money: true,
      },
      { header: 'Utilization %', value: (r) => r.summary.fundUtilization, money: true },
    ],
    providerRows,
  );

  add<TransactionReportRow>(
    'disbursements',
    [
      { header: 'Provider', value: (r) => r.provider },
      { header: 'Date', value: (r) => day(r.transactionDate) },
      { header: 'Loan ID', value: (r) => r.loanId, width: 28 },
      { header: 'Customer Name', value: (r) => r.customerName || r.borrowerAccount || r.borrowerId || '', width: 28 },
      { header: 'Debit Account', value: (r) => r.debitAccount },
      { header: 'Credit Account (Customer Account)', value: (r) => r.borrowerAccount || r.creditAccount },
      { header: 'Txn Status', value: (r) => r.disbursementOutcome || r.disbursementStatusText || r.transactionStatus },
      { header: 'CBS Reference', value: (r) => r.cbsReference || r.reference },
      { header: 'Loan Amount (MLS)', value: (r) => r.principalDisbursed || 0, money: true },
      { header: 'Interest Fee (MLS)', value: (r) => r.interestOutstanding || 0, money: true },
      { header: 'Service Fee (MLS)', value: (r) => r.serviceFeeOutstanding || 0, money: true },
      { header: 'Net Disbursed (MLS)', value: (r) => r.netDisbursed, money: true },
      { header: 'CBS Credit Amount', value: (r) => r.cbsCreditAmount ?? 0, money: true },
      { header: 'Due Date', value: (r) => day(r.dueDate) },
      { header: 'Difference', value: (r) => r.netDisbursed - (r.cbsCreditAmount ?? 0), money: true },
    ],
    disbursements,
  );

  add<TransactionReportRow>(
    'repayments',
    [
      { header: 'Provider', value: (r) => r.provider },
      { header: 'Loan ID', value: (r) => r.loanId, width: 28 },
      { header: 'Customer Name', value: (r) => r.customerName || r.borrowerAccount || r.borrowerId || '', width: 28 },
      { header: 'Transaction Date', value: (r) => day(r.transactionDate) },
      { header: 'Due Date', value: (r) => day(r.dueDate) },
      { header: 'Debit Account', value: (r) => r.debitAccount },
      { header: 'Credit Account', value: (r) => r.borrowerAccount || r.creditAccount },
      { header: 'Txn Status', value: (r) => r.transactionStatus },
      { header: 'Reference', value: (r) => r.reference },
      { header: 'Product Type', value: (r) => r.productType },
      { header: 'Borrower', value: (r) => r.borrowerId },
      { header: 'Principal Disbursed', value: (r) => r.principalDisbursed, money: true },
      { header: 'Principal Paid', value: (r) => r.principalPaid, money: true },
      { header: 'Interest Paid', value: (r) => r.interestPaid, money: true },
      { header: 'Service Fee Paid', value: (r) => r.serviceFeePaid, money: true },
      { header: 'Penalty Paid', value: (r) => r.penaltyPaid, money: true },
      { header: 'Unapplied / Overpaid', value: (r) => r.unappliedPaid, money: true },
      { header: 'Total Paid', value: (r) => r.totalPaid, money: true },
      { header: 'Status', value: (r) => r.status },
    ],
    repayments,
  );

  add<ProviderRow>(
    'aging',
    [
      { header: 'Provider', value: (r) => r.provider.name },
      ...AGING_CLASSES.flatMap((c): Column<ProviderRow>[] => [
        { header: `${c.label} Loans`, value: (r) => r.summary.agingReport.buckets[c.key] },
        { header: `${c.label} Amount`, value: (r) => r.summary.agingReport.bucketAmounts[c.key], money: true },
      ]),
      { header: 'Total Overdue Loans', value: (r) => r.summary.agingReport.totalOverdue },
      { header: 'Total Overdue Amount', value: (r) => r.summary.agingReport.totalOverdueAmount, money: true },
    ],
    providerRows,
  );

  add<BorrowerAgingRow>(
    'borrowerAging',
    [
      { header: 'Provider', value: (r) => r.provider },
      { header: 'Borrower', value: (r) => r.borrowerPhone, width: 16 },
      { header: 'Borrower Account', value: (r) => r.borrowerAccount, width: 18 },
      { header: 'Borrower Name', value: (r) => r.borrowerName, width: 28 },
      { header: 'Loans', value: (r) => r.loanCount },
      { header: 'Days Overdue', value: (r) => r.daysOverdue },
      { header: 'Category', value: (r) => r.classification },
      { header: 'Principal Outstanding', value: (r) => r.principalOutstanding, money: true },
      { header: 'Interest Outstanding', value: (r) => r.interestOutstanding, money: true },
      { header: 'Service Fee Outstanding', value: (r) => r.serviceFeeOutstanding, money: true },
      { header: 'Penalty Outstanding', value: (r) => r.penaltyOutstanding, money: true },
      { header: 'Total Outstanding', value: (r) => r.totalOutstanding, money: true },
    ],
    borrowerAgingRows,
  );

  add<LoanReportRow>(
    'borrowerPerformance',
    [
      { header: 'Borrower ID', value: (r) => r.borrowerPhone, width: 16 },
      { header: 'Borrower Name', value: (r) => r.borrowerName, width: 28 },
      { header: 'Account', value: (r) => r.borrowerAccount, width: 18 },
      { header: 'Loan ID', value: (r) => r.loanId, width: 28 },
      { header: 'Principal Disbursed', value: (r) => r.principalDisbursed, money: true },
      { header: 'Principal Outstanding', value: (r) => r.principalOutstanding, money: true },
      { header: 'Interest Outstanding', value: (r) => r.interestOutstanding, money: true },
      { header: 'Service Fee Outstanding', value: (r) => r.serviceFeeOutstanding, money: true },
      { header: 'Penalty Outstanding', value: (r) => r.penaltyOutstanding, money: true },
      { header: 'Days in Arrears', value: (r) => r.daysInArrears },
      { header: 'Status', value: (r) => r.status },
    ],
    loanRows,
  );

  // Column headers follow the regulator's submission template verbatim.
  add<NationalBankRow>(
    'nationalBank',
    [
      { header: 'First Name', value: (r) => r.firstName },
      { header: 'Middle Name', value: (r) => r.middleName },
      { header: 'Last Name', value: (r) => r.lastName },
      { header: 'Gender', value: (r) => r.gender },
      { header: 'Personal Income Level', value: (r) => r.personalIncomeLevel },
      { header: 'National ID/Fayda No', value: (r) => r.nationalId },
      { header: 'TIN', value: (r) => r.tin },
      { header: 'Other ID No', value: (r) => r.otherIdNo },
      { header: 'Region', value: (r) => r.region },
      { header: 'Zone', value: (r) => r.zone },
      { header: 'Sub-city', value: (r) => r.subCity },
      { header: 'Woreda', value: (r) => r.woreda },
      { header: 'Kebele', value: (r) => r.kebele },
      { header: 'House No', value: (r) => r.houseNo },
      { header: 'Tel. No', value: (r) => r.phoneNo },
      { header: 'Personal Loan', value: (r) => r.personalLoan || '', money: true },
      { header: 'Working Capital Loan', value: (r) => r.workingCapitalLoan || '', money: true },
      { header: 'Buy Now Pay Later', value: (r) => r.buyNowPayLater || '', money: true },
      { header: 'Revolving Credit', value: (r) => r.revolvingCredit || '', money: true },
      { header: 'MSME Loans', value: (r) => r.msmeLoans || '', money: true },
      { header: 'Other', value: (r) => r.otherLoanType || '', money: true },
      { header: 'Application Amount', value: (r) => r.applicationAmount, money: true },
      { header: 'Purpose of Loan', value: (r) => r.purposeOfLoan },
      { header: 'Loan Account Ref No', value: (r) => r.loanAccountRefNo, width: 28 },
      { header: 'Approved/Disbursed Amount', value: (r) => r.approvedAmount, money: true },
      { header: 'Disbursement Date', value: (r) => r.disbursementDate },
      { header: 'Repayment Frequency', value: (r) => r.repaymentFrequency },
      { header: 'Duration (Days)', value: (r) => r.durationDays },
      { header: 'Outstanding Balance', value: (r) => r.outstandingBalance, money: true },
      { header: 'Settlement Date', value: (r) => r.settlementDate },
      { header: 'Loan Status/Classification', value: (r) => r.loanClassification },
      { header: 'Loan Cycle', value: (r) => r.loanCycle },
      { header: 'Interest Rate', value: (r) => r.interestRate },
      { header: 'Service Charge', value: (r) => r.serviceCharge },
      { header: 'Credit Score', value: (r) => r.creditScore },
    ],
    nationalBankRows,
  );

  return workbook;
}

/** The download's file name: the sheet's name when there is one sheet, the timeframe and the day. */
export function exportFileName(sheets: ExportSheet[], timeframe: string, today: string): string {
  const label = sheets.length === 1 ? SHEET_NAMES[sheets[0]].replace(/\s+/g, '_') : 'Report';
  return `LoanFlow_${label}_${timeframe}_${today}.xlsx`;
}
