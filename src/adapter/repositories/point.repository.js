import { getConnection } from "../../infrastructure/database/connection.js";
import sql from "mssql";
import * as queries from "../../queries/point.queries.js";

export class PointRepository {
    async getPointsByExitId(idSalida) {
        const pool = await getConnection();
        const result = await pool.request()
            .input("IdSalida", sql.Int, idSalida)
            .query(queries.getPointsByExitIdQuery);

        return result.recordset;
    }
}
