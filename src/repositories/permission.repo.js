import sql from 'mssql';
import { withConnection } from '../database/connection.js';

// === Lecturas ===

export const findPermissionsByUserPaginated = (idUser, page, limit) =>
    withConnection(async (pool) => {
        const offset = (page - 1) * limit;
        const dataResult = await pool.request()
            .input('Id', sql.Int, idUser)
            .input('Limit', sql.Int, parseInt(limit))
            .input('Offset', sql.Int, parseInt(offset))
            .query(`
                SELECT * FROM Permission
                JOIN TypeExit ON Permission.IdTipoSalida = TypeExit.IdTypeExit
                JOIN LoginUniPass ON Permission.IdUser = LoginUniPass.IdLogin
                WHERE IdLogin = @Id
                ORDER BY Permission.FechaSolicitada DESC
                OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY
            `);
        const totalResult = await pool.request()
            .input('Id', sql.Int, idUser)
            .query('SELECT COUNT(*) as TotalPermissions FROM Permission WHERE IdUser = @Id');
        return {
            data: dataResult.recordset,
            totalItems: totalResult.recordset[0].TotalPermissions
        };
    });

export const findPermissionById = (id) =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .input('Id', sql.Int, id)
            .query('SELECT * FROM Permission WHERE IdPermission = @Id');
        return result.recordset[0] || null;
    });

export const userExistsById = (idUser) =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .input('IdUser', sql.Int, idUser)
            .query('SELECT 1 FROM dbo.LoginUniPass WHERE IdLogin = @IdUser');
        return result.recordset.length > 0;
    });

export const findAlumnoBasicByLogin = (idLogin) =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .input('IdUserSocket', sql.Int, idLogin)
            .query('SELECT Matricula, Nombre FROM LoginUniPass WHERE IdLogin = @IdUserSocket');
        return result.recordset[0] || null;
    });

export const findEmpleadosAuthorizeByPermission = (idPermission) =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .input('IdPermissionSocket', sql.Int, idPermission)
            .query('SELECT IdEmpleado FROM Authorize WHERE IdPermission = @IdPermissionSocket');
        return result.recordset;
    });

export const findAlumnoMatriculaByPermission = (idPermission) =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .input('IdPermisoSocket', sql.Int, idPermission)
            .query(`SELECT L.Matricula FROM Permission P
                    JOIN LoginUniPass L ON P.IdUser = L.IdLogin
                    WHERE P.IdPermission = @IdPermisoSocket`);
        return result.recordset[0]?.Matricula || null;
    });

export const findPermissionsForAutorizacionByEmpleado = (idEmpleado) =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .input('Id', sql.Int, idEmpleado)
            .query(`SELECT Permission.*, TypeExit.*, LoginUniPass.*
                    FROM Permission
                    INNER JOIN Authorize ON Permission.IdPermission = Authorize.IdPermission
                    JOIN TypeExit ON Permission.IdTipoSalida = TypeExit.IdTypeExit
                    JOIN LoginUniPass ON Permission.IdUser = LoginUniPass.IdLogin
                    WHERE Authorize.IdEmpleado = @Id
                      AND Permission.FechaSalida BETWEEN DATEADD(DAY, -30, GETDATE()) AND DATEADD(DAY, 15, GETDATE())`);
        return result.recordset;
    });

export const findPermissionsForAutorizacionPreceByEmpleado = (idEmpleado) =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .input('Id', sql.Int, idEmpleado)
            .query(`SELECT Permission.*, TypeExit.*, LoginUniPass.*
                    FROM Permission
                    INNER JOIN Authorize ON Permission.IdPermission = Authorize.IdPermission
                    JOIN TypeExit ON Permission.IdTipoSalida = TypeExit.IdTypeExit
                    JOIN LoginUniPass ON Permission.IdUser = LoginUniPass.IdLogin
                    WHERE Authorize.IdEmpleado = @Id
                      AND Permission.IdPermission IN (
                          SELECT A1.IdPermission FROM Authorize A1
                          GROUP BY A1.IdPermission HAVING COUNT(A1.IdAuthorize) = 1
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
                          SELECT A1.IdPermission FROM Authorize A1
                          WHERE A1.StatusAuthorize = 'Aprobada'
                            AND A1.IdAuthorize = (
                                SELECT TOP 1 A2.IdAuthorize FROM Authorize A2
                                WHERE A2.IdPermission = A1.IdPermission
                                ORDER BY A2.IdAuthorize
                            )
                      )
                      AND Permission.FechaSalida BETWEEN DATEADD(DAY, -30, GETDATE()) AND DATEADD(DAY, 15, GETDATE())`);
        return result.recordset;
    });

export const findTop10PermissionsByStudent = (idLogin) =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .input('IdLogin', sql.Int, idLogin)
            .query('SELECT TOP 10 * FROM Permission WHERE IdUser = @IdLogin ORDER BY FechaSolicitada DESC');
        return result.recordset;
    });

export const findTop10PermissionsByEmployee = (idEmpleado) =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .input('Matricula', sql.Int, idEmpleado)
            .query(`SELECT TOP 10 Permission.*, TypeExit.*, LoginUniPass.*
                    FROM Permission
                    INNER JOIN Authorize ON Permission.IdPermission = Authorize.IdPermission
                    JOIN TypeExit ON Permission.IdTipoSalida = TypeExit.IdTypeExit
                    JOIN LoginUniPass ON Permission.IdUser = LoginUniPass.IdLogin
                    WHERE Authorize.IdEmpleado = @Matricula
                    ORDER BY Permission.FechaSolicitada DESC`);
        return result.recordset;
    });

export const findTop10PermissionsByPrece = (idEmpleado) =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .input('Matricula', sql.Int, idEmpleado)
            .query(`SELECT TOP 10 * FROM (
                        SELECT Permission.*, TypeExit.*, LoginUniPass.* FROM Permission
                        INNER JOIN Authorize ON Permission.IdPermission = Authorize.IdPermission
                        JOIN TypeExit ON Permission.IdTipoSalida = TypeExit.IdTypeExit
                        JOIN LoginUniPass ON Permission.IdUser = LoginUniPass.IdLogin
                        WHERE Authorize.IdEmpleado = @Matricula
                          AND Permission.IdPermission IN (
                              SELECT A1.IdPermission FROM Authorize A1
                              GROUP BY A1.IdPermission HAVING COUNT(A1.IdAuthorize) = 1
                          )

                        UNION

                        SELECT Permission.*, TypeExit.*, LoginUniPass.* FROM Permission
                        INNER JOIN Authorize ON Permission.IdPermission = Authorize.IdPermission
                        JOIN TypeExit ON Permission.IdTipoSalida = TypeExit.IdTypeExit
                        JOIN LoginUniPass ON Permission.IdUser = LoginUniPass.IdLogin
                        WHERE Authorize.IdEmpleado = @Matricula
                          AND Permission.IdPermission IN (
                              SELECT A1.IdPermission FROM Authorize A1
                              WHERE A1.StatusAuthorize = 'Aprobada'
                                AND A1.IdAuthorize = (
                                    SELECT TOP 1 A2.IdAuthorize FROM Authorize A2
                                    WHERE A2.IdPermission = A1.IdPermission
                                    ORDER BY A2.IdAuthorize
                                )
                          )
                    ) AS CombinedResults
                    ORDER BY FechaSolicitada DESC`);
        return result.recordset;
    });

export const findDashboardPermissionCounts = (matriculaPreceptor) =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .input('Matricula', sql.VarChar, matriculaPreceptor)
            .query(`
                WITH EmpleadoDormitorio AS (
                    SELECT TOP 1 Dormitorio AS Dorm FROM LoginUniPass WHERE Matricula = @Matricula
                ),
                PermisosFiltrados AS (
                    SELECT DISTINCT P.IdPermission, P.StatusPermission
                    FROM Permission P
                    INNER JOIN Authorize A ON P.IdPermission = A.IdPermission
                    JOIN LoginUniPass L ON P.IdUser = L.IdLogin
                    CROSS APPLY (SELECT Dorm FROM EmpleadoDormitorio) AS D
                    WHERE
                        (D.Dorm = 5)
                        OR
                        (A.IdEmpleado = @Matricula
                            AND (
                                P.IdPermission IN (
                                    SELECT A1.IdPermission FROM Authorize A1
                                    GROUP BY A1.IdPermission HAVING COUNT(A1.IdAuthorize) = 1
                                )
                                OR P.IdPermission IN (
                                    SELECT A1.IdPermission FROM Authorize A1
                                    WHERE A1.StatusAuthorize = 'Aprobada'
                                    AND A1.IdAuthorize = (
                                        SELECT TOP 1 A2.IdAuthorize FROM Authorize A2
                                        WHERE A2.IdPermission = A1.IdPermission
                                        ORDER BY A2.IdAuthorize
                                    )
                                )
                            )
                        )
                ),
                Conteo AS (
                    SELECT StatusPermission, COUNT(*) AS Cantidad
                    FROM PermisosFiltrados GROUP BY StatusPermission
                    UNION ALL
                    SELECT 'TOTAL', COUNT(*) FROM PermisosFiltrados
                )
                SELECT
                    ISNULL([Aprobada], 0) AS Aprobadas,
                    ISNULL([Rechazada], 0) AS Rechazadas,
                    ISNULL([Pendiente], 0) AS Pendientes,
                    ISNULL([TOTAL], 0) AS Total
                FROM Conteo
                PIVOT (SUM(Cantidad) FOR StatusPermission IN ([Aprobada], [Rechazada], [Pendiente], [TOTAL])) AS ConteoPivot;
            `);
        return result.recordset;
    });

export const findDashboardDocumentosCounts = (matriculaPreceptor) =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .input('Matricula', sql.VarChar, matriculaPreceptor)
            .query(`
                WITH Empleado AS (
                    SELECT Dormitorio, TipoUser FROM LoginUniPass WHERE Matricula = @Matricula
                ),
                Filtrados AS (
                    SELECT d.* FROM Doctos d
                    JOIN LoginUniPass a ON d.IdLogin = a.IdLogin
                    WHERE a.TipoUser = 'ALUMNO'
                      AND (
                          ((SELECT TipoUser FROM Empleado) = 'ADMINISTRATIVO' AND (SELECT Dormitorio FROM Empleado) = 5 AND a.Dormitorio BETWEEN 1 AND 4)
                          OR ((SELECT Dormitorio FROM Empleado) = a.Dormitorio AND (SELECT Dormitorio FROM Empleado) <> 5)
                      )
                )
                SELECT
                    COUNT(*) AS Total,
                    SUM(CASE WHEN StatusRevision = 'Aprobado' THEN 1 ELSE 0 END) AS Aprobado,
                    SUM(CASE WHEN StatusRevision = 'Pendiente' THEN 1 ELSE 0 END) AS Pendiente
                FROM Filtrados;
            `);
        return result.recordset;
    });

export const findUserTipoByMatricula = (matricula) =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .input('MatriculaInput', sql.VarChar(20), matricula)
            .query('SELECT TipoUser FROM LoginUniPass WHERE Matricula = @MatriculaInput');
        return result.recordset[0]?.TipoUser || null;
    });

export const filterPermisosAdministrativo = ({ fechaInicio, fechaFin, status, nombre, matricula, idEmpleado }) =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .input('FechaInicio', sql.Date, fechaInicio || null)
            .input('FechaFin', sql.Date, fechaFin || null)
            .input('Status', sql.VarChar(20), status || null)
            .input('Nombre', sql.VarChar(100), nombre || null)
            .input('Matricula', sql.VarChar(20), matricula || null)
            .input('IdEmpleado', sql.Int, idEmpleado)
            .query(`
                SELECT P.*, T.*, L.*
                FROM Permission P
                INNER JOIN TypeExit T ON P.IdTipoSalida = T.IdTypeExit
                INNER JOIN LoginUniPass L ON P.IdUser = L.IdLogin
                WHERE
                    (@FechaInicio IS NULL OR P.FechaSalida >= @FechaInicio
                                          AND P.FechaSalida <  DATEADD(DAY, 1, @FechaInicio)) AND
                    (@FechaFin IS NULL OR P.FechaRegreso >= @FechaFin
                                       AND P.FechaRegreso <  DATEADD(DAY, 1, @FechaFin)) AND
                    (@Status IS NULL OR P.StatusPermission = @Status) AND
                    (@Nombre IS NULL OR L.Nombre LIKE '%' + @Nombre + '%') AND
                    (@Matricula IS NULL OR L.Matricula LIKE '%' + @Matricula + '%')
                ORDER BY P.FechaSolicitada DESC;
            `);
        return result.recordset;
    });

export const filterPermisosPreceptor = ({ fechaInicio, fechaFin, status, nombre, matricula, idEmpleado }) =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .input('FechaInicio', sql.Date, fechaInicio || null)
            .input('FechaFin', sql.Date, fechaFin || null)
            .input('Status', sql.VarChar(20), status || null)
            .input('Nombre', sql.VarChar(100), nombre || null)
            .input('Matricula', sql.VarChar(20), matricula || null)
            .input('IdEmpleado', sql.Int, idEmpleado)
            .query(`
                WITH PermisosFiltrados AS (
                    SELECT P.*, T.*, L.*
                    FROM Permission P
                    INNER JOIN Authorize A ON P.IdPermission = A.IdPermission
                    INNER JOIN TypeExit T ON P.IdTipoSalida = T.IdTypeExit
                    INNER JOIN LoginUniPass L ON P.IdUser = L.IdLogin
                    WHERE A.IdEmpleado = @IdEmpleado
                      AND P.IdPermission IN (
                          SELECT A1.IdPermission FROM Authorize A1
                          GROUP BY A1.IdPermission HAVING COUNT(A1.IdAuthorize) = 1
                      )
                    UNION
                    SELECT P.*, T.*, L.*
                    FROM Permission P
                    INNER JOIN Authorize A ON P.IdPermission = A.IdPermission
                    INNER JOIN TypeExit T ON P.IdTipoSalida = T.IdTypeExit
                    INNER JOIN LoginUniPass L ON P.IdUser = L.IdLogin
                    WHERE A.IdEmpleado = @IdEmpleado
                      AND P.IdPermission IN (
                          SELECT A1.IdPermission FROM Authorize A1
                          WHERE A1.StatusAuthorize = 'Aprobada'
                            AND A1.IdAuthorize = (
                                SELECT TOP 1 A2.IdAuthorize FROM Authorize A2
                                WHERE A2.IdPermission = A1.IdPermission
                                ORDER BY A2.IdAuthorize
                            )
                      )
                )
                SELECT *
                FROM PermisosFiltrados
                WHERE
                    (@FechaInicio IS NULL OR FechaSalida >= @FechaInicio
                                          AND FechaSalida <  DATEADD(DAY, 1, @FechaInicio)) AND
                    (@FechaFin IS NULL OR FechaRegreso >= @FechaFin
                                       AND FechaRegreso <  DATEADD(DAY, 1, @FechaFin)) AND
                    (@Status IS NULL OR StatusPermission = @Status) AND
                    (@Nombre IS NULL OR Nombre LIKE '%' + @Nombre + '%') AND
                    (@Matricula IS NULL OR Matricula LIKE '%' + @Matricula + '%')
                ORDER BY FechaSolicitada DESC;
            `);
        return result.recordset;
    });

// === Escrituras ===

export const createPermissionRecord = ({
    fechaSolicitada,
    statusPermission,
    fechaSalida,
    fechaRegreso,
    motivo,
    idUser,
    idTipoSalida,
    observaciones = 'Ninguna'
}) =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .input('FechaSolicitada', sql.DateTime, fechaSolicitada)
            .input('StatusPermission', sql.VarChar, statusPermission)
            .input('FechaSalida', sql.DateTime, fechaSalida)
            .input('FechaRegreso', sql.DateTime, fechaRegreso)
            .input('Motivo', sql.VarChar, motivo)
            .input('IdUser', sql.Int, idUser)
            .input('IdTipoSalida', sql.Int, idTipoSalida)
            .input('Observaciones', sql.VarChar, observaciones)
            .query(`INSERT INTO Permission (FechaSolicitada, StatusPermission, FechaSalida, FechaRegreso, Motivo, IdUser, IdTipoSalida, Observaciones)
                    VALUES (@FechaSolicitada, @StatusPermission, @FechaSalida, @FechaRegreso, @Motivo, @IdUser, @IdTipoSalida, @Observaciones);
                    SELECT SCOPE_IDENTITY() AS IdPermission`);
        return result.recordset[0].IdPermission;
    });

export const cancelPermissionById = (id) =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .input('Id', sql.Int, id)
            .input('StatusPermission', sql.VarChar, 'Cancelado')
            .query('UPDATE Permission SET StatusPermission = @StatusPermission WHERE IdPermission = @Id');
        return result.rowsAffected[0] > 0;
    });

export const deletePermissionById = (id) =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .input('Id', sql.Int, id)
            .query('DELETE FROM Permission WHERE IdPermission = @Id');
        return result.rowsAffected[0] > 0;
    });

export const updatePermissionStatus = (id, status, observaciones) =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .input('IdPermiso', sql.Int, id)
            .input('StatusPermission', sql.VarChar, status)
            .input('Observaciones', sql.VarChar, observaciones)
            .query(`UPDATE Permission SET StatusPermission = @StatusPermission, Observaciones = @Observaciones
                    WHERE IdPermission = @IdPermiso`);
        return result.rowsAffected[0] > 0;
    });
