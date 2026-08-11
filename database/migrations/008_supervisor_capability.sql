-- 008_supervisor_capability.sql
-- Capability SUPERVISOR (monitoreo institucional, SOLO LECTURA) reutilizando el MISMO
-- esquema que CHECKER (tabla dbo.CheckerGrant). Alcance GLOBAL: sin Tipo ni IdDormitorio.
-- Se agrega la columna Capability para distinguir CHECKER de SUPERVISOR.
-- Idempotente: se puede correr varias veces.
--
-- Fila SUPERVISOR: Capability='SUPERVISOR', Tipo=NULL, IdDormitorio=NULL,
--   Scope='AMBOS' (relleno, no aplica), Vigencia='PERMANENTE', Activo=1.
-- La UQ (IdLogin, Tipo, IdDormitorio) garantiza 1 SUPERVISOR por cuenta y no colisiona
-- con CHECKER (que siempre tiene Tipo no nulo).

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CheckerGrant') AND name = 'Capability')
BEGIN
    -- NOT NULL con DEFAULT -> las filas existentes quedan como 'CHECKER'.
    ALTER TABLE dbo.CheckerGrant
        ADD Capability NVARCHAR(20) NOT NULL CONSTRAINT DF_CheckerGrant_Capability DEFAULT 'CHECKER';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_CheckerGrant_Capability' AND parent_object_id = OBJECT_ID('dbo.CheckerGrant'))
BEGIN
    ALTER TABLE dbo.CheckerGrant
        ADD CONSTRAINT CK_CheckerGrant_Capability CHECK (Capability IN ('CHECKER', 'SUPERVISOR'));
END
GO

SELECT Capability, COUNT(*) AS N FROM dbo.CheckerGrant GROUP BY Capability;
