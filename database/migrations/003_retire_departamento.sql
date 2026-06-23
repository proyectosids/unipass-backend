-- =============================================================================
-- 003_retire_departamento.sql   *** REVISAR ANTES DE EJECUTAR -- por fases ***
--
-- Retira las cuentas-checker dedicadas viejas (TipoUser='DEPARTAMENTO') ya
-- migradas a CheckerGrant. Pensado para correrse en DOS fases:
--   Fase 2a (este script tal cual): DESACTIVA (reversible).
--   Fase 2b (descomentar el DELETE): BORRA definitivamente, tras el periodo de
--           gracia y solo si no hay referencias.
--
-- Cuentas objetivo (test/datos actuales): IdLogin 2035 (MTR221068), 2063 (MTR221238).
-- Ajusta el filtro si en produccion hay mas cuentas DEPARTAMENTO a retirar.
--
-- Prerrequisito: migracion 002 aplicada (los checkers ya viven como CheckerGrant).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- (diag) Referencias actuales de las cuentas objetivo (debe ser todo 0 para borrar)
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM CheckerGrant WHERE IdLogin IN (2035,2063) OR AsignadoPor IN (2035,2063)) AS CheckerGrant,
    (SELECT COUNT(*) FROM CheckPoints  WHERE ConfirmadoPor IN (2035,2063))                          AS CheckPoints,
    (SELECT COUNT(*) FROM Doctos       WHERE IdLogin IN (2035,2063))                                AS Doctos,
    (SELECT COUNT(*) FROM Permission   WHERE IdUser IN (2035,2063))                                 AS Permission,
    (SELECT COUNT(*) FROM RefreshToken WHERE IdLogin IN (2035,2063))                                AS RefreshToken;

-- ---------------------------------------------------------------------------
-- Fase 2a: DESACTIVAR (reversible). Revertir con SET StatusActividad = 1.
-- ---------------------------------------------------------------------------
UPDATE LoginUniPass
SET StatusActividad = 0
WHERE IdLogin IN (2035, 2063)
  AND TipoUser = 'DEPARTAMENTO';

-- ---------------------------------------------------------------------------
-- Fase 2b: BORRADO DEFINITIVO (descomentar tras el periodo de gracia).
--   El guard NOT EXISTS evita borrar si surgio alguna referencia; idempotente.
-- ---------------------------------------------------------------------------
/*
DELETE FROM LoginUniPass
WHERE IdLogin IN (2035, 2063)
  AND TipoUser = 'DEPARTAMENTO'
  AND NOT EXISTS (SELECT 1 FROM CheckerGrant cg WHERE cg.IdLogin = LoginUniPass.IdLogin OR cg.AsignadoPor = LoginUniPass.IdLogin)
  AND NOT EXISTS (SELECT 1 FROM CheckPoints  cp WHERE cp.ConfirmadoPor = LoginUniPass.IdLogin)
  AND NOT EXISTS (SELECT 1 FROM Doctos       d  WHERE d.IdLogin = LoginUniPass.IdLogin)
  AND NOT EXISTS (SELECT 1 FROM Permission   p  WHERE p.IdUser = LoginUniPass.IdLogin)
  AND NOT EXISTS (SELECT 1 FROM RefreshToken rt WHERE rt.IdLogin = LoginUniPass.IdLogin);
*/
