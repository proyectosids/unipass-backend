import { getConnection } from "../../infrastructure/database/connection.js";
import sql from "mssql";
import * as queries from "../../queries/position.queries.js";

export class PositionRepository {
    async getInfoDelegado(matriculaEncargado) {
        const pool = await getConnection();
        const result = await pool.request()
            .input("Id", sql.VarChar, matriculaEncargado)
            .query(queries.getInfoDelegadoQuery);

        return result.recordset.length === 0 ? null : result.recordset;
    }

    async createPosition(matriculaEncargado, classUser, asignado) {
        const pool = await getConnection();
        const result = await pool.request()
            .input("MatriculaEncargado", sql.VarChar, matriculaEncargado)
            .input("ClassUser", sql.VarChar, classUser)
            .input("Asignado", sql.VarChar, asignado)
            .input("Activo", sql.Int, 0) // se asumió que faltaba '0' en tu código original
            .query(queries.createPositionQuery);

        if (result.rowsAffected[0] > 0) {
            const newId = result.recordset[0].id;
            const createdData = await pool.request()
                .input("id", sql.Int, newId)
                .query(queries.getPositionByIdQuery);
            return createdData.recordset[0];
        }

        return null;
    }

    async updateActivo(idCargo, activo) {
        const pool = await getConnection();
        const result = await pool.request()
            .input("Id", sql.VarChar, idCargo)
            .input("Activo", sql.Int, activo)
            .query(queries.updateActivoQuery);

        return result.rowsAffected[0] > 0;
    }
}
