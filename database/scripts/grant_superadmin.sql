-- grant_superadmin.sql — Otorgar la capability SUPERADMIN a UNA cuenta.
-- ⚠️ NO ejecutar automáticamente. Requiere autorización explícita y editar @IdLogin.
--    SUPERADMIN NO es TipoUser, NO se obtiene por /register, y no hay API para otorgarlo:
--    el primer SUPERADMIN se crea SOLO con este script controlado.
--
-- Uso:
--   1) Averigua el IdLogin destino:  SELECT IdLogin, Matricula, Nombre, TipoUser FROM UNIPASS.LoginUniPass WHERE Matricula = '<mat>';
--   2) Reemplaza @IdLogin abajo.
--   3) Ejecuta este script (SSMS o node scripts/run-sql.js database/scripts/grant_superadmin.sql).
-- Idempotente: si ya existe un SUPERADMIN activo para esa cuenta, no duplica.
-- Rollback: UPDATE UNIPASS.CapabilityGrant SET Activo=0, RevokedAt=GETDATE() WHERE IdLogin=@IdLogin AND Capability='SUPERADMIN';

DECLARE @IdLogin INT = NULL;   -- <-- PON AQUI el IdLogin destino. Con NULL, el script no hace nada.

IF @IdLogin IS NULL
BEGIN
    PRINT 'Sin @IdLogin: no se otorgo SUPERADMIN (editar el script).';
    RETURN;
END

IF NOT EXISTS (SELECT 1 FROM UNIPASS.LoginUniPass WHERE IdLogin = @IdLogin)
BEGIN
    RAISERROR('IdLogin no existe en LoginUniPass.', 16, 1);
    RETURN;
END

IF NOT EXISTS (
    SELECT 1 FROM UNIPASS.CapabilityGrant
    WHERE IdLogin = @IdLogin AND Capability = 'SUPERADMIN' AND Activo = 1 AND RevokedAt IS NULL
)
BEGIN
    INSERT INTO UNIPASS.CapabilityGrant (IdLogin, Capability, ScopeType, ScopeId, Activo, GrantedBy)
    VALUES (@IdLogin, 'SUPERADMIN', 'GLOBAL', NULL, 1, @IdLogin);
    PRINT 'SUPERADMIN otorgado a IdLogin ' + CAST(@IdLogin AS VARCHAR(10));
END
ELSE
    PRINT 'La cuenta ya tiene SUPERADMIN activo; no se duplica.';
GO
