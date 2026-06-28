-- =============================================================================
-- 004_checkergrant_tipo.sql
-- Feature: Checador por TIPO de punto (Dormitorio/Caseta) en vez de por IdPoint.
--
-- - Agrega CheckerGrant.Tipo ('Dormitorio'|'Caseta') e IdDormitorio (INT NULL).
-- - Backfill de grants viejos: Tipo desde el NombrePunto del IdPoint; para
--   Dormitorio, IdDormitorio desde el Dormitorio del que asigno (AsignadoPor).
-- - IdPoint pasa a NULL-able (deja de usarse en inserts nuevos; se conserva).
-- - Reemplaza UNIQUE(IdLogin, IdPoint) por UNIQUE(IdLogin, Tipo, IdDormitorio).
--
-- IMPORTANTE: el ADD de columnas va en su PROPIO batch (GO). Las sentencias que
-- referencian Tipo/IdDormitorio se compilan despues, ya con las columnas creadas.
-- Idempotente: se puede reejecutar sin error.
-- Prerrequisito: 001_checker_grant.sql.
-- =============================================================================

-- (1) Columnas nuevas (batch propio) -----------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE name='Tipo' AND object_id=OBJECT_ID('dbo.CheckerGrant'))
    ALTER TABLE dbo.CheckerGrant ADD Tipo NVARCHAR(12) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE name='IdDormitorio' AND object_id=OBJECT_ID('dbo.CheckerGrant'))
    ALTER TABLE dbo.CheckerGrant ADD IdDormitorio INT NULL;
GO

-- (2) CHECK de Tipo (ya existe la columna) -----------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name='CK_CheckerGrant_Tipo')
    ALTER TABLE dbo.CheckerGrant
        ADD CONSTRAINT CK_CheckerGrant_Tipo CHECK (Tipo IS NULL OR Tipo IN ('Dormitorio','Caseta'));
GO

-- (3) Backfill de grants existentes ------------------------------------------
UPDATE cg
SET Tipo = p.NombrePunto,
    IdDormitorio = CASE WHEN p.NombrePunto = 'Dormitorio' THEN asg.Dormitorio END
FROM dbo.CheckerGrant cg
JOIN dbo.Point p          ON p.IdPoint   = cg.IdPoint
JOIN dbo.LoginUniPass asg ON asg.IdLogin = cg.AsignadoPor
WHERE cg.Tipo IS NULL;
GO

-- (4) IdPoint NULL-able (ya no se usa al insertar) ---------------------------
IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE name='IdPoint' AND object_id=OBJECT_ID('dbo.CheckerGrant') AND is_nullable = 0
)
    ALTER TABLE dbo.CheckerGrant ALTER COLUMN IdPoint INT NULL;
GO

-- (5) Reemplazar unicidad: (IdLogin,IdPoint) -> (IdLogin,Tipo,IdDormitorio) ---
IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE name='UQ_CheckerGrant_Login_Point')
    ALTER TABLE dbo.CheckerGrant DROP CONSTRAINT UQ_CheckerGrant_Login_Point;
GO
IF NOT EXISTS (SELECT 1 FROM sys.key_constraints WHERE name='UQ_CheckerGrant_Tipo_Dorm')
    ALTER TABLE dbo.CheckerGrant
        ADD CONSTRAINT UQ_CheckerGrant_Tipo_Dorm UNIQUE (IdLogin, Tipo, IdDormitorio);
GO
