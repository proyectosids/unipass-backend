-- 013_registration_token.sql
-- Autoregistro seguro: token temporal emitido tras OTP válido, ligado a matrícula + correo
-- institucional. Solo se guarda el HASH (SHA-256). Single-use + expiración corta. Idempotente.
--
-- ROLLBACK: DROP TABLE UNIPASS.RegistrationToken;

IF OBJECT_ID('UNIPASS.RegistrationToken','U') IS NULL
CREATE TABLE UNIPASS.RegistrationToken (
    Id                  INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_RegistrationToken PRIMARY KEY,
    Matricula           VARCHAR(10)   NOT NULL,
    CorreoInstitucional VARCHAR(80)   NOT NULL,
    TokenHash           NVARCHAR(128) NOT NULL,
    ExpiraEn            DATETIME      NOT NULL,
    UsadoEn             DATETIME      NULL,
    FechaCreacion       DATETIME      NOT NULL CONSTRAINT DF_RegistrationToken_Fecha DEFAULT (GETDATE())
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_RegistrationToken_Hash' AND object_id=OBJECT_ID('UNIPASS.RegistrationToken'))
    CREATE NONCLUSTERED INDEX IX_RegistrationToken_Hash ON UNIPASS.RegistrationToken (TokenHash);
GO

SELECT COUNT(*) AS RegistrationTokenRows FROM UNIPASS.RegistrationToken;
