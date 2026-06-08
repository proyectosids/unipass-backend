import sql from 'mssql';
import { withConnection } from '../database/connection.js';

export const createCheckPoint = ({ statusCheck = 'Pendiente', accion, idPoint, idPermission }) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('StatusCheck', sql.VarChar, statusCheck)
            .input('Accion', sql.VarChar, accion)
            .input('IdPoint', sql.Int, idPoint)
            .input('IdPermission', sql.Int, idPermission)
            .query(`INSERT INTO CheckPoints (Estatus, Accion, IdPoint, IdPermission)
                    VALUES (@StatusCheck, @Accion, @IdPoint, @IdPermission);
                    SELECT SCOPE_IDENTITY() AS IdCheck;`);
        return result.recordset[0].IdCheck;
    });

export const findPendingChecksDormitorioSalida = (dormitorio) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('Dormitorio', sql.Int, dormitorio)
            .query(`SELECT Permission.*, TypeExit.*, LoginUniPass.*, CheckPoints.*, Point.*
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
                      );`);
        return result.recordset;
    });

export const findPendingChecksVigilanciaSalida = () =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .query(`SELECT Permission.*, TypeExit.*, LoginUniPass.*, CheckPoints.*, Point.*
                    FROM Permission
                    JOIN TypeExit ON Permission.IdTipoSalida = TypeExit.IdTypeExit
                    JOIN LoginUniPass ON Permission.IdUser = LoginUniPass.IdLogin
                    JOIN CheckPoints ON Permission.IdPermission = CheckPoints.IdPermission
                    JOIN Point ON CheckPoints.IdPoint = Point.IdPoint
                    WHERE Permission.StatusPermission = 'Aprobada'
                      AND Point.NombrePunto = 'Caseta'
                      AND CheckPoints.Estatus = 'Pendiente'
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
                      );`);
        return result.recordset;
    });

export const findPendingChecksVigilanciaRegreso = () =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .query(`SELECT Permission.*, TypeExit.*, LoginUniPass.*, CheckPoints.*, Point.*
                    FROM Permission
                    JOIN TypeExit ON Permission.IdTipoSalida = TypeExit.IdTypeExit
                    JOIN LoginUniPass ON Permission.IdUser = LoginUniPass.IdLogin
                    JOIN CheckPoints ON Permission.IdPermission = CheckPoints.IdPermission
                    JOIN Point ON CheckPoints.IdPoint = Point.IdPoint
                    WHERE Permission.StatusPermission = 'Aprobada'
                      AND Point.NombrePunto = 'Caseta'
                      AND CheckPoints.Estatus = 'Pendiente'
                      AND CheckPoints.Accion = 'RETORNO'
                      AND EXISTS (
                          SELECT 1
                          FROM CheckPoints AS SubCheck
                          JOIN Point AS SubPoint ON SubCheck.IdPoint = SubPoint.IdPoint
                          WHERE SubCheck.IdPermission = Permission.IdPermission
                            AND SubPoint.NombrePunto = 'Caseta'
                            AND SubCheck.Estatus = 'Confirmada'
                            AND SubCheck.Accion = 'SALIDA'
                      );`);
        return result.recordset;
    });

export const updateCheckPoint = (idCheck, { fechaCheck, estatus, observaciones }) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('IdCheck', sql.Int, idCheck)
            .input('FechaCheck', sql.DateTime, fechaCheck)
            .input('Estatus', sql.VarChar, estatus)
            .input('Observacion', sql.VarChar, observaciones)
            .query(`UPDATE CheckPoints
                    SET FechaCheck = @FechaCheck, Estatus = @Estatus, Observaciones = @Observacion
                    WHERE IdCheck = @IdCheck`);
        return result.rowsAffected[0] > 0;
    });

export const findCheckInfoForSocket = (idCheck) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('IdCheckSocket', sql.Int, idCheck)
            .query(`SELECT L.Matricula, CP.IdPermission, CP.Accion
                    FROM CheckPoints CP
                    JOIN Permission P ON CP.IdPermission = P.IdPermission
                    JOIN LoginUniPass L ON P.IdUser = L.IdLogin
                    WHERE CP.IdCheck = @IdCheckSocket`);
        return result.recordset[0] || null;
    });
