-- 012_audit_log.sql
-- FASE C: bitácora de acciones administrativas sensibles. NUNCA guarda secretos
-- (contraseñas/hashes, access/refresh tokens, OTP, resetToken). Idempotente.
--
-- ROLLBACK: DROP TABLE UNIPASS.AuditLog;

IF OBJECT_ID('UNIPASS.AuditLog','U') IS NULL
CREATE TABLE UNIPASS.AuditLog (
    Id             INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_AuditLog PRIMARY KEY,
    FechaHora      DATETIME NOT NULL CONSTRAINT DF_AuditLog_Fecha DEFAULT (GETDATE()),
    ActorIdLogin   INT NULL,               -- IdLogin real del actor (del token)
    ActorMatricula VARCHAR(15) NULL,
    Capability     NVARCHAR(20) NULL,      -- capability usada (p.ej. SUPERADMIN)
    Permission     NVARCHAR(40) NULL,      -- permiso concreto (p.ej. PERMISSIONS_MANAGE)
    Accion         NVARCHAR(60) NOT NULL,  -- p.ej. AUTHORIZE_PERMISSION
    Recurso        NVARCHAR(40) NULL,      -- tipo de recurso (Permission, User, ...)
    RecursoId      NVARCHAR(40) NULL,
    Resultado      NVARCHAR(12) NOT NULL,  -- SUCCESS | DENIED | ERROR
    DatosAntes     NVARCHAR(MAX) NULL,     -- json (sin secretos)
    DatosDespues   NVARCHAR(MAX) NULL,     -- json (sin secretos)
    Ip             VARCHAR(45) NULL,
    Endpoint       NVARCHAR(120) NULL,
    Metodo         VARCHAR(10) NULL,
    Contexto       NVARCHAR(300) NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_AuditLog_Actor_Fecha' AND object_id=OBJECT_ID('UNIPASS.AuditLog'))
    CREATE NONCLUSTERED INDEX IX_AuditLog_Actor_Fecha ON UNIPASS.AuditLog (ActorIdLogin, FechaHora);
GO

SELECT COUNT(*) AS AuditRows FROM UNIPASS.AuditLog;
