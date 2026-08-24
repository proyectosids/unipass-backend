import sql from 'mssql';
import { withConnection } from '../database/connection.js';

// Orden estricto de los 4 checks por salida, derivado de (Accion, NombrePunto):
//   1 Salida Dormitorio, 2 Salida Caseta, 3 Regreso Caseta, 4 Regreso Dormitorio.
const PASO_CASE = `CASE
        WHEN CheckPoints.Accion = 'SALIDA'  AND Point.NombrePunto = 'Dormitorio' THEN 1
        WHEN CheckPoints.Accion = 'SALIDA'  AND Point.NombrePunto = 'Caseta'     THEN 2
        WHEN CheckPoints.Accion = 'RETORNO' AND Point.NombrePunto = 'Caseta'     THEN 3
        WHEN CheckPoints.Accion = 'RETORNO' AND Point.NombrePunto = 'Dormitorio' THEN 4
    END AS Paso`;

// Campos seguros para los listados de checks (pantalla Checador). Lista EXPLICITA:
// NO expone Contraseña/Correo/TokenCFM ni otros datos sensibles de LoginUniPass.
const CHECK_FIELDS = `CheckPoints.IdCheck,
        Permission.IdPermission,
        CheckPoints.Accion,
        CheckPoints.Estatus,
        Point.NombrePunto,
        Permission.FechaSalida,
        Permission.FechaRegreso,
        TypeExit.Descripcion,
        Permission.IdUser,
        LoginUniPass.Matricula,
        LoginUniPass.Nombre,
        LoginUniPass.Apellidos,
        ${PASO_CASE}`;

export const createCheckPoint = ({ statusCheck = 'Pendiente', accion, idPoint, idPermission }) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('StatusCheck', sql.VarChar, statusCheck)
            .input('Accion', sql.VarChar, accion)
            .input('IdPoint', sql.Int, idPoint)
            .input('IdPermission', sql.Int, idPermission)
            .query(`INSERT INTO UNIPASS.CheckPoints (Estatus, Accion, IdPoint, IdPermission)
                    VALUES (@StatusCheck, @Accion, @IdPoint, @IdPermission);
                    SELECT SCOPE_IDENTITY() AS IdCheck;`);
        return result.recordset[0].IdCheck;
    });

export const findPendingChecksDormitorioSalida = (dormitorio) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('Dormitorio', sql.Int, dormitorio)
            .query(`SELECT ${CHECK_FIELDS}
                    FROM UNIPASS.Permission
                    JOIN UNIPASS.TypeExit ON Permission.IdTipoSalida = TypeExit.IdTypeExit
                    JOIN UNIPASS.LoginUniPass ON Permission.IdUser = LoginUniPass.IdLogin
                    JOIN UNIPASS.CheckPoints ON Permission.IdPermission = CheckPoints.IdPermission
                    JOIN UNIPASS.Point ON CheckPoints.IdPoint = Point.IdPoint
                    WHERE Permission.StatusPermission = 'Aprobada'
                      AND Point.NombrePunto = 'Dormitorio'
                      AND CheckPoints.Estatus = 'Pendiente'
                      AND Accion = 'SALIDA'
                      AND LoginUniPass.Dormitorio = @Dormitorio
                      AND CONVERT(DATE, Permission.FechaSalida) <= CONVERT(DATE, GETDATE());`);
        return result.recordset;
    });

export const findPendingChecksDormitorioRetorno = (dormitorio) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('Dormitorio', sql.Int, dormitorio)
            .query(`WITH OrderedCheckPoints AS (
                        SELECT CheckPoints.*,
                               ROW_NUMBER() OVER (PARTITION BY IdPermission ORDER BY FechaCheck) AS CheckNumber
                        FROM UNIPASS.CheckPoints
                    )
                    SELECT ${CHECK_FIELDS}
                    FROM UNIPASS.Permission
                    JOIN UNIPASS.TypeExit ON Permission.IdTipoSalida = TypeExit.IdTypeExit
                    JOIN UNIPASS.LoginUniPass ON Permission.IdUser = LoginUniPass.IdLogin
                    JOIN UNIPASS.CheckPoints ON Permission.IdPermission = CheckPoints.IdPermission
                    JOIN UNIPASS.Point ON CheckPoints.IdPoint = Point.IdPoint
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
                      );`);
        return result.recordset;
    });

export const findPendingChecksVigilanciaSalida = () =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .query(`SELECT ${CHECK_FIELDS}
                    FROM UNIPASS.Permission
                    JOIN UNIPASS.TypeExit ON Permission.IdTipoSalida = TypeExit.IdTypeExit
                    JOIN UNIPASS.LoginUniPass ON Permission.IdUser = LoginUniPass.IdLogin
                    JOIN UNIPASS.CheckPoints ON Permission.IdPermission = CheckPoints.IdPermission
                    JOIN UNIPASS.Point ON CheckPoints.IdPoint = Point.IdPoint
                    WHERE Permission.StatusPermission = 'Aprobada'
                      AND Point.NombrePunto = 'Caseta'
                      AND CheckPoints.Estatus = 'Pendiente'
                      AND CheckPoints.Accion = 'SALIDA'
                      AND EXISTS (
                          SELECT 1
                          FROM UNIPASS.CheckPoints AS SubCheck
                          WHERE SubCheck.IdPermission = Permission.IdPermission
                            AND SubCheck.Estatus = 'Confirmada'
                            AND SubCheck.FechaCheck = (
                                SELECT MIN(FechaCheck)
                                FROM UNIPASS.CheckPoints AS FirstCheck
                                WHERE FirstCheck.IdPermission = SubCheck.IdPermission
                            )
                      );`);
        return result.recordset;
    });

export const findPendingChecksVigilanciaRegreso = () =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .query(`SELECT ${CHECK_FIELDS}
                    FROM UNIPASS.Permission
                    JOIN UNIPASS.TypeExit ON Permission.IdTipoSalida = TypeExit.IdTypeExit
                    JOIN UNIPASS.LoginUniPass ON Permission.IdUser = LoginUniPass.IdLogin
                    JOIN UNIPASS.CheckPoints ON Permission.IdPermission = CheckPoints.IdPermission
                    JOIN UNIPASS.Point ON CheckPoints.IdPoint = Point.IdPoint
                    WHERE Permission.StatusPermission = 'Aprobada'
                      AND Point.NombrePunto = 'Caseta'
                      AND CheckPoints.Estatus = 'Pendiente'
                      AND CheckPoints.Accion = 'RETORNO'
                      AND EXISTS (
                          SELECT 1
                          FROM UNIPASS.CheckPoints AS SubCheck
                          JOIN UNIPASS.Point AS SubPoint ON SubCheck.IdPoint = SubPoint.IdPoint
                          WHERE SubCheck.IdPermission = Permission.IdPermission
                            AND SubPoint.NombrePunto = 'Caseta'
                            AND SubCheck.Estatus = 'Confirmada'
                            AND SubCheck.Accion = 'SALIDA'
                      );`);
        return result.recordset;
    });

// Datos del check para autorizar la confirmacion: tipo de punto (NombrePunto) y
// dormitorio del alumno (para el scope de checador de Dormitorio).
export const findCheckAuthInfo = (idCheck) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('IdCheck', sql.Int, idCheck)
            .query(`SELECT cp.IdCheck, cp.IdPoint, cp.Accion, cp.Estatus, cp.IdPermission,
                           p.NombrePunto, lu.Dormitorio AS AlumnoDormitorio
                    FROM UNIPASS.CheckPoints cp
                    JOIN UNIPASS.Point p ON p.IdPoint = cp.IdPoint
                    JOIN UNIPASS.Permission pr ON pr.IdPermission = cp.IdPermission
                    JOIN UNIPASS.LoginUniPass lu ON lu.IdLogin = pr.IdUser
                    WHERE cp.IdCheck = @IdCheck`);
        return result.recordset[0] || null;
    });

// Pasos (1..4) y estatus de todos los checks de una salida, para validar el orden.
export const findPermissionSteps = (idPermission) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('IdPermission', sql.Int, idPermission)
            .query(`SELECT CheckPoints.IdCheck, CheckPoints.Estatus, ${PASO_CASE}
                    FROM UNIPASS.CheckPoints
                    JOIN UNIPASS.Point ON CheckPoints.IdPoint = Point.IdPoint
                    WHERE CheckPoints.IdPermission = @IdPermission`);
        return result.recordset;
    });

export const updateCheckPoint = (idCheck, { fechaCheck, estatus, observaciones, confirmadoPor = null }) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('IdCheck', sql.Int, idCheck)
            .input('FechaCheck', sql.DateTime, fechaCheck)
            .input('Estatus', sql.VarChar, estatus)
            .input('Observacion', sql.VarChar, observaciones)
            .input('ConfirmadoPor', sql.Int, confirmadoPor)
            .query(`UPDATE UNIPASS.CheckPoints
                    SET FechaCheck = @FechaCheck,
                        Estatus = @Estatus,
                        Observaciones = @Observacion,
                        ConfirmadoPor = @ConfirmadoPor
                    WHERE IdCheck = @IdCheck`);
        return result.rowsAffected[0] > 0;
    });

export const findCheckInfoForSocket = (idCheck) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('IdCheckSocket', sql.Int, idCheck)
            .query(`SELECT L.Matricula, CP.IdPermission, CP.Accion
                    FROM UNIPASS.CheckPoints CP
                    JOIN UNIPASS.Permission P ON CP.IdPermission = P.IdPermission
                    JOIN UNIPASS.LoginUniPass L ON P.IdUser = L.IdLogin
                    WHERE CP.IdCheck = @IdCheckSocket`);
        return result.recordset[0] || null;
    });
