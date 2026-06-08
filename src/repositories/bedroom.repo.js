import sql from 'mssql';
import { withConnection } from '../database/connection.js';

export const findBedroomBySexoYNivel = (sexo, nivel) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('Sexo', sql.VarChar, sexo)
            .input('Nivel', sql.VarChar, nivel)
            .query('SELECT * FROM Bedroom WHERE NivelDormitorio = @Nivel AND Sexo = @Sexo');
        return result.recordset[0];
    });
