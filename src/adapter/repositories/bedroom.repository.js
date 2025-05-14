import { getConnection } from "../../infrastructure/database/connection.js";
import sql from "mssql";
import * as queries from "../../queries/bedroom.queries.js";

export class BedroomRepository {
    async getBedroomBySexoYNivel(sexo, nivel) {
        const pool = await getConnection();
        const result = await pool
            .request()
            .input("Sexo", sql.VarChar, sexo)
            .input("Nivel", sql.VarChar, nivel)
            .query(queries.getBedroomBySexoYNivelQuery);
        await pool.close();
        return result.recordset[0];
    }
}
