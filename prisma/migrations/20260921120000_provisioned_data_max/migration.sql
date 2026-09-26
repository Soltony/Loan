BEGIN TRY

BEGIN TRAN;

-- AlterTable: customer-info payloads now also hold the statement figures used by scoring,
-- which does not fit in the default NVARCHAR(1000). Widening keeps every existing value.
ALTER TABLE [dbo].[ProvisionedData] ALTER COLUMN [data] NVARCHAR(max) NOT NULL;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
