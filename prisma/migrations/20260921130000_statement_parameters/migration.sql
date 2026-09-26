BEGIN TRY

BEGIN TRAN;

-- CreateTable: statement figures defined in the Scoring Engine
CREATE TABLE [dbo].[StatementParameter] (
    [id] NVARCHAR(1000) NOT NULL,
    [field] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [direction] NVARCHAR(1000) NOT NULL,
    [matchWords] NVARCHAR(1000) NOT NULL,
    [excludeWords] NVARCHAR(1000),
    [measure] NVARCHAR(1000) NOT NULL,
    [minAmount] FLOAT(53),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [StatementParameter_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [StatementParameter_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [StatementParameter_field_key] UNIQUE NONCLUSTERED ([field])
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
