-- 009_idempotency.sql
-- Task 7.4A: idempotencia de POST /permission. Mapea un Idempotency-Key (uuid del cliente)
-- al IdPermission creado, para que un reintento/doble-tap/timeout no cree duplicados.
-- Idempotente (la creación de la tabla está guardada por IF NOT EXISTS).

IF OBJECT_ID('dbo.IdempotencyRequest', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.IdempotencyRequest (
        IdempotencyKey NVARCHAR(80)  NOT NULL PRIMARY KEY,
        IdLogin        INT           NOT NULL,
        IdPermission   INT           NULL,
        FechaCreacion  DATETIME      NOT NULL CONSTRAINT DF_IdempotencyRequest_Fecha DEFAULT GETDATE()
    );
END;
GO

SELECT COUNT(*) AS IdempotencyRows FROM dbo.IdempotencyRequest;
