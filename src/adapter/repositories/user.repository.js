import { getConnection } from "../../infrastructure/database/connection.js";
import sql from "mssql";
import * as queries from "../../queries/user.queries.js";

export class UserRepository {
    async getUserById(id) {
        const pool = await getConnection();
        const result = await pool.request()
            .input("Id", sql.Int, id)
            .query(queries.getUserByIdQuery);

        return result.recordset.length === 0 ? null : result.recordset[0];
    }

    async getUserByMatricula(matricula) {
        const pool = await getConnection();
        const result = await pool.request()
            .input("Matricula", sql.VarChar, matricula)
            .query(queries.getUserByMatriculaQuery);

        return result.recordset.length === 0 ? null : result.recordset[0];
    }

    async getCheckersByEmail(email) {
        const pool = await getConnection();
        const result = await pool.request()
            .input("EmailEncargado", sql.VarChar, email)
            .query(queries.getCheckersByEmailQuery);

        return result.recordset.length === 0 ? null : result.recordset;
    }

    async searchPerson(nombre) {
        const pool = await getConnection();
        const result = await pool.request()
            .input("Nombre", sql.VarChar, nombre)
            .query(queries.searchPersonQuery);

        return result.recordset.length === 0 ? null : result.recordset;
    }

    async getTokenFCM(matricula) {
        const pool = await getConnection();
        const result = await pool.request()
            .input("Matricula", sql.VarChar, matricula)
            .query(queries.getTokenFCMQuery);

        return result.recordset.length === 0 ? null : result.recordset;
    }

    async updateDocumentStatus(matricula, statusDoc) {
        const pool = await getConnection();
        const result = await pool.request()
            .input("Matricula", sql.VarChar, matricula)
            .input("StatusDoc", sql.Int, statusDoc)
            .query(queries.updateDocumentStatusQuery);

        return result.rowsAffected[0] > 0;
    }

    async updateTokenFCM(matricula, tokenCFM) {
        const pool = await getConnection();
        const result = await pool.request()
            .input("Matricula", sql.VarChar, matricula)
            .input("TokenCFM", sql.VarChar, tokenCFM)
            .query(queries.updateTokenFCMQuery);

        return result.rowsAffected[0] > 0;
    }

    async endCargo(matricula) {
        const pool = await getConnection();

        const getIdCargoResult = await pool.request()
            .input("Matricula", sql.VarChar, matricula)
            .query(queries.getIdCargoDelegadoQuery);

        if (getIdCargoResult.recordset.length === 0) return null;

        const idCargoDelegado = getIdCargoResult.recordset[0].IdCargoDelegado;

        await pool.request()
            .input("Matricula", sql.VarChar, matricula)
            .query(queries.setIdCargoDelegadoNullQuery);

        const deleteResult = await pool.request()
            .input("IdCargo", sql.VarChar, idCargoDelegado.toString())
            .query(queries.deletePositionQuery);

        return deleteResult.rowsAffected[0] > 0;
    }

    async updateCargo(matricula, idCargoDelegado) {
        const pool = await getConnection();
        const result = await pool.request()
            .input("Matricula", sql.VarChar, matricula)
            .input("Delegado", sql.Int, idCargoDelegado)
            .query(queries.updateCargoQuery);

        return result.rowsAffected[0] > 0;
    }

    async getInfoCargo(id) {
        const pool = await getConnection();
        const result = await pool.request()
            .input("Id", sql.VarChar, id)
            .query(queries.getInfoCargoQuery);

        return result.recordset.length === 0 ? null : result.recordset[0];
    }
}
