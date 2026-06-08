import sql from 'mssql';
import { withConnection } from '../database/connection.js';

export const findPointsByExitId = (idExit) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('IdSalida', sql.Int, idExit)
            .query('SELECT * FROM Point WHERE IdExit = @IdSalida');
        return result.recordset;
    });
