export const getPermissionsByUserQuery = `
SELECT * FROM Permission 
JOIN TypeExit ON Permission.IdTipoSalida = TypeExit.IdTypeExit 
JOIN LoginUniPass ON Permission.IdUser = LoginUniPass.IdLogin 
WHERE IdLogin = @Id
ORDER BY Permission.FechaSolicitada DESC
OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY
`;

export const countPermissionsByUserQuery = `
SELECT COUNT(*) as TotalPermissions FROM Permission 
WHERE IdUser = @Id
`;

export const getPermissionForAutorizacionPreceQuery = `
                SELECT Permission.*, TypeExit.*, LoginUniPass.* 
                FROM Permission 
                INNER JOIN Authorize ON Permission.IdPermission = Authorize.IdPermission 
                JOIN TypeExit ON Permission.IdTipoSalida = TypeExit.IdTypeExit 
                JOIN LoginUniPass ON Permission.IdUser = LoginUniPass.IdLogin 
                WHERE Authorize.IdEmpleado = @Id 
                AND Permission.IdPermission IN (
                    SELECT A1.IdPermission 
                    FROM Authorize A1 
                    GROUP BY A1.IdPermission 
                    HAVING COUNT(A1.IdAuthorize) = 1
                )
                AND Permission.FechaSalida BETWEEN DATEADD(DAY, -30, GETDATE()) AND DATEADD(DAY, 15, GETDATE())

                UNION

                SELECT Permission.*, TypeExit.*, LoginUniPass.* 
                FROM Permission 
                INNER JOIN Authorize ON Permission.IdPermission = Authorize.IdPermission 
                JOIN TypeExit ON Permission.IdTipoSalida = TypeExit.IdTypeExit 
                JOIN LoginUniPass ON Permission.IdUser = LoginUniPass.IdLogin 
                WHERE Authorize.IdEmpleado = @Id 
                AND Permission.IdPermission IN (
                    SELECT A1.IdPermission 
                    FROM Authorize A1 
                    WHERE A1.StatusAuthorize = 'Aprobada' 
                    AND A1.IdAuthorize = (
                        SELECT TOP 1 A2.IdAuthorize 
                        FROM Authorize A2 
                        WHERE A2.IdPermission = A1.IdPermission 
                        ORDER BY A2.IdAuthorize
                    )
                )
                AND Permission.FechaSalida BETWEEN DATEADD(DAY, -30, GETDATE()) AND DATEADD(DAY, 15, GETDATE());`;

export const getPermissionForAutorizacionQuery = `
                SELECT Permission.*, TypeExit.*, LoginUniPass.* 
                FROM Permission 
                INNER JOIN Authorize ON Permission.IdPermission = Authorize.IdPermission 
                JOIN TypeExit ON Permission.IdTipoSalida = TypeExit.IdTypeExit 
                JOIN LoginUniPass ON Permission.IdUser = LoginUniPass.IdLogin 
                WHERE Authorize.IdEmpleado = @Id 
                AND Permission.FechaSalida BETWEEN DATEADD(DAY, -30, GETDATE()) AND DATEADD(DAY, 15, GETDATE());
`;

export const checkUserExistsQuery = `
SELECT 1 FROM dbo.LoginUniPass WHERE IdLogin = @IdUser
`;

export const createPermissionQuery = `
                INSERT INTO Permission 
                (FechaSolicitada, StatusPermission, FechaSalida, FechaRegreso, Motivo, IdUser, IdTipoSalida, Observaciones)
                VALUES 
                (@FechaSolicitada, @StatusPermission, @FechaSalida, @FechaRegreso, @Motivo, @IdUser, @IdTipoSalida, @Observaciones);
                SELECT SCOPE_IDENTITY() AS IdPermission;
`;

export const deletePermissionQuery = `
DELETE FROM Permission WHERE IdPermission = @Id
`;

export const cancelPermissionQuery = `
UPDATE Permission SET StatusPermission = @StatusPermission WHERE IdPermission = @Id
`;

export const autorizarPermisoQuery = `
UPDATE Permission 
SET StatusPermission = @StatusPermission, Observaciones = @Observaciones 
WHERE IdPermission = @IdPermiso
`;

export const topPermissionStudentQuery = `
SELECT TOP 10 * 
FROM Permission 
WHERE IdUser = @IdLogin 
ORDER BY FechaSolicitada DESC
`;

export const topPermissionEmployeeQuery = `
                SELECT TOP 10 Permission.*, TypeExit.*, LoginUniPass.* 
                FROM Permission 
                INNER JOIN Authorize ON Permission.IdPermission = Authorize.IdPermission 
                JOIN TypeExit ON Permission.IdTipoSalida = TypeExit.IdTypeExit 
                JOIN LoginUniPass ON Permission.IdUser = LoginUniPass.IdLogin 
                WHERE Authorize.IdEmpleado = @Matricula 
                ORDER BY Permission.FechaSolicitada DESC
`;

export const topPermissionPreceQuery = `
                SELECT TOP 10 *
                FROM (
                    SELECT Permission.*, TypeExit.*, LoginUniPass.* FROM Permission 
                    INNER JOIN Authorize ON Permission.IdPermission = Authorize.IdPermission 
                    JOIN TypeExit ON Permission.IdTipoSalida = TypeExit.IdTypeExit 
                    JOIN LoginUniPass ON Permission.IdUser = LoginUniPass.IdLogin 
                    WHERE Authorize.IdEmpleado = @Matricula 
                    AND Permission.IdPermission IN (
                        SELECT A1.IdPermission 
                        FROM Authorize A1 
                        GROUP BY A1.IdPermission 
                        HAVING COUNT(A1.IdAuthorize) = 1
                    )
                    UNION
                    SELECT Permission.*, TypeExit.*, LoginUniPass.* FROM Permission 
                    INNER JOIN Authorize ON Permission.IdPermission = Authorize.IdPermission 
                    JOIN TypeExit ON Permission.IdTipoSalida = TypeExit.IdTypeExit 
                    JOIN LoginUniPass ON Permission.IdUser = LoginUniPass.IdLogin 
                    WHERE Authorize.IdEmpleado = @Matricula  
                    AND Permission.IdPermission IN (
                        SELECT A1.IdPermission 
                        FROM Authorize A1 
                        WHERE A1.StatusAuthorize = 'Aprobada' 
                        AND A1.IdAuthorize = (
                            SELECT TOP 1 A2.IdAuthorize 
                            FROM Authorize A2 
                            WHERE A2.IdPermission = A1.IdPermission 
                            ORDER BY A2.IdAuthorize
                        )
                    )
                ) AS CombinedResults
                ORDER BY FechaSolicitada DESC;
`;

export const dashboardPermissionQuery = `
                    WITH PermisosFiltrados AS (
                    SELECT P.*, T.*, L.*
                    FROM Permission P
                    INNER JOIN Authorize A ON P.IdPermission = A.IdPermission
                    JOIN TypeExit T ON P.IdTipoSalida = T.IdTypeExit
                    JOIN LoginUniPass L ON P.IdUser = L.IdLogin
                    WHERE A.IdEmpleado = @Matricula
                    AND P.IdPermission IN (
                        SELECT A1.IdPermission
                        FROM Authorize A1
                        GROUP BY A1.IdPermission
                        HAVING COUNT(A1.IdAuthorize) = 1
                    )
                    UNION
                    SELECT P.*, T.*, L.*
                    FROM Permission P
                    INNER JOIN Authorize A ON P.IdPermission = A.IdPermission
                    JOIN TypeExit T ON P.IdTipoSalida = T.IdTypeExit
                    JOIN LoginUniPass L ON P.IdUser = L.IdLogin
                    WHERE A.IdEmpleado = @Matricula
                    AND P.IdPermission IN (
                        SELECT A1.IdPermission
                        FROM Authorize A1
                        WHERE A1.StatusAuthorize = 'Aprobada'
                        AND A1.IdAuthorize = (
                            SELECT TOP 1 A2.IdAuthorize
                            FROM Authorize A2
                            WHERE A2.IdPermission = A1.IdPermission
                            ORDER BY A2.IdAuthorize
                        )
                    )
                ),
                Conteo AS (
                    SELECT StatusPermission, COUNT(*) AS Cantidad
                    FROM PermisosFiltrados
                    GROUP BY StatusPermission
                    UNION ALL
                    SELECT 'TOTAL', COUNT(*) FROM PermisosFiltrados
                )
                SELECT 
                    ISNULL([Aprobada], 0) AS Aprobadas,
                    ISNULL([Rechazada], 0) AS Rechazadas,
                    ISNULL([Pendiente], 0) AS Pendientes,
                    ISNULL([TOTAL], 0) AS Total
                FROM Conteo
                PIVOT (
                    SUM(Cantidad)
                    FOR StatusPermission IN ([Aprobada], [Rechazada], [Pendiente], [TOTAL])
                ) AS ConteoPivot;
`;

export const dashboardDocumentosQuery = `
                SELECT
                  COUNT(*) AS Total,
                  SUM(CASE WHEN d.StatusRevision = 'Aprobado' THEN 1 ELSE 0 END) AS Aprobado,
                  SUM(CASE WHEN d.StatusRevision = 'Pendiente' THEN 1 ELSE 0 END) AS Pendiente
                FROM Doctos d
                JOIN LoginUniPass a ON d.IdLogin = a.IdLogin
                WHERE a.TipoUser = 'ALUMNO'
                  AND a.Dormitorio = (
                    SELECT Dormitorio
                    FROM LoginUniPass
                    WHERE Matricula = @Matricula AND TipoUser = 'PRECEPTOR'
                  );
`;

export const filtrarPermisosQuery = `
                    WITH PermisosFiltrados AS (
                    SELECT P.*, T.*, L.*
                    FROM Permission P
                    INNER JOIN Authorize A ON P.IdPermission = A.IdPermission
                    JOIN TypeExit T ON P.IdTipoSalida = T.IdTypeExit
                    JOIN LoginUniPass L ON P.IdUser = L.IdLogin
                    WHERE A.IdEmpleado = @IdEmpleado
                    AND P.IdPermission IN (
                        SELECT A1.IdPermission
                        FROM Authorize A1
                        GROUP BY A1.IdPermission
                        HAVING COUNT(A1.IdAuthorize) = 1
                    )
                    UNION
                    SELECT P.*, T.*, L.*
                    FROM Permission P
                    INNER JOIN Authorize A ON P.IdPermission = A.IdPermission
                    JOIN TypeExit T ON P.IdTipoSalida = T.IdTypeExit
                    JOIN LoginUniPass L ON P.IdUser = L.IdLogin
                    WHERE A.IdEmpleado = @IdEmpleado
                    AND P.IdPermission IN (
                        SELECT A1.IdPermission
                        FROM Authorize A1
                        WHERE A1.StatusAuthorize = 'Aprobada'
                        AND A1.IdAuthorize = (
                            SELECT TOP 1 A2.IdAuthorize
                            FROM Authorize A2
                            WHERE A2.IdPermission = A1.IdPermission
                            ORDER BY A2.IdAuthorize
                        )
                    )
                )
                SELECT *
                FROM PermisosFiltrados
                WHERE 
                    (@FechaInicio IS NULL OR FechaSalida >= @FechaInicio AND FechaSalida < DATEADD(DAY, 1, @FechaInicio)) AND
                    (@FechaFin IS NULL OR FechaRegreso >= @FechaFin AND FechaRegreso < DATEADD(DAY, 1, @FechaFin)) AND
                    (@Status IS NULL OR StatusPermission = @Status) AND
                    (@Nombre IS NULL OR Nombre LIKE '%' + @Nombre + '%') AND
                    (@Matricula IS NULL OR Matricula LIKE '%' + @Matricula + '%');
`;
