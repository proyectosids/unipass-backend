export const createChecksPermissionQuery = `
INSERT INTO CheckPoints (Estatus, Accion, IdPoint, IdPermission)
VALUES (@StatusCheck, @Accion, @IdPoint, @IdPermission);
SELECT SCOPE_IDENTITY() AS IdCheck;
`;

export const getChecksDormitorioQuery = `
SELECT Permission.*, TypeExit.*, LoginUniPass.*, CheckPoints.*, Point.*
FROM Permission
JOIN TypeExit ON Permission.IdTipoSalida = TypeExit.IdTypeExit
JOIN LoginUniPass ON Permission.IdUser = LoginUniPass.IdLogin
JOIN CheckPoints ON Permission.IdPermission = CheckPoints.IdPermission
JOIN Point ON CheckPoints.IdPoint = Point.IdPoint
WHERE Permission.StatusPermission = 'Aprobada'
  AND Point.NombrePunto = 'Dormitorio'
  AND CheckPoints.Estatus = 'Pendiente'
  AND Accion = 'SALIDA'
  AND LoginUniPass.Dormitorio = @Dormitorio
  AND CONVERT(DATE, Permission.FechaSalida) <= CONVERT(DATE, GETDATE());
`;

export const getChecksDormitorioFinalQuery = `
WITH OrderedCheckPoints AS (
  SELECT CheckPoints.*,
         ROW_NUMBER() OVER (PARTITION BY IdPermission ORDER BY FechaCheck) AS CheckNumber
  FROM CheckPoints
)
SELECT Permission.*, TypeExit.*, LoginUniPass.*, CheckPoints.*, Point.*
FROM Permission
JOIN TypeExit ON Permission.IdTipoSalida = TypeExit.IdTypeExit
JOIN LoginUniPass ON Permission.IdUser = LoginUniPass.IdLogin
JOIN CheckPoints ON Permission.IdPermission = CheckPoints.IdPermission
JOIN Point ON CheckPoints.IdPoint = Point.IdPoint
WHERE Permission.StatusPermission = 'Aprobada'
  AND Point.NombrePunto = 'Dormitorio'
  AND LoginUniPass.Dormitorio = @Dormitorio
  AND CheckPoints.Estatus = 'Pendiente'
  AND CheckPoints.Accion = 'RETORNO'
  AND EXISTS (
      SELECT 1
      FROM OrderedCheckPoints AS SubCheck
      WHERE SubCheck.IdPermission = Permission.IdPermission
        AND SubCheck.CheckNumber = 2
        AND SubCheck.Estatus = 'Confirmada'
  )
  AND EXISTS (
      SELECT 1
      FROM OrderedCheckPoints AS SubCheck
      WHERE SubCheck.IdPermission = Permission.IdPermission
        AND SubCheck.CheckNumber = 3
        AND SubCheck.Estatus = 'Confirmada'
  );
`;

export const getChecksVigilanciaQuery = `
SELECT Permission.*, TypeExit.*, LoginUniPass.*, CheckPoints.*, Point.*
FROM Permission
JOIN TypeExit ON Permission.IdTipoSalida = TypeExit.IdTypeExit
JOIN LoginUniPass ON Permission.IdUser = LoginUniPass.IdLogin
JOIN CheckPoints ON Permission.IdPermission = CheckPoints.IdPermission
JOIN Point ON CheckPoints.IdPoint = Point.IdPoint
WHERE 
  Permission.StatusPermission = @StatusPermission
  AND Point.NombrePunto = @PuntoName
  AND CheckPoints.Estatus = @CheckEstado
  AND CheckPoints.Accion = 'SALIDA'
  AND EXISTS (
      SELECT 1
      FROM CheckPoints AS SubCheck
      WHERE SubCheck.IdPermission = Permission.IdPermission
        AND SubCheck.Estatus = 'Confirmada'
        AND SubCheck.FechaCheck = (
            SELECT MIN(FechaCheck)
            FROM CheckPoints AS FirstCheck
            WHERE FirstCheck.IdPermission = SubCheck.IdPermission
        )
  );
`;

export const getChecksVigilanciaRegresoQuery = `
SELECT 
  Permission.*, TypeExit.*, LoginUniPass.*, CheckPoints.*, Point.*
FROM Permission
JOIN TypeExit ON Permission.IdTipoSalida = TypeExit.IdTypeExit
JOIN LoginUniPass ON Permission.IdUser = LoginUniPass.IdLogin
JOIN CheckPoints ON Permission.IdPermission = CheckPoints.IdPermission
JOIN Point ON CheckPoints.IdPoint = Point.IdPoint
WHERE 
  Permission.StatusPermission = @StatusPermission
  AND Point.NombrePunto = @PuntoName
  AND CheckPoints.Estatus = @CheckEstado
  AND CheckPoints.Accion = 'RETORNO'
  AND EXISTS (
      SELECT 1
      FROM CheckPoints AS SubCheck
      JOIN Point AS SubPoint ON SubCheck.IdPoint = SubPoint.IdPoint
      WHERE 
          SubCheck.IdPermission = Permission.IdPermission
          AND SubPoint.NombrePunto = 'Caseta'
          AND SubCheck.Estatus = 'Confirmada'
          AND SubCheck.Accion = 'SALIDA'
  );
`;

export const putCheckPointQuery = `
UPDATE CheckPoints
SET FechaCheck = @FechaCheck,
    Estatus = @Estatus,
    Observaciones = @Observaciones
WHERE IdCheck = @IdCheck;
`;