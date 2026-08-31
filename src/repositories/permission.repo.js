import sql from 'mssql';
import { withConnection } from '../database/connection.js';

// Repositorio de Permission (permisos de salida): historial del alumno, bandejas de
// autorizacion (jefe de trabajo / preceptor), tops, dashboards y filtros.
//
// Regla de "bandeja del preceptor" (se repite en varias queries de este archivo):
// un permiso le aparece al empleado cuando (a) es el UNICO aprobador de la cadena
// (HAVING COUNT = 1) o (b) el PRIMER eslabon (jefe de trabajo) ya esta 'Aprobada'.
// Regla de dashboard: Dormitorio = 5 en el perfil del consultante = vista global
// (administracion); cualquier otro valor = solo su dormitorio.

// Campos seguros para listados de permisos con datos del alumno. Lista EXPLICITA:
// NO expone Contraseña/Correo/TokenCFM/Celular/FechaNacimiento de LoginUniPass.
const PERMISSION_FIELDS = `Permission.IdPermission,
        Permission.FechaSolicitada,
        Permission.StatusPermission,
        Permission.FechaSalida,
        Permission.FechaRegreso,
        Permission.Motivo,
        Permission.IdUser,
        Permission.IdTipoSalida,
        Permission.Observaciones,
        Permission.Aprobo,
        TypeExit.IdTypeExit,
        TypeExit.Descripcion,
        LoginUniPass.IdLogin,
        LoginUniPass.Matricula,
        LoginUniPass.Nombre,
        LoginUniPass.Apellidos,
        LoginUniPass.TipoUser,
        LoginUniPass.Sexo,
        LoginUniPass.Dormitorio`;

// === Lecturas ===

export const findPermissionsByUserPaginated = (idUser, page, limit) =>
    withConnection(async (pool) => {
        const offset = (page - 1) * limit;
        const dataResult = await pool.request()
            .input('Id', sql.Int, idUser)
            .input('Limit', sql.Int, parseInt(limit))
            .input('Offset', sql.Int, parseInt(offset))
            .query(`
                SELECT ${PERMISSION_FIELDS}
                FROM UNIPASS.Permission
                JOIN UNIPASS.TypeExit ON Permission.IdTipoSalida = TypeExit.IdTypeExit
                JOIN UNIPASS.LoginUniPass ON Permission.IdUser = LoginUniPass.IdLogin
                WHERE IdLogin = @Id
                ORDER BY Permission.FechaSolicitada DESC
                OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY
            `);
        const totalResult = await pool.request()
            .input('Id', sql.Int, idUser)
            .query('SELECT COUNT(*) as TotalPermissions FROM UNIPASS.Permission WHERE IdUser = @Id');
        return {
            data: dataResult.recordset,
            totalItems: totalResult.recordset[0].TotalPermissions
        };
    });

export const findPermissionById = (id) =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .input('Id', sql.Int, id)
            .query('SELECT * FROM UNIPASS.Permission WHERE IdPermission = @Id');
        return result.recordset[0] || null;
    });

// Dueño (IdUser) de un permiso, para validar ownership contra token.id. null si no existe.
export const findPermissionOwnerId = (id) =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .input('Id', sql.Int, id)
            .query('SELECT IdUser FROM UNIPASS.Permission WHERE IdPermission = @Id');
        return result.recordset[0]?.IdUser ?? null;
    });

export const userExistsById = (idUser) =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .input('IdUser', sql.Int, idUser)
            .query('SELECT 1 FROM UNIPASS.LoginUniPass WHERE IdLogin = @IdUser');
        return result.recordset.length > 0;
    });

export const findAlumnoBasicByLogin = (idLogin) =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .input('IdUserSocket', sql.Int, idLogin)
            .query('SELECT Matricula, Nombre FROM UNIPASS.LoginUniPass WHERE IdLogin = @IdUserSocket');
        return result.recordset[0] || null;
    });

export const findEmpleadosAuthorizeByPermission = (idPermission) =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .input('IdPermissionSocket', sql.Int, idPermission)
            .query('SELECT IdEmpleado FROM UNIPASS.Authorize WHERE IdPermission = @IdPermissionSocket');
        return result.recordset;
    });

export const findAlumnoMatriculaByPermission = (idPermission) =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .input('IdPermisoSocket', sql.Int, idPermission)
            .query(`SELECT L.Matricula FROM UNIPASS.Permission P
                    JOIN UNIPASS.LoginUniPass L ON P.IdUser = L.IdLogin
                    WHERE P.IdPermission = @IdPermisoSocket`);
        return result.recordset[0]?.Matricula || null;
    });

// Bandeja del jefe de trabajo: todo permiso donde el empleado participa en la cadena
// (Authorize), con FechaSalida en la ventana de -30 a +15 dias respecto a hoy.
export const findPermissionsForAutorizacionByEmpleado = (idEmpleado) =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .input('Id', sql.Int, idEmpleado)
            .query(`SELECT ${PERMISSION_FIELDS}
                    FROM UNIPASS.Permission
                    INNER JOIN UNIPASS.Authorize ON Permission.IdPermission = Authorize.IdPermission
                    JOIN UNIPASS.TypeExit ON Permission.IdTipoSalida = TypeExit.IdTypeExit
                    JOIN UNIPASS.LoginUniPass ON Permission.IdUser = LoginUniPass.IdLogin
                    WHERE Authorize.IdEmpleado = @Id
                      AND Permission.FechaSalida BETWEEN DATEADD(DAY, -30, GETDATE()) AND DATEADD(DAY, 15, GETDATE())`);
        return result.recordset;
    });

// Bandeja del preceptor: UNION de las reglas (a) unico aprobador y (b) primer eslabon
// aprobado (ver cabecera del archivo). Misma ventana de -30/+15 dias.
export const findPermissionsForAutorizacionPreceByEmpleado = (idEmpleado) =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .input('Id', sql.Int, idEmpleado)
            .query(`SELECT ${PERMISSION_FIELDS}
                    FROM UNIPASS.Permission
                    INNER JOIN UNIPASS.Authorize ON Permission.IdPermission = Authorize.IdPermission
                    JOIN UNIPASS.TypeExit ON Permission.IdTipoSalida = TypeExit.IdTypeExit
                    JOIN UNIPASS.LoginUniPass ON Permission.IdUser = LoginUniPass.IdLogin
                    WHERE Authorize.IdEmpleado = @Id
                      AND Permission.IdPermission IN (
                          SELECT A1.IdPermission FROM UNIPASS.Authorize A1
                          GROUP BY A1.IdPermission HAVING COUNT(A1.IdAuthorize) = 1
                      )
                      AND Permission.FechaSalida BETWEEN DATEADD(DAY, -30, GETDATE()) AND DATEADD(DAY, 15, GETDATE())

                    UNION

                    SELECT ${PERMISSION_FIELDS}
                    FROM UNIPASS.Permission
                    INNER JOIN UNIPASS.Authorize ON Permission.IdPermission = Authorize.IdPermission
                    JOIN UNIPASS.TypeExit ON Permission.IdTipoSalida = TypeExit.IdTypeExit
                    JOIN UNIPASS.LoginUniPass ON Permission.IdUser = LoginUniPass.IdLogin
                    WHERE Authorize.IdEmpleado = @Id
                      AND Permission.IdPermission IN (
                          SELECT A1.IdPermission FROM UNIPASS.Authorize A1
                          WHERE A1.StatusAuthorize = 'Aprobada'
                            AND A1.IdAuthorize = (
                                SELECT TOP 1 A2.IdAuthorize FROM UNIPASS.Authorize A2
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
            .query('SELECT TOP 10 * FROM UNIPASS.Permission WHERE IdUser = @IdLogin ORDER BY FechaSolicitada DESC');
        return result.recordset;
    });

export const findTop10PermissionsByEmployee = (idEmpleado) =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .input('Matricula', sql.Int, idEmpleado)
            .query(`SELECT TOP 10 ${PERMISSION_FIELDS}
                    FROM UNIPASS.Permission
                    INNER JOIN UNIPASS.Authorize ON Permission.IdPermission = Authorize.IdPermission
                    JOIN UNIPASS.TypeExit ON Permission.IdTipoSalida = TypeExit.IdTypeExit
                    JOIN UNIPASS.LoginUniPass ON Permission.IdUser = LoginUniPass.IdLogin
                    WHERE Authorize.IdEmpleado = @Matricula
                    ORDER BY Permission.FechaSolicitada DESC`);
        return result.recordset;
    });

// Ultimos 10 de la bandeja del preceptor: mismas reglas (a)/(b) que
// findPermissionsForAutorizacionPreceByEmpleado, pero sin ventana de fechas.
export const findTop10PermissionsByPrece = (idEmpleado) =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .input('Matricula', sql.Int, idEmpleado)
            .query(`SELECT TOP 10 * FROM (
                        SELECT ${PERMISSION_FIELDS} FROM UNIPASS.Permission
                        INNER JOIN UNIPASS.Authorize ON Permission.IdPermission = Authorize.IdPermission
                        JOIN UNIPASS.TypeExit ON Permission.IdTipoSalida = TypeExit.IdTypeExit
                        JOIN UNIPASS.LoginUniPass ON Permission.IdUser = LoginUniPass.IdLogin
                        WHERE Authorize.IdEmpleado = @Matricula
                          AND Permission.IdPermission IN (
                              SELECT A1.IdPermission FROM UNIPASS.Authorize A1
                              GROUP BY A1.IdPermission HAVING COUNT(A1.IdAuthorize) = 1
                          )

                        UNION

                        SELECT ${PERMISSION_FIELDS} FROM UNIPASS.Permission
                        INNER JOIN UNIPASS.Authorize ON Permission.IdPermission = Authorize.IdPermission
                        JOIN UNIPASS.TypeExit ON Permission.IdTipoSalida = TypeExit.IdTypeExit
                        JOIN UNIPASS.LoginUniPass ON Permission.IdUser = LoginUniPass.IdLogin
                        WHERE Authorize.IdEmpleado = @Matricula
                          AND Permission.IdPermission IN (
                              SELECT A1.IdPermission FROM UNIPASS.Authorize A1
                              WHERE A1.StatusAuthorize = 'Aprobada'
                                AND A1.IdAuthorize = (
                                    SELECT TOP 1 A2.IdAuthorize FROM UNIPASS.Authorize A2
                                    WHERE A2.IdPermission = A1.IdPermission
                                    ORDER BY A2.IdAuthorize
                                )
                          )
                    ) AS CombinedResults
                    ORDER BY FechaSolicitada DESC`);
        return result.recordset;
    });

// Conteos Aprobadas/Rechazadas/Pendientes/Total (PIVOT) para el dashboard de permisos.
// Dorm 5 = ve todos los permisos; si no, solo su bandeja (reglas a/b de la cabecera).
export const findDashboardPermissionCounts = (matriculaPreceptor) =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .input('Matricula', sql.VarChar, matriculaPreceptor)
            .query(`
                WITH EmpleadoDormitorio AS (
                    SELECT TOP 1 Dormitorio AS Dorm FROM UNIPASS.LoginUniPass WHERE Matricula = @Matricula
                ),
                PermisosFiltrados AS (
                    SELECT DISTINCT P.IdPermission, P.StatusPermission
                    FROM UNIPASS.Permission P
                    INNER JOIN UNIPASS.Authorize A ON P.IdPermission = A.IdPermission
                    JOIN UNIPASS.LoginUniPass L ON P.IdUser = L.IdLogin
                    CROSS APPLY (SELECT Dorm FROM EmpleadoDormitorio) AS D
                    WHERE
                        (D.Dorm = 5)
                        OR
                        (A.IdEmpleado = @Matricula
                            AND (
                                P.IdPermission IN (
                                    SELECT A1.IdPermission FROM UNIPASS.Authorize A1
                                    GROUP BY A1.IdPermission HAVING COUNT(A1.IdAuthorize) = 1
                                )
                                OR P.IdPermission IN (
                                    SELECT A1.IdPermission FROM UNIPASS.Authorize A1
                                    WHERE A1.StatusAuthorize = 'Aprobada'
                                    AND A1.IdAuthorize = (
                                        SELECT TOP 1 A2.IdAuthorize FROM UNIPASS.Authorize A2
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

// Conteos de documentos de alumnos: ADMINISTRATIVO con Dorm 5 ve dormitorios 1-4;
// un preceptor solo el suyo.
export const findDashboardDocumentosCounts = (matriculaPreceptor) =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .input('Matricula', sql.VarChar, matriculaPreceptor)
            .query(`
                WITH Empleado AS (
                    SELECT Dormitorio, TipoUser FROM UNIPASS.LoginUniPass WHERE Matricula = @Matricula
                ),
                Filtrados AS (
                    SELECT d.* FROM UNIPASS.Doctos d
                    JOIN UNIPASS.LoginUniPass a ON d.IdLogin = a.IdLogin
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
            .query('SELECT TipoUser FROM UNIPASS.LoginUniPass WHERE Matricula = @MatriculaInput');
        return result.recordset[0]?.TipoUser || null;
    });

// Filtro de permisos vista global (ADMINISTRATIVO). Cada filtro es opcional (NULL lo
// ignora); fechaInicio/fechaFin matchean el DIA exacto de FechaSalida/FechaRegreso.
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
                SELECT ${PERMISSION_FIELDS}
                FROM UNIPASS.Permission
                INNER JOIN UNIPASS.TypeExit ON Permission.IdTipoSalida = TypeExit.IdTypeExit
                INNER JOIN UNIPASS.LoginUniPass ON Permission.IdUser = LoginUniPass.IdLogin
                WHERE
                    (@FechaInicio IS NULL OR Permission.FechaSalida >= @FechaInicio
                                          AND Permission.FechaSalida <  DATEADD(DAY, 1, @FechaInicio)) AND
                    (@FechaFin IS NULL OR Permission.FechaRegreso >= @FechaFin
                                       AND Permission.FechaRegreso <  DATEADD(DAY, 1, @FechaFin)) AND
                    (@Status IS NULL OR Permission.StatusPermission = @Status) AND
                    (@Nombre IS NULL OR LoginUniPass.Nombre LIKE '%' + @Nombre + '%') AND
                    (@Matricula IS NULL OR LoginUniPass.Matricula LIKE '%' + @Matricula + '%')
                ORDER BY Permission.FechaSolicitada DESC;
            `);
        return result.recordset;
    });

// Filtro de permisos del preceptor: mismos filtros opcionales, pero limitado a su
// bandeja (reglas a/b de la cabecera del archivo).
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
                    SELECT ${PERMISSION_FIELDS}
                    FROM UNIPASS.Permission
                    INNER JOIN UNIPASS.Authorize A ON Permission.IdPermission = A.IdPermission
                    INNER JOIN UNIPASS.TypeExit ON Permission.IdTipoSalida = TypeExit.IdTypeExit
                    INNER JOIN UNIPASS.LoginUniPass ON Permission.IdUser = LoginUniPass.IdLogin
                    WHERE A.IdEmpleado = @IdEmpleado
                      AND Permission.IdPermission IN (
                          SELECT A1.IdPermission FROM UNIPASS.Authorize A1
                          GROUP BY A1.IdPermission HAVING COUNT(A1.IdAuthorize) = 1
                      )
                    UNION
                    SELECT ${PERMISSION_FIELDS}
                    FROM UNIPASS.Permission
                    INNER JOIN UNIPASS.Authorize A ON Permission.IdPermission = A.IdPermission
                    INNER JOIN UNIPASS.TypeExit ON Permission.IdTipoSalida = TypeExit.IdTypeExit
                    INNER JOIN UNIPASS.LoginUniPass ON Permission.IdUser = LoginUniPass.IdLogin
                    WHERE A.IdEmpleado = @IdEmpleado
                      AND Permission.IdPermission IN (
                          SELECT A1.IdPermission FROM UNIPASS.Authorize A1
                          WHERE A1.StatusAuthorize = 'Aprobada'
                            AND A1.IdAuthorize = (
                                SELECT TOP 1 A2.IdAuthorize FROM UNIPASS.Authorize A2
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
            .query(`INSERT INTO UNIPASS.Permission (FechaSolicitada, StatusPermission, FechaSalida, FechaRegreso, Motivo, IdUser, IdTipoSalida, Observaciones)
                    VALUES (@FechaSolicitada, @StatusPermission, @FechaSalida, @FechaRegreso, @Motivo, @IdUser, @IdTipoSalida, @Observaciones);
                    SELECT SCOPE_IDENTITY() AS IdPermission`);
        return result.recordset[0].IdPermission;
    });

// Task 7.4A: idempotencia. IdPermission ya creado para un Idempotency-Key, o null.
export const findPermissionByIdempotencyKey = (idempotencyKey) =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .input('Key', sql.NVarChar(80), idempotencyKey)
            .query('SELECT IdPermission FROM UNIPASS.IdempotencyRequest WHERE IdempotencyKey = @Key');
        return result.recordset[0]?.IdPermission ?? null;
    });

// Task 7.4A: creación TRANSACCIONAL de Permission + Authorize(s). O todo, o nada.
// authorizers: [{ idEmpleado, noDepto, orden }] ya resueltos (fuera de la transacción).
// Si se pasa idempotencyKey y ya existe -> devuelve el permiso previo (replayed) sin duplicar.
export const createPermissionWithChainTx = ({ permission, authorizers, idempotencyKey = null, idLogin }) =>
    withConnection(async (pool) => {
        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            if (idempotencyKey) {
                const prev = await new sql.Request(tx)
                    .input('Key', sql.NVarChar(80), idempotencyKey)
                    .query('SELECT IdPermission FROM UNIPASS.IdempotencyRequest WHERE IdempotencyKey = @Key');
                if (prev.recordset.length > 0) {
                    await tx.commit();
                    return { idPermission: prev.recordset[0].IdPermission, replayed: true };
                }
            }

            const permRes = await new sql.Request(tx)
                .input('FechaSolicitada', sql.DateTime, permission.fechaSolicitada)
                .input('StatusPermission', sql.VarChar, permission.statusPermission)
                .input('FechaSalida', sql.DateTime, permission.fechaSalida)
                .input('FechaRegreso', sql.DateTime, permission.fechaRegreso)
                .input('Motivo', sql.VarChar, permission.motivo)
                .input('IdUser', sql.Int, permission.idUser)
                .input('IdTipoSalida', sql.Int, permission.idTipoSalida)
                .input('Observaciones', sql.VarChar, 'Ninguna')
                .query(`INSERT INTO UNIPASS.Permission (FechaSolicitada, StatusPermission, FechaSalida, FechaRegreso, Motivo, IdUser, IdTipoSalida, Observaciones)
                        VALUES (@FechaSolicitada, @StatusPermission, @FechaSalida, @FechaRegreso, @Motivo, @IdUser, @IdTipoSalida, @Observaciones);
                        SELECT SCOPE_IDENTITY() AS IdPermission;`);
            const idPermission = permRes.recordset[0].IdPermission;

            for (const a of authorizers) {
                await new sql.Request(tx)
                    .input('IdEmpleado', sql.Int, a.idEmpleado)
                    .input('NoDepto', sql.Int, a.noDepto)
                    .input('IdPermission', sql.Int, idPermission)
                    .input('StatusAuthorize', sql.VarChar, 'Pendiente')
                    .query(`INSERT INTO UNIPASS.Authorize (IdEmpleado, NoDepto, IdPermission, StatusAuthorize)
                            VALUES (@IdEmpleado, @NoDepto, @IdPermission, @StatusAuthorize)`);
            }

            if (idempotencyKey) {
                await new sql.Request(tx)
                    .input('Key', sql.NVarChar(80), idempotencyKey)
                    .input('IdLogin', sql.Int, idLogin)
                    .input('IdPermission', sql.Int, idPermission)
                    .query(`INSERT INTO UNIPASS.IdempotencyRequest (IdempotencyKey, IdLogin, IdPermission)
                            VALUES (@Key, @IdLogin, @IdPermission)`);
            }

            await tx.commit();
            return { idPermission, replayed: false };
        } catch (error) {
            try { await tx.rollback(); } catch (rbErr) { console.error('[Tx] rollback error:', rbErr.message); }
            throw error;
        }
    });

export const cancelPermissionById = (id) =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .input('Id', sql.Int, id)
            .input('StatusPermission', sql.VarChar, 'Cancelado')
            .query('UPDATE UNIPASS.Permission SET StatusPermission = @StatusPermission WHERE IdPermission = @Id');
        return result.rowsAffected[0] > 0;
    });

export const deletePermissionById = (id) =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .input('Id', sql.Int, id)
            .query('DELETE FROM UNIPASS.Permission WHERE IdPermission = @Id');
        return result.rowsAffected[0] > 0;
    });

// RETIRADO (Task 7.4B, Commit A): updatePermissionStatus(id, status, observaciones) permitía fijar el
// estado global de Permission desde el cliente (usado por el eliminado PUT /permissionValorado). El
// estado global ahora lo calcula el backend dentro de resolveAuthorizeLinkTx (authorize.repo). No
// reintroducir una escritura directa de StatusPermission desde el cliente.
