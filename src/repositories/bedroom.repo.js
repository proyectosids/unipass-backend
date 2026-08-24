import sql from 'mssql';
import { withConnection } from '../database/connection.js';

// Task 7.4A: Identificador institucional del dormitorio (para /api/datos/prece/:id).
// LoginUniPass.Dormitorio == Bedroom.IdBedroom -> Bedroom.Identificador. null si no existe.
export const findBedroomIdentificador = (idBedroom) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('Id', sql.Int, idBedroom)
            .query('SELECT Identificador FROM UNIPASS.Bedroom WHERE IdBedroom = @Id');
        return result.recordset[0]?.Identificador ?? null;
    });

export const findBedroomBySexoYNivel = (sexo, nivel) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('Sexo', sql.VarChar, sexo)
            .input('Nivel', sql.VarChar, nivel)
            .query('SELECT * FROM UNIPASS.Bedroom WHERE NivelDormitorio = @Nivel AND Sexo = @Sexo');
        return result.recordset[0];
    });
