-- Indexes behind the reports screen (loans, transactions, collections, aging,
-- the National Bank return and the overview).
--
-- SQL Server does not index foreign keys on its own, and Loan, Payment,
-- JournalEntry and LedgerEntry had nothing but their primary keys: every
-- provider, period, borrower or journal lookup scanned the whole table.
--
-- Written to be re-runnable (each index is created only when it is missing),
-- because databases here have drifted from the migrations: schema.prisma has
-- declared DisbursementTransaction(loanId) all along, but no migration created
-- it. Enterprise-class engines build the indexes online, so writes are not
-- blocked; elsewhere each table is locked only while its own indexes build.
-- There is no surrounding transaction for the same reason: a failure part-way
-- leaves the indexes built so far, and running the script again finishes it.

BEGIN TRY

DECLARE @online NVARCHAR(40) =
    CASE WHEN CAST(SERVERPROPERTY('EngineEdition') AS INT) IN (3, 5, 8)
         THEN N' WITH (ONLINE = ON)' ELSE N'' END;

-- Loan: provider + disbursement period (provider scope goes through productId)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'Loan_productId_disbursedDate_idx' AND object_id = OBJECT_ID(N'[dbo].[Loan]'))
    EXEC(N'CREATE NONCLUSTERED INDEX [Loan_productId_disbursedDate_idx] ON [dbo].[Loan]([productId], [disbursedDate])' + @online);

-- Loan: disbursement period across every provider
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'Loan_disbursedDate_idx' AND object_id = OBJECT_ID(N'[dbo].[Loan]'))
    EXEC(N'CREATE NONCLUSTERED INDEX [Loan_disbursedDate_idx] ON [dbo].[Loan]([disbursedDate])' + @online);

-- Loan: borrower (search, branch scope, loan cycle, identity lookups)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'Loan_borrowerId_idx' AND object_id = OBJECT_ID(N'[dbo].[Loan]'))
    EXEC(N'CREATE NONCLUSTERED INDEX [Loan_borrowerId_idx] ON [dbo].[Loan]([borrowerId])' + @online);

-- Loan: unpaid loans past their due date (aging, overdue and status filters)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'Loan_repaymentStatus_dueDate_idx' AND object_id = OBJECT_ID(N'[dbo].[Loan]'))
    EXEC(N'CREATE NONCLUSTERED INDEX [Loan_repaymentStatus_dueDate_idx] ON [dbo].[Loan]([repaymentStatus], [dueDate])' + @online);

-- Payment: a loan's repayments, and repayments in a period
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'Payment_loanId_idx' AND object_id = OBJECT_ID(N'[dbo].[Payment]'))
    EXEC(N'CREATE NONCLUSTERED INDEX [Payment_loanId_idx] ON [dbo].[Payment]([loanId])' + @online);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'Payment_date_idx' AND object_id = OBJECT_ID(N'[dbo].[Payment]'))
    EXEC(N'CREATE NONCLUSTERED INDEX [Payment_date_idx] ON [dbo].[Payment]([date])' + @online);

-- JournalEntry: a loan's journals, and journals of a provider / in a period
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'JournalEntry_loanId_idx' AND object_id = OBJECT_ID(N'[dbo].[JournalEntry]'))
    EXEC(N'CREATE NONCLUSTERED INDEX [JournalEntry_loanId_idx] ON [dbo].[JournalEntry]([loanId])' + @online);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'JournalEntry_providerId_date_idx' AND object_id = OBJECT_ID(N'[dbo].[JournalEntry]'))
    EXEC(N'CREATE NONCLUSTERED INDEX [JournalEntry_providerId_date_idx] ON [dbo].[JournalEntry]([providerId], [date])' + @online);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'JournalEntry_date_idx' AND object_id = OBJECT_ID(N'[dbo].[JournalEntry]'))
    EXEC(N'CREATE NONCLUSTERED INDEX [JournalEntry_date_idx] ON [dbo].[JournalEntry]([date])' + @online);

-- LedgerEntry: the entries of a journal, and of an account
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'LedgerEntry_journalEntryId_idx' AND object_id = OBJECT_ID(N'[dbo].[LedgerEntry]'))
    EXEC(N'CREATE NONCLUSTERED INDEX [LedgerEntry_journalEntryId_idx] ON [dbo].[LedgerEntry]([journalEntryId])' + @online);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'LedgerEntry_ledgerAccountId_idx' AND object_id = OBJECT_ID(N'[dbo].[LedgerEntry]'))
    EXEC(N'CREATE NONCLUSTERED INDEX [LedgerEntry_ledgerAccountId_idx] ON [dbo].[LedgerEntry]([ledgerAccountId])' + @online);

-- PendingPayment: a loan's pending payments by status
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'PendingPayment_loanId_status_idx' AND object_id = OBJECT_ID(N'[dbo].[PendingPayment]'))
    EXEC(N'CREATE NONCLUSTERED INDEX [PendingPayment_loanId_status_idx] ON [dbo].[PendingPayment]([loanId], [status])' + @online);

-- PaymentTransaction: the gateway callback of a SuperApp TxRef (repayment FT references)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'PaymentTransaction_txnRef_idx' AND object_id = OBJECT_ID(N'[dbo].[PaymentTransaction]'))
    EXEC(N'CREATE NONCLUSTERED INDEX [PaymentTransaction_txnRef_idx] ON [dbo].[PaymentTransaction]([txnRef])' + @online);

-- DisbursementTransaction: declared in schema.prisma but never created by a migration
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'DisbursementTransaction_loanId_idx' AND object_id = OBJECT_ID(N'[dbo].[DisbursementTransaction]'))
    EXEC(N'CREATE NONCLUSTERED INDEX [DisbursementTransaction_loanId_idx] ON [dbo].[DisbursementTransaction]([loanId])' + @online);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'DisbursementTransaction_transactionId_idx' AND object_id = OBJECT_ID(N'[dbo].[DisbursementTransaction]'))
    EXEC(N'CREATE NONCLUSTERED INDEX [DisbursementTransaction_transactionId_idx] ON [dbo].[DisbursementTransaction]([transactionId])' + @online);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'DisbursementTransaction_disbursementStatus_idx' AND object_id = OBJECT_ID(N'[dbo].[DisbursementTransaction]'))
    EXEC(N'CREATE NONCLUSTERED INDEX [DisbursementTransaction_disbursementStatus_idx] ON [dbo].[DisbursementTransaction]([disbursementStatus])' + @online);

-- DisbursementTransaction: transfers within minutes of a journal (report matching)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'DisbursementTransaction_createdAt_idx' AND object_id = OBJECT_ID(N'[dbo].[DisbursementTransaction]'))
    EXEC(N'CREATE NONCLUSTERED INDEX [DisbursementTransaction_createdAt_idx] ON [dbo].[DisbursementTransaction]([createdAt])' + @online);

END TRY
BEGIN CATCH

THROW;

END CATCH
