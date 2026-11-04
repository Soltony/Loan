BEGIN TRY

BEGIN TRAN;

-- CreateTable: how customer data is fetched (single row, id = 'global')
CREATE TABLE [dbo].[DataFetchSetting] (
    [id] NVARCHAR(1000) NOT NULL CONSTRAINT [DataFetchSetting_id_df] DEFAULT 'global',
    [statementMonths] INT NOT NULL CONSTRAINT [DataFetchSetting_statementMonths_df] DEFAULT 6,
    [statementRefreshDays] INT NOT NULL CONSTRAINT [DataFetchSetting_statementRefreshDays_df] DEFAULT 7,
    [statementMaxAgeDays] INT NOT NULL CONSTRAINT [DataFetchSetting_statementMaxAgeDays_df] DEFAULT 31,
    [customerInfoRefreshDays] INT NOT NULL CONSTRAINT [DataFetchSetting_customerInfoRefreshDays_df] DEFAULT 0,
    [updatedById] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [DataFetchSetting_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [DataFetchSetting_pkey] PRIMARY KEY CLUSTERED ([id])
);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
