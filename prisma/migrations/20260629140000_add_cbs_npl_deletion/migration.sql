BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[NplCbsDeletion] (
    [id] NVARCHAR(1000) NOT NULL,
    [accountNumber] NVARCHAR(1000) NOT NULL,
    [source] NVARCHAR(1000) NOT NULL CONSTRAINT [NplCbsDeletion_source_df] DEFAULT 'MANUAL',
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [NplCbsDeletion_status_df] DEFAULT 'PENDING',
    [httpStatus] INT,
    [reason] NVARCHAR(max),
    [borrowerId] NVARCHAR(1000),
    [triggeredByUserId] NVARCHAR(1000),
    [responsePayload] NVARCHAR(max),
    [errorMessage] NVARCHAR(max),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [NplCbsDeletion_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [finishedAt] DATETIME2,
    CONSTRAINT [NplCbsDeletion_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [NplCbsDeletion_accountNumber_idx] ON [dbo].[NplCbsDeletion]([accountNumber]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [NplCbsDeletion_status_idx] ON [dbo].[NplCbsDeletion]([status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [NplCbsDeletion_createdAt_idx] ON [dbo].[NplCbsDeletion]([createdAt]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
