import sql from 'mssql';
import { withConnection } from '../database/connection.js';

// Repositorio de Authorize: cadena de aprobacion de un permiso, en orden de
// IdAuthorize (primer eslabon = jefe de trabajo, luego preceptor).

// Idempotente: si ya existe Authorize para (IdPermission, IdEmpleado),
// no inserta duplicado y marca el existente como DualRole.
export const createAuthorize = ({ idEmpleado, noDepto, idPermission, statusAuthorize }) =>
    withConnection(async (pool) => {
        const existing = await pool.request()
            .input('IdPermission', sql.Int, idPermission)
            .input('IdEmpleado', sql.Int, idEmpleado)
            .query(`SELECT IdAuthorize FROM Authorize
                    WHERE IdPermission = @IdPermission AND IdEmpleado = @IdEmpleado`);

        if (existing.recordset.length > 0) {
            const existingId = existing.recordset[0].IdAuthorize;
            await pool.request()
                .input('IdAuthorize', sql.Int, existingId)
                .query('UPDATE Authorize SET DualRole = 1 WHERE IdAuthorize = @IdAuthorize');
            return { id: existingId, dualRoleApplied: true };
        }

        const result = await pool.request()
            .input('IdEmpleado', sql.Int, idEmpleado)
            .input('NoDepto', sql.Int, noDepto)
            .input('IdPermission', sql.Int, idPermission)
            .input('StatusAuthorize', sql.VarChar, statusAuthorize)
            .query(`INSERT INTO Authorize (IdEmpleado, NoDepto, IdPermission, StatusAuthorize)
                    VALUES (@IdEmpleado, @NoDepto, @IdPermission, @StatusAuthorize);
                    SELECT SCOPE_IDENTITY() AS IdAuthorize`);
        if (result.recordset.length === 0) return null;
        return { id: result.recordset[0].IdAuthorize, dualRoleApplied: false };
    });

export const updateAuthorizeStatus = (idPermiso, idEmpleado, statusAuthorize) =>
    withConnection(async (pool) => {
        const isFinalStatus = statusAuthorize === 'Aprobada' || statusAuthorize === 'Rechazada';
        const setClause = isFinalStatus
            ? 'SET StatusAuthorize = @StatusAuthorize, FechaAprobacion = GETDATE()'
            : 'SET StatusAuthorize = @StatusAuthorize';
        const result = await pool.request()
            .input('IdPermiso', sql.Int, idPermiso)
            .input('IdEmpleado', sql.Int, idEmpleado)
            .input('StatusAuthorize', sql.VarChar, statusAuthorize)
            .query(`UPDATE Authorize ${setClause}
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
            .query(`SELECT
                        A.IdAuthorize,
                        A.IdEmpleado,
                        A.NoDepto,
                        A.IdPermission,
                        A.StatusAuthorize,
                        A.FechaAprobacion,
                        A.DualRole,
                        CASE
                            WHEN L.TipoUser = 'EMPLEADO' THEN 'Jefe de trabajo'
                            WHEN L.TipoUser = 'PRECEPTOR' THEN 'Preceptor'
                            WHEN L.TipoUser = 'VIGILANCIA' THEN 'Vigilancia'
                            WHEN L.TipoUser = 'ADMINISTRATIVO' THEN 'Administración'
                            ELSE 'Aprobador'
                        END AS Rol,
                        LTRIM(RTRIM(CONCAT(L.Nombre, ' ', L.Apellidos))) AS NombreAprobador,
                        ROW_NUMBER() OVER (ORDER BY A.IdAuthorize) AS Orden
                    FROM Authorize A
                    LEFT JOIN LoginUniPass L ON L.Matricula = CAST(A.IdEmpleado AS VARCHAR(20))
                    WHERE A.IdPermission = @Id
                    ORDER BY A.IdAuthorize`);
        return result.recordset;
    });
