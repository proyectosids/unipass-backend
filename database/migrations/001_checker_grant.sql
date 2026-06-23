-- =============================================================================
-- 001_checker_grant.sql
-- Feature: "Checker como capability asignable"
--
-- Crea la tabla CheckerGrant (permiso aditivo para confirmar checks sobre uno o
-- mas puntos de control, otorgado a una cuenta EXISTENTE: ALUMNO o EMPLEADO) y
-- agrega la columna de auditoria CheckPoints.ConfirmadoPor.
--
-- NO toca Position/Cargo (suplencia entre empleados, mecanismo separado).
-- Idempotente: se puede correr varias veces sin error.
-- =============================================================================

SET XACT_ABORT ON;
BEGIN TRANSACTION;

-- ---------------------------------------------------------------------------
-- Tabla CheckerGrant
-- ---------------------------------------------------------------------------
IF NOT EXISTS (
    SELECT 1 FROM sys.tables WHERE name = 'CheckerGrant' AND schema_id = SCHEMA_ID('dbo')
)
BEGIN
    CREATE TABLE dbo.CheckerGrant (
        IdGrant       INT IDENTITY(1,1) NOT NULL,
        IdLogin       INT NOT NULL,          -- cuenta beneficiaria (ALUMNO o EMPLEADO)
        IdPoint       INT NOT NULL,          -- punto de control
        Scope         NVARCHAR(10) NOT NULL, -- 'SALIDA' | 'RETORNO' | 'AMBOS'
        AsignadoPor   INT NOT NULL,          -- IdLogin del jefe que otorga
        Activo        BIT NOT NULL CONSTRAINT DF_CheckerGrant_Activo DEFAULT (1),
        Vigencia      NVARCHAR(12) NOT NULL, -- 'TEMPORAL' | 'PERMANENTE'
        FechaExpira   DATETIME NULL,         -- requerido cuando Vigencia = 'TEMPORAL'
        FechaCreacion DATETIME NOT NULL CONSTRAINT DF_CheckerGrant_FechaCreacion DEFAULT (GETDATE()),

        CONSTRAINT PK_CheckerGrant PRIMARY KEY (IdGrant),
        CONSTRAINT CK_CheckerGrant_Scope    CHECK (Scope    IN ('SALIDA','RETORNO','AMBOS')),
        CONSTRAINT CK_CheckerGrant_Vigencia CHECK (Vigencia IN ('TEMPORAL','PERMANENTE')),
        CONSTRAINT FK_CheckerGrant_Login
            FOREIGN KEY (IdLogin)     REFERENCES dbo.LoginUniPass(IdLogin),
        CONSTRAINT FK_CheckerGrant_Point
            FOREIGN KEY (IdPoint)     REFERENCES dbo.Point(IdPoint),
        CONSTRAINT FK_CheckerGrant_AsignadoPor
            FOREIGN KEY (AsignadoPor) REFERENCES dbo.LoginUniPass(IdLogin),
        -- Un solo grant por (usuario, punto) para no duplicar.
        CONSTRAINT UQ_CheckerGrant_Login_Point UNIQUE (IdLogin, IdPoint)
    );
END;

-- ---------------------------------------------------------------------------
-- CheckPoints.ConfirmadoPor (auditoria: quien confirmo el check)
-- ---------------------------------------------------------------------------
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE name = 'ConfirmadoPor' AND object_id = OBJECT_ID('dbo.CheckPoints')
)
BEGIN
    ALTER TABLE dbo.CheckPoints ADD ConfirmadoPor INT NULL;
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_CheckPoints_ConfirmadoPor'
)
BEGIN
    ALTER TABLE dbo.CheckPoints
        ADD CONSTRAINT FK_CheckPoints_ConfirmadoPor
            FOREIGN KEY (ConfirmadoPor) REFERENCES dbo.LoginUniPass(IdLogin);
END;

COMMIT TRANSACTION;
