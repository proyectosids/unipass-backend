-- 010_password_reset.sql
-- Task 7.1.B: reset tokens de recuperación de contraseña. El token opaco se entrega a
-- Flutter; en BD SOLO se guarda su hash (SHA-256). Un solo uso (UsadoEn) y expiración corta.
-- Idempotente.

IF OBJECT_ID('dbo.PasswordReset', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.PasswordReset (
        Id             INT           IDENTITY(1,1) PRIMARY KEY,
        IdLogin        INT           NOT NULL,
        ResetTokenHash NVARCHAR(128) NOT NULL,
        ExpiraEn       DATETIME      NOT NULL,
        UsadoEn        DATETIME      NULL,
        FechaCreacion  DATETIME      NOT NULL CONSTRAINT DF_PasswordReset_Fecha DEFAULT GETDATE()
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_PasswordReset_Hash' AND object_id = OBJECT_ID('dbo.PasswordReset'))
    CREATE NONCLUSTERED INDEX IX_PasswordReset_Hash ON dbo.PasswordReset (ResetTokenHash);
GO

SELECT COUNT(*) AS PasswordResetRows FROM dbo.PasswordReset;
