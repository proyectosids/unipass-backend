// src/domain/repositories/authorize.repository.js
import { getConnection } from "../../infrastructure/database/connection.js";
import sql from "mssql";
import * as queries from "../../queries/authorize.queries.js";

export class AuthorizeRepository {
    async createAuthorize(data) {
        const pool = await getConnection();
        const result = await pool.request()
            .input('IdEmpleado', sql.Int, data.IdEmpleado)
            .input('NoDepto', sql.Int, data.NoDepto)
            .input('IdPermission', sql.Int, data.IdPermission)
            .input('StatusAuthorize', sql.VarChar, data.StatusAuthorize)
            .query(queries.createAuthorizeQuery);
        await pool.close();
        return result.recordset[0];
    }

    async asignarPreceptor(nivel, sexo) {
        const pool = await getConnection();
        const result = await pool.request()
            .input('NivelDormitorio', sql.VarChar, nivel)
            .input('Sexo', sql.VarChar, sexo)
            .query(queries.asignarPreceptorQuery);
        await pool.close();
        return result.recordset[0];
    }

    async definirAutorizacion(idPermiso, idEmpleado, statusAuthorize) {
        const pool = await getConnection();

        const updateResult = await pool.request()
            .input('IdPermiso', sql.Int, idPermiso)
            .input('IdEmpleado', sql.Int, idEmpleado)
            .input('StatusAuthorize', sql.VarChar, statusAuthorize)
            .query(queries.definirAutorizacionQuery);

        if (updateResult.rowsAffected[0] === 0) {
            await pool.close();
            return null;
        }

        const updated = await pool.request()
            .input('IdPermiso', sql.Int, idPermiso)
            .input('IdEmpleado', sql.Int, idEmpleado)
            .input('StatusAuthorize', sql.VarChar, statusAuthorize)
            .query(queries.selectUpdatedAuthorizationQuery);

        await pool.close();
        return updated.recordset[0];
    }

    async verificarValidacion(idEmpleado, idPermiso) {
        const pool = await getConnection();
        const result = await pool
            .request()
            .input('IdEmpleado', sql.Int, idEmpleado)
            .input('IdPermiso', sql.Int, idPermiso)
            .query(queries.verificarValidacionQuery);
        await pool.close();
        return result.recordset[0] || null;
    }

    async advancePermission(idPermission) {
        const pool = await getConnection();
        const result = await pool
            .request()
            .input('Id', sql.Int, idPermission)
            .query(queries.advancePermissionQuery);
        await pool.close();
        return result.recordset;
    }
}
