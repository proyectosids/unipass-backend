-- 011_capability_grant.sql
-- FASE C del nuevo modelo de autorización. Tabla GENERICA de grants de capability
-- (CHECKER/SUPERVISOR/ADMIN/SUPERADMIN) con scope (SELF/DORMITORIO/GLOBAL). Reemplaza
-- conceptualmente el uso de CheckerGrant como fuente de capabilities, PERO no la elimina:
-- CheckerGrant sigue viva para (a) la confirmación de checks (PUT /checks/:id) y (b) la
-- respuesta capabilities[] que consume Flutter. Aquí solo se COPIAN los grants CHECKER/
-- SUPERVISOR activos para la nueva maquinaria (requirePermission/scope).
-- Idempotente. NO otorga ADMIN ni SUPERADMIN a nadie (eso es aparte y manual).
--
-- ROLLBACK: DROP TABLE UNIPASS.CapabilityGrant;  (no afecta CheckerGrant ni datos existentes)

IF OBJECT_ID('UNIPASS.CapabilityGrant','U') IS NULL
CREATE TABLE UNIPASS.CapabilityGrant (
    IdGrant    INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_CapabilityGrant PRIMARY KEY,
    IdLogin    INT NOT NULL CONSTRAINT FK_CapabilityGrant_Login REFERENCES UNIPASS.LoginUniPass(IdLogin),
    Capability NVARCHAR(20) NOT NULL CONSTRAINT CK_CapabilityGrant_Cap
        CHECK (Capability IN ('CHECKER','SUPERVISOR','ADMIN','SUPERADMIN')),
    ScopeType  NVARCHAR(12) NOT NULL CONSTRAINT CK_CapabilityGrant_Scope
        CHECK (ScopeType IN ('SELF','DORMITORIO','GLOBAL')),
    ScopeId    INT NULL,   -- p.ej. IdDormitorio cuando ScopeType='DORMITORIO'
    Activo     BIT NOT NULL CONSTRAINT DF_CapabilityGrant_Activo DEFAULT (1),
    GrantedBy  INT NULL CONSTRAINT FK_CapabilityGrant_GrantedBy REFERENCES UNIPASS.LoginUniPass(IdLogin),
    CreatedAt  DATETIME NOT NULL CONSTRAINT DF_CapabilityGrant_Created DEFAULT (GETDATE()),
    RevokedAt  DATETIME NULL
);
GO

-- Índice para lookups por usuario (grants vigentes).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_CapabilityGrant_Login' AND object_id=OBJECT_ID('UNIPASS.CapabilityGrant'))
    CREATE NONCLUSTERED INDEX IX_CapabilityGrant_Login ON UNIPASS.CapabilityGrant (IdLogin, Activo) INCLUDE (Capability, ScopeType, ScopeId, RevokedAt);
GO

-- Copia idempotente de grants ACTIVOS de CheckerGrant -> CapabilityGrant.
--  SUPERVISOR -> ScopeType GLOBAL (solo lectura global).
--  CHECKER Tipo='Dormitorio' -> ScopeType DORMITORIO, ScopeId=IdDormitorio.
--  CHECKER Tipo='Caseta'/NULL -> ScopeType GLOBAL (cubre toda caseta).
INSERT INTO UNIPASS.CapabilityGrant (IdLogin, Capability, ScopeType, ScopeId, Activo, GrantedBy, CreatedAt)
SELECT cg.IdLogin,
       cg.Capability,
       CASE WHEN cg.Capability='SUPERVISOR' THEN 'GLOBAL'
            WHEN cg.Tipo='Dormitorio' THEN 'DORMITORIO'
            ELSE 'GLOBAL' END,
       CASE WHEN cg.Capability='CHECKER' AND cg.Tipo='Dormitorio' THEN cg.IdDormitorio ELSE NULL END,
       1, cg.AsignadoPor, cg.FechaCreacion
FROM UNIPASS.CheckerGrant cg
WHERE cg.Activo = 1
  AND cg.Capability IN ('CHECKER','SUPERVISOR')
  AND NOT EXISTS (
      SELECT 1 FROM UNIPASS.CapabilityGrant x
      WHERE x.IdLogin = cg.IdLogin AND x.Capability = cg.Capability
        AND x.ScopeType = CASE WHEN cg.Capability='SUPERVISOR' THEN 'GLOBAL'
                               WHEN cg.Tipo='Dormitorio' THEN 'DORMITORIO' ELSE 'GLOBAL' END
        AND ISNULL(x.ScopeId,-1) = ISNULL(CASE WHEN cg.Capability='CHECKER' AND cg.Tipo='Dormitorio' THEN cg.IdDormitorio ELSE NULL END, -1)
  );
GO

SELECT Capability, ScopeType, COUNT(*) AS n FROM UNIPASS.CapabilityGrant GROUP BY Capability, ScopeType ORDER BY Capability;
