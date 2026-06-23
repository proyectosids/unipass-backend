-- =============================================================================
-- 002_migrate_checkers.sql   *** REVISAR ANTES DE EJECUTAR ***
--
-- Migra las cuentas-checker dedicadas (TipoUser = 'DEPARTAMENTO') al nuevo modelo
-- CheckerGrant, otorgando la capability a la PERSONA REAL correspondiente.
--
-- Heuristico de mapeo (verificado en datos reales): la Matricula de la cuenta
-- DEPARTAMENTO es 'MTR' + la matricula de la persona real. El campo Correo de la
-- cuenta DEPARTAMENTO es el correo del ENCARGADO que la creo (no la persona real),
-- por eso NO sirve para mapear.
--
-- El IdPoint y el AsignadoPor NO son derivables de los datos -> se definen a mano.
-- Las secciones (a)/(b) son diagnostico (solo lectura). La seccion (c) inserta.
--
-- Prerrequisito: haber corrido 001_checker_grant.sql.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- (a) CANDIDATOS MAPEABLES
--     DEPARTAMENTO.Matricula = 'MTR' + persona_real.Matricula
-- ---------------------------------------------------------------------------
SELECT
    dep.IdLogin    AS IdLogin_Departamento,
    dep.Matricula  AS Matricula_Departamento,
    real_.IdLogin  AS IdLogin_PersonaReal,    -- <- usar este en el INSERT
    real_.Matricula AS Matricula_PersonaReal,
    real_.TipoUser AS TipoUser_PersonaReal,
    real_.Dormitorio
FROM LoginUniPass dep
INNER JOIN LoginUniPass real_
        ON dep.Matricula = 'MTR' + real_.Matricula
       AND real_.TipoUser IN ('ALUMNO', 'EMPLEADO')
WHERE dep.TipoUser = 'DEPARTAMENTO'
ORDER BY dep.Matricula;

-- ---------------------------------------------------------------------------
-- (b) NO MAPEABLES
--     Cuentas DEPARTAMENTO sin persona real (no existe 'MTR' sin prefijo).
--     Requieren decision manual.
-- ---------------------------------------------------------------------------
SELECT
    dep.IdLogin,
    dep.Matricula,
    dep.Correo,
    dep.Nombre,
    dep.Apellidos
FROM LoginUniPass dep
WHERE dep.TipoUser = 'DEPARTAMENTO'
  AND NOT EXISTS (
      SELECT 1 FROM LoginUniPass real_
      WHERE dep.Matricula = 'MTR' + real_.Matricula
        AND real_.TipoUser IN ('ALUMNO', 'EMPLEADO')
  )
ORDER BY dep.Matricula;

-- ---------------------------------------------------------------------------
-- (c) MIGRACION APROBADA (idempotente)
--     MTR221068 -> persona real IdLogin 1 (ALUMNO 221068)
--       IdPoint = 3 (Dormitorio, IdExit 2), Scope = AMBOS, AsignadoPor = 3 (PRECEPTOR mat 41)
--     MTR221238 -> OMITIDA (matricula 221238 no existe como persona real).
-- ---------------------------------------------------------------------------
INSERT INTO CheckerGrant (IdLogin, IdPoint, Scope, AsignadoPor, Vigencia, FechaExpira)
SELECT 1, 3, 'AMBOS', 3, 'PERMANENTE', NULL
WHERE NOT EXISTS (
    SELECT 1 FROM CheckerGrant WHERE IdLogin = 1 AND IdPoint = 3
);
