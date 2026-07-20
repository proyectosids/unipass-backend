import sql from 'mssql';
import { withConnection } from '../database/connection.js';

// Repositorio de dbo.Configuracion (clave/valor): parametros operables con un
// UPDATE en BD, sin redesplegar codigo. Claves en uso: AUTORIZADOR_SALIDAS,
// COORDINADOR_IDEMPLEADO, COORDINADOR_NODEPTO (migracion 005).

export const findConfigValue = (clave) =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .input('Clave', sql.NVarChar(80), clave)
            .query('SELECT Valor FROM dbo.Configuracion WHERE Clave = @Clave');
        return result.recordset[0]?.Valor ?? null;
    });
