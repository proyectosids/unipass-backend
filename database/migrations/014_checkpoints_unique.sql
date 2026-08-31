-- Migracion 014 - Checks Hardening C1: UNIQUE (IdPermission, IdPoint, Accion) en CheckPoints.
-- Clave NATURAL correcta: cada Point aparece 2 veces por permiso (SALIDA y RETORNO), por lo que
-- UNIQUE(IdPermission, IdPoint) seria incorrecto. Da idempotencia a la creacion server-side (Opcion B).
--
-- SEGURA / NO destructiva: verifica duplicados ANTES de crear la constraint. Si existe algun duplicado
-- por (IdPermission, IdPoint, Accion), ABORTA sin borrar ni modificar datos (hay que revisarlos a mano).
--
-- Rollback: DROP INDEX UX_CheckPoints_Permission_Point_Accion ON UNIPASS.CheckPoints;

IF EXISTS (
    SELECT 1 FROM UNIPASS.CheckPoints
    GROUP BY IdPermission, IdPoint, Accion
    HAVING COUNT(*) > 1
)
BEGIN
    RAISERROR('MIGRACION 014 ABORTADA: hay duplicados (IdPermission,IdPoint,Accion) en UNIPASS.CheckPoints. NO se aplico la constraint y NO se borro nada. Revisar/limpiar manualmente antes de reintentar.', 16, 1);
    RETURN;
END

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UX_CheckPoints_Permission_Point_Accion'
      AND object_id = OBJECT_ID('UNIPASS.CheckPoints')
)
BEGIN
    CREATE UNIQUE INDEX UX_CheckPoints_Permission_Point_Accion
        ON UNIPASS.CheckPoints (IdPermission, IdPoint, Accion);
    PRINT 'Migracion 014: UNIQUE index UX_CheckPoints_Permission_Point_Accion creado.';
END
ELSE
    PRINT 'Migracion 014: el index UX_CheckPoints_Permission_Point_Accion ya existe (no-op).';
