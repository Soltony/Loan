BEGIN TRY

BEGIN TRAN;

-- TaxTransferSimulation was added to schema.prisma without a migration, so some
-- databases already have the table (created with `prisma db push`) and some do
-- not. Create it when it is missing; otherwise upgrade it in place:
--   * component / sourceAccountName for the Collection Transfers register
--     (existing rows were all tax transfers, so component backfills to 'Tax');
--   * maker-checker columns (checker, rejection, reversal request);
--   * referenceKey replaces the unique on transferReference, so a rejected or
--     reversed reference can be re-submitted;
--   * status defaults to PENDING_APPROVAL (legacy SIMULATED rows stay approved).
IF OBJECT_ID(N'[dbo].[TaxTransferSimulation]', N'U') IS NULL
BEGIN
    -- CreateTable
    CREATE TABLE [dbo].[TaxTransferSimulation] (
        [id] NVARCHAR(1000) NOT NULL,
        [providerId] NVARCHAR(1000) NOT NULL,
        [component] NVARCHAR(1000) NOT NULL CONSTRAINT [TaxTransferSimulation_component_df] DEFAULT 'Tax',
        [transferAmount] FLOAT(53) NOT NULL,
        [sourceAccountName] NVARCHAR(1000),
        [destinationAccountName] NVARCHAR(1000) NOT NULL,
        [transferReference] NVARCHAR(1000) NOT NULL,
        [referenceKey] NVARCHAR(1000) NOT NULL,
        [transferDate] DATETIME2 NOT NULL,
        [journalEntryId] NVARCHAR(1000),
        [recordedByUserId] NVARCHAR(1000) NOT NULL,
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [TaxTransferSimulation_status_df] DEFAULT 'PENDING_APPROVAL',
        [checkedByUserId] NVARCHAR(1000),
        [checkedAt] DATETIME2,
        [rejectionReason] TEXT,
        [reversalRequestedByUserId] NVARCHAR(1000),
        [reversalRequestedAt] DATETIME2,
        [reversedByUserId] NVARCHAR(1000),
        [reversalReason] TEXT,
        [reversedAt] DATETIME2,
        [notes] TEXT,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [TaxTransferSimulation_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [TaxTransferSimulation_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [TaxTransferSimulation_referenceKey_key] UNIQUE NONCLUSTERED ([referenceKey])
    );

    -- CreateIndex
    CREATE NONCLUSTERED INDEX [TaxTransferSimulation_providerId_idx] ON [dbo].[TaxTransferSimulation]([providerId]);
    CREATE NONCLUSTERED INDEX [TaxTransferSimulation_transferDate_idx] ON [dbo].[TaxTransferSimulation]([transferDate]);
    CREATE NONCLUSTERED INDEX [TaxTransferSimulation_status_idx] ON [dbo].[TaxTransferSimulation]([status]);

    -- AddForeignKey
    ALTER TABLE [dbo].[TaxTransferSimulation] ADD CONSTRAINT [TaxTransferSimulation_providerId_fkey] FOREIGN KEY ([providerId]) REFERENCES [dbo].[LoanProvider]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
    ALTER TABLE [dbo].[TaxTransferSimulation] ADD CONSTRAINT [TaxTransferSimulation_journalEntryId_fkey] FOREIGN KEY ([journalEntryId]) REFERENCES [dbo].[JournalEntry]([id]) ON DELETE SET NULL ON UPDATE NO ACTION;
    ALTER TABLE [dbo].[TaxTransferSimulation] ADD CONSTRAINT [TaxTransferSimulation_recordedByUserId_fkey] FOREIGN KEY ([recordedByUserId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
    ALTER TABLE [dbo].[TaxTransferSimulation] ADD CONSTRAINT [TaxTransferSimulation_checkedByUserId_fkey] FOREIGN KEY ([checkedByUserId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
    ALTER TABLE [dbo].[TaxTransferSimulation] ADD CONSTRAINT [TaxTransferSimulation_reversalRequestedByUserId_fkey] FOREIGN KEY ([reversalRequestedByUserId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
    ALTER TABLE [dbo].[TaxTransferSimulation] ADD CONSTRAINT [TaxTransferSimulation_reversedByUserId_fkey] FOREIGN KEY ([reversedByUserId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
END
ELSE
BEGIN
    -- AlterTable. Dynamic SQL throughout, so the batch compiles before the new
    -- columns exist and the script can be re-run safely.
    IF COL_LENGTH(N'dbo.TaxTransferSimulation', N'component') IS NULL
        EXEC(N'ALTER TABLE [dbo].[TaxTransferSimulation] ADD [component] NVARCHAR(1000) NOT NULL CONSTRAINT [TaxTransferSimulation_component_df] DEFAULT ''Tax''');
    IF COL_LENGTH(N'dbo.TaxTransferSimulation', N'sourceAccountName') IS NULL
        EXEC(N'ALTER TABLE [dbo].[TaxTransferSimulation] ADD [sourceAccountName] NVARCHAR(1000)');
    IF COL_LENGTH(N'dbo.TaxTransferSimulation', N'checkedByUserId') IS NULL
        EXEC(N'ALTER TABLE [dbo].[TaxTransferSimulation] ADD [checkedByUserId] NVARCHAR(1000)');
    IF COL_LENGTH(N'dbo.TaxTransferSimulation', N'checkedAt') IS NULL
        EXEC(N'ALTER TABLE [dbo].[TaxTransferSimulation] ADD [checkedAt] DATETIME2');
    IF COL_LENGTH(N'dbo.TaxTransferSimulation', N'rejectionReason') IS NULL
        EXEC(N'ALTER TABLE [dbo].[TaxTransferSimulation] ADD [rejectionReason] TEXT');
    IF COL_LENGTH(N'dbo.TaxTransferSimulation', N'reversalRequestedByUserId') IS NULL
        EXEC(N'ALTER TABLE [dbo].[TaxTransferSimulation] ADD [reversalRequestedByUserId] NVARCHAR(1000)');
    IF COL_LENGTH(N'dbo.TaxTransferSimulation', N'reversalRequestedAt') IS NULL
        EXEC(N'ALTER TABLE [dbo].[TaxTransferSimulation] ADD [reversalRequestedAt] DATETIME2');

    -- referenceKey: normalized reference (upper-case, spaces removed) for live
    -- rows; reversed rows, and any later duplicate of a normalized reference,
    -- are retired with "|<id>" appended.
    IF COL_LENGTH(N'dbo.TaxTransferSimulation', N'referenceKey') IS NULL
    BEGIN
        EXEC(N'ALTER TABLE [dbo].[TaxTransferSimulation] ADD [referenceKey] NVARCHAR(1000)');
        EXEC(N'
            WITH keyed AS (
                SELECT [referenceKey], [id], [status],
                       UPPER(REPLACE(LTRIM(RTRIM([transferReference])), N'' '', N'''')) AS nk,
                       ROW_NUMBER() OVER (
                           PARTITION BY UPPER(REPLACE(LTRIM(RTRIM([transferReference])), N'' '', N''''))
                           ORDER BY CASE WHEN [status] IN (N''REVERSED'', N''REJECTED'') THEN 1 ELSE 0 END, [createdAt], [id]
                       ) AS rn
                FROM [dbo].[TaxTransferSimulation]
            )
            UPDATE keyed SET [referenceKey] =
                CASE WHEN rn = 1 AND [status] NOT IN (N''REVERSED'', N''REJECTED'') THEN nk ELSE nk + N''|'' + [id] END');
        EXEC(N'ALTER TABLE [dbo].[TaxTransferSimulation] ALTER COLUMN [referenceKey] NVARCHAR(1000) NOT NULL');
    END
    IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'TaxTransferSimulation_referenceKey_key'
          AND object_id = OBJECT_ID(N'[dbo].[TaxTransferSimulation]')
    )
        EXEC(N'ALTER TABLE [dbo].[TaxTransferSimulation] ADD CONSTRAINT [TaxTransferSimulation_referenceKey_key] UNIQUE NONCLUSTERED ([referenceKey])');

    -- transferReference is no longer unique on its own (see referenceKey).
    IF EXISTS (
        SELECT 1 FROM sys.key_constraints
        WHERE name = N'TaxTransferSimulation_transferReference_key'
          AND parent_object_id = OBJECT_ID(N'[dbo].[TaxTransferSimulation]')
    )
        EXEC(N'ALTER TABLE [dbo].[TaxTransferSimulation] DROP CONSTRAINT [TaxTransferSimulation_transferReference_key]');
    ELSE IF EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'TaxTransferSimulation_transferReference_key'
          AND object_id = OBJECT_ID(N'[dbo].[TaxTransferSimulation]')
    )
        EXEC(N'DROP INDEX [TaxTransferSimulation_transferReference_key] ON [dbo].[TaxTransferSimulation]');

    -- Replace the unfiltered unique on journalEntryId (see below).
    IF EXISTS (
        SELECT 1 FROM sys.key_constraints
        WHERE name = N'TaxTransferSimulation_journalEntryId_key'
          AND parent_object_id = OBJECT_ID(N'[dbo].[TaxTransferSimulation]')
    )
        EXEC(N'ALTER TABLE [dbo].[TaxTransferSimulation] DROP CONSTRAINT [TaxTransferSimulation_journalEntryId_key]');
    ELSE IF EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'TaxTransferSimulation_journalEntryId_key'
          AND object_id = OBJECT_ID(N'[dbo].[TaxTransferSimulation]')
          AND has_filter = 0
    )
        EXEC(N'DROP INDEX [TaxTransferSimulation_journalEntryId_key] ON [dbo].[TaxTransferSimulation]');

    -- New rows wait for a checker; a row inserted without a status must not count as approved.
    DECLARE @dropStatusDefault NVARCHAR(600);
    SELECT @dropStatusDefault = N'ALTER TABLE [dbo].[TaxTransferSimulation] DROP CONSTRAINT ' + QUOTENAME(dc.name)
    FROM sys.default_constraints dc
    JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
    WHERE dc.parent_object_id = OBJECT_ID(N'[dbo].[TaxTransferSimulation]') AND c.name = N'status';
    IF @dropStatusDefault IS NOT NULL
        EXEC(@dropStatusDefault);
    EXEC(N'ALTER TABLE [dbo].[TaxTransferSimulation] ADD CONSTRAINT [TaxTransferSimulation_status_df] DEFAULT ''PENDING_APPROVAL'' FOR [status]');

    IF OBJECT_ID(N'[dbo].[TaxTransferSimulation_checkedByUserId_fkey]', N'F') IS NULL
        EXEC(N'ALTER TABLE [dbo].[TaxTransferSimulation] ADD CONSTRAINT [TaxTransferSimulation_checkedByUserId_fkey] FOREIGN KEY ([checkedByUserId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION');
    IF OBJECT_ID(N'[dbo].[TaxTransferSimulation_reversalRequestedByUserId_fkey]', N'F') IS NULL
        EXEC(N'ALTER TABLE [dbo].[TaxTransferSimulation] ADD CONSTRAINT [TaxTransferSimulation_reversalRequestedByUserId_fkey] FOREIGN KEY ([reversalRequestedByUserId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION');
END

-- CreateIndex
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'TaxTransferSimulation_component_idx'
      AND object_id = OBJECT_ID(N'[dbo].[TaxTransferSimulation]')
)
    EXEC(N'CREATE NONCLUSTERED INDEX [TaxTransferSimulation_component_idx] ON [dbo].[TaxTransferSimulation]([component])');

-- journalEntryId is @unique in schema.prisma (required for the 1:1 relation),
-- but only approved tax transfers have a journal entry. A plain SQL Server
-- UNIQUE allows a single NULL, which would reject every other row, so
-- uniqueness is enforced only for non-NULL values.
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'TaxTransferSimulation_journalEntryId_key'
      AND object_id = OBJECT_ID(N'[dbo].[TaxTransferSimulation]')
)
    EXEC(N'CREATE UNIQUE NONCLUSTERED INDEX [TaxTransferSimulation_journalEntryId_key] ON [dbo].[TaxTransferSimulation]([journalEntryId]) WHERE [journalEntryId] IS NOT NULL');

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
