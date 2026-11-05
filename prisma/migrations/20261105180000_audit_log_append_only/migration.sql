-- AuditLog is append-only.
--
-- An audit trail is only worth something if nobody, the application included,
-- can quietly rewrite or remove an entry. This trigger refuses every UPDATE and
-- DELETE that touches a row of [dbo].[AuditLog]; INSERT is untouched (the app
-- only ever inserts).
--
-- It stops the app, scripts and anyone using the app's database login. A login
-- that can ALTER the table (db_owner, sysadmin) can still DISABLE the trigger or
-- TRUNCATE the table; for protection against that too, run the app under a login
-- without ALTER rights and record those events with SQL Server Audit.
--
-- A retention purge, when policy calls for one, is a deliberate DBA job:
--   DISABLE TRIGGER [dbo].[AuditLog_append_only] ON [dbo].[AuditLog];
--   DELETE FROM [dbo].[AuditLog] WHERE [createdAt] < @cutoff;
--   ENABLE TRIGGER [dbo].[AuditLog_append_only] ON [dbo].[AuditLog];
--
-- Only UPDATE and DELETE fire it, so Prisma's INSERT ... OUTPUT keeps working
-- (SQL Server refuses OUTPUT without INTO only when the table has a trigger for
-- that same action).
--
-- Re-runnable: the trigger is created only when it is missing. CREATE TRIGGER
-- must start its own batch, hence the EXEC.

IF OBJECT_ID(N'[dbo].[AuditLog_append_only]', N'TR') IS NULL
    EXEC(N'
CREATE TRIGGER [dbo].[AuditLog_append_only]
ON [dbo].[AuditLog]
INSTEAD OF UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM deleted)
        THROW 51000, N''AuditLog is append-only: entries cannot be changed or deleted.'', 1;
END');
