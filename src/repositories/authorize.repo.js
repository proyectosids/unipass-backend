import sql from 'mssql';
import { withConnection } from '../database/connection.js';

export const createAuthorize = ({ idEmpleado, noDepto, idPermission, statusAuthorize }) =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .input('IdEmpleado', sql.Int, idEmpleado)
            .input('NoDepto', sql.Int, noDepto)
            .input('IdPermission', sql.Int, idPermission)
            .input('StatusAuthorize', sql.VarChar, statusAuthorize)
            .query(`INSERT INTO Authorize (IdEmpleado, NoDepto, IdPermission, StatusAuthorize)
                    VALUES (@IdEmpleado, @NoDepto, @IdPermission, @StatusAuthorize);
                    SELECT SCOPE_IDENTITY() AS IdAuthorize`);
        if (result.recordset.length === 0) return null;
        return result.recordset[0].IdAuthorize;
    });

export const updateAuthorizeStatus = (idPermiso, idEmpleado, statusAuthorize) =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .input('IdPermiso', sql.Int, idPermiso)
            .input('IdEmpleado', sql.Int, idEmpleado)
            .input('StatusAuthorize', sql.VarChar, statusAuthorize)
            .query(`UPDATE Authorize SET StatusAuthorize = @StatusAuthorize
                    WHERE IdAuthorize = (
                        SELECT TOP 1 IdAuthorize FROM Authorize
                        WHERE IdPermission = @IdPermiso AND IdEmpleado = @IdEmpleado
                        ORDER BY IdAuthorize
                    )`);
        return result.rowsAffected[0] > 0;
    });

export const findUpdatedAuthorize = (idPermiso, idEmpleado, statusAuthorize) =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .input('IdPermiso', sql.Int, idPermiso)
            .input('IdEmpleado', sql.Int, idEmpleado)
            .input('StatusAuthorize', sql.VarChar, statusAuthorize)
            .query(`SELECT * FROM Authorize
                    WHERE IdPermission = @IdPermiso
                      AND IdEmpleado = @IdEmpleado
                      AND StatusAuthorize = @StatusAuthorize
                    ORDER BY IdAuthorize DESC`);
        return result.recordset[0] || null;
    });

export const findNextPendingEmpleado = (idPermission) =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .input('IdPermisoChain', sql.Int, idPermission)
            .query(`SELECT TOP 1 IdEmpleado FROM Authorize
                    WHERE IdPermission = @IdPermisoChain
                      AND StatusAuthorize = 'Pendiente'
                    ORDER BY IdAuthorize`);
        return result.recordset[0]?.IdEmpleado || null;
    });

export const findAuthorizeByEmpleadoAndPermiso = (idEmpleado, idPermiso) =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .input('IdEmpleado', sql.Int, idEmpleado)
            .input('IdPermiso', sql.Int, idPermiso)
            .query('SELECT * FROM Authorize WHERE IdEmpleado = @IdEmpleado AND IdPermission = @IdPermiso');
        return result.recordset[0] || null;
    });

export const findAllAuthorizeByPermission = (idPermission) =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .input('Id', sql.Int, idPermission)
            .query('SELECT * FROM Authorize WHERE IdPermission = @Id');
        return result.recordset;
    });
