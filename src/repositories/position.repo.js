import sql from 'mssql';
import { withConnection } from '../database/connection.js';

// Repositorio de Position (suplencias): el suplente se liga al cargo via
// LoginUniPass.IdCargoDelegado -> Position.IdCargo; el encargado por MatriculaEncargado.

export const findPositionByMatricula = (matricula) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('Id', sql.VarChar, matricula)
            .query(`SELECT * FROM LoginUniPass INNER JOIN
                    Position ON LoginUniPass.IdCargoDelegado = Position.IdCargo
                    WHERE LoginUniPass.Matricula = @Id`);
        return result.recordset[0] || null;
    });

export const findPositionsByMatriculaEncargado = (matricula) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('Id', sql.VarChar, matricula)
            .query(`SELECT * FROM LoginUniPass INNER JOIN
                    Position ON LoginUniPass.IdCargoDelegado = Position.IdCargo
                    WHERE Position.MatriculaEncargado = @Id`);
        return result.recordset.length > 0 ? result.recordset : null;
    });

export const createPosition = ({ matriculaEncargado, classUser, asignado }) =>
    withConnection(async (pool) => {
        const insertResult = await pool
            .request()
            .input('MatriculaEncargado', sql.VarChar, matriculaEncargado)
            .input('ClassUser', sql.VarChar, classUser)
            .input('Asignado', sql.VarChar, asignado)
            .input('Activo', sql.Int, 0)
            .query(`INSERT INTO Position (MatriculaEncargado, ClassUser, Asignado, Activo)
                    VALUES (@MatriculaEncargado, @ClassUser, @Asignado, @Activo);
                    SELECT SCOPE_IDENTITY() AS id;`);

        if (insertResult.rowsAffected[0] === 0) return null;

        const newId = insertResult.recordset[0].id;
        const created = await pool
            .request()
            .input('id', sql.Int, newId)
            .query('SELECT * FROM Position WHERE IdCargo = @id');
        return created.recordset[0];
    });

export const updatePositionActivo = (idCargo, activo) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('Id', sql.VarChar, idCargo)
            .input('Activo', sql.Int, activo)
            .query('UPDATE Position SET Activo = @Activo WHERE IdCargo = @Id');
        return result.rowsAffected[0] > 0;
    });
