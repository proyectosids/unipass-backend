import sql from 'mssql';
import { withConnection } from '../database/connection.js';

// === LoginUniPass: lecturas ===

export const findUserById = (id) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('Id', sql.Int, id)
            .query('SELECT * FROM LoginUniPass WHERE IdLogin = @Id');
        return result.recordset[0] || null;
    });

export const findUserByMatricula = (matricula) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('Matricula', sql.VarChar, matricula)
            .query('SELECT * FROM LoginUniPass WHERE Matricula = @Matricula');
        return result.recordset[0] || null;
    });

export const findUserByMatriculaOrCorreo = (value) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('Matricula', sql.VarChar, value)
            .query('SELECT * FROM LoginUniPass WHERE Matricula = @Matricula OR Correo = @Matricula');
        return result.recordset[0] || null;
    });

export const findCheckersByEmail = (email) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('EmailEncargado', sql.VarChar, email)
            .query(`SELECT * FROM LoginUniPass WHERE TipoUser = 'DEPARTAMENTO' AND Correo = @EmailEncargado`);
        return result.recordset;
    });

export const findPersonaByNombreOApellidos = (nombre) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('Nombre', sql.VarChar, nombre)
            .query(`SELECT lp.*,
                           CASE
                               WHEN p.MatriculaEncargado IS NOT NULL THEN 'Existe en Position'
                               ELSE 'No existe en Position'
                           END AS ExisteEnPosition
                    FROM LoginUniPass AS lp
                    LEFT JOIN Position AS p ON lp.Matricula = p.Asignado
                    WHERE (lp.Nombre = @Nombre OR lp.Apellidos = @Nombre)`);
        return result.recordset;
    });

// Busqueda de personas asignables como checador (pantalla de gestion).
// LIKE parcial sobre nombre/apellidos; solo activos; sin DEPARTAMENTO (retirado).
// SELECT explicito de campos seguros: NO expone Contraseña, TokenCFM ni Correo.
export const searchAssignablePersonsByName = (q) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('q', sql.VarChar, q)
            .query(`SELECT IdLogin, Matricula, Nombre, Apellidos, TipoUser
                    FROM LoginUniPass
                    WHERE StatusActividad = 1
                      AND TipoUser <> 'DEPARTAMENTO'
                      AND (
                          Nombre COLLATE Latin1_General_CI_AI LIKE '%' + @q + '%'
                          OR Apellidos COLLATE Latin1_General_CI_AI LIKE '%' + @q + '%'
                          OR (Nombre + ' ' + Apellidos) COLLATE Latin1_General_CI_AI LIKE '%' + @q + '%'
                      )
                    ORDER BY Nombre, Apellidos`);
        return result.recordset;
    });

export const findTokenFCMByMatricula = (matricula) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('Matricula', sql.VarChar, matricula)
            .query(`IF EXISTS (
                        SELECT * FROM LoginUniPass
                        INNER JOIN Position ON LoginUniPass.IdCargoDelegado = Position.IdCargo
                        WHERE Position.MatriculaEncargado = @Matricula
                          AND Position.Activo = 1
                    )
                    BEGIN
                        SELECT TokenCFM FROM LoginUniPass
                        INNER JOIN Position ON LoginUniPass.IdCargoDelegado = Position.IdCargo
                        WHERE Position.MatriculaEncargado = @Matricula
                          AND Position.Activo = 1
                    END
                    ELSE
                    BEGIN
                        SELECT TokenCFM FROM LoginUniPass WHERE Matricula = @Matricula
                    END`);
        return result.recordset;
    });

// === LoginUniPass: escrituras ===

export const updateUserPassword = (correo, hashedPassword) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('Correo', sql.VarChar, correo)
            .input('Password', sql.VarChar, hashedPassword)
            .input('TipoUser', sql.VarChar, 'DEPARTAMENTO')
            .query('UPDATE LoginUniPass SET Contraseña = @Password WHERE Correo = @Correo AND TipoUser != @TipoUser');
        return result.rowsAffected[0] > 0;
    });

export const updateDocumentacion = (matricula, statusDoc) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('Matricula', sql.VarChar, matricula)
            .input('StatusDoc', sql.Int, statusDoc)
            .query('UPDATE LoginUniPass SET Documentacion = @StatusDoc WHERE Matricula = @Matricula');
        return result.rowsAffected[0] > 0;
    });

export const updateTokenFCM = (matricula, tokenCFM) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('Matricula', sql.VarChar, matricula)
            .input('TokenCFM', sql.VarChar, tokenCFM)
            .query('UPDATE LoginUniPass SET TokenCFM = @TokenCFM WHERE Matricula = @Matricula');
        return result.rowsAffected[0] > 0;
    });

export const clearTokenFCMByMatricula = (matricula) =>
    withConnection(async (pool) => {
        await pool
            .request()
            .input('Matricula', sql.VarChar, matricula)
            .query('UPDATE LoginUniPass SET TokenCFM = NULL WHERE Matricula = @Matricula');
    });

// === Cargo / Position ===

export const findIdCargoDelegadoByMatricula = (matricula) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('Matricula', sql.VarChar, matricula)
            .query('SELECT IdCargoDelegado FROM LoginUniPass WHERE Matricula = @Matricula');
        if (result.recordset.length === 0) return undefined;
        return result.recordset[0].IdCargoDelegado;
    });

export const clearIdCargoDelegado = (matricula) =>
    withConnection(async (pool) => {
        await pool
            .request()
            .input('Matricula', sql.VarChar, matricula)
            .query('UPDATE LoginUniPass SET IdCargoDelegado = NULL WHERE Matricula = @Matricula');
    });

export const deletePositionByIdCargo = (idCargo) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('IdCargo', sql.VarChar, idCargo.toString())
            .query('DELETE FROM Position WHERE IdCargo = @IdCargo');
        return result.rowsAffected[0] > 0;
    });

export const updateUserCargo = (matricula, idCargoDelegado) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('Matricula', sql.VarChar, matricula)
            .input('Delegado', sql.Int, idCargoDelegado)
            .query('UPDATE LoginUniPass SET IdCargoDelegado = @Delegado WHERE Matricula = @Matricula');
        return result.rowsAffected[0] > 0;
    });

