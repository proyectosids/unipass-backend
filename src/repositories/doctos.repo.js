import sql from 'mssql';
import { withConnection } from '../database/connection.js';

export const findDocumentByLoginAndType = (idLogin, idDocumento) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('id', sql.Int, idLogin)
            .input('IdDocumento', sql.Int, idDocumento)
            .query('SELECT Archivo FROM Doctos WHERE IdLogin = @id AND IdDocumento = @IdDocumento');
        return result.recordset[0] || null;
    });

export const findDocumentsByLogin = (idLogin) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('Id', sql.Int, idLogin)
            .query('SELECT * FROM Doctos WHERE IdLogin = @Id');
        return result.recordset;
    });

export const createDocument = ({ idDocumento, archivo, idLogin, statusDoctos = 'Adjunto' }) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('IdDocumento', sql.Int, idDocumento)
            .input('Archivo', sql.VarChar, archivo)
            .input('StatusDoctos', sql.VarChar, statusDoctos)
            .input('IdLogin', sql.Int, idLogin)
            .query(`INSERT INTO Doctos (IdDocumento, Archivo, StatusDoctos, IdLogin)
                    VALUES (@IdDocumento, @Archivo, @StatusDoctos, @IdLogin);
                    SELECT SCOPE_IDENTITY() AS IdDoctos`);
        if (result.recordset.length === 0) return null;
        return result.recordset[0].IdDoctos;
    });

export const updateDocumentArchivo = (idLogin, idDocumento, archivo) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('IdDocumento', sql.Int, idDocumento)
            .input('Archivo', sql.VarChar, archivo)
            .input('IdLogin', sql.Int, idLogin)
            .query('UPDATE Doctos SET Archivo = @Archivo WHERE IdDocumento = @IdDocumento AND IdLogin = @IdLogin');
        return result.rowsAffected[0] > 0;
    });

export const deleteDocument = (idLogin, idDocumento) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('Id', sql.Int, idLogin)
            .input('IdDocumento', sql.Int, idDocumento)
            .query('DELETE FROM Doctos WHERE IdLogin = @Id AND IdDocumento = @IdDocumento');
        return result.rowsAffected[0] > 0;
    });

export const findExpedientesByDormitorio = (idDormitorio) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('IdDormitorio', sql.Int, idDormitorio)
            .query(`
                SELECT DISTINCT L.Matricula, L.Nombre, L.Apellidos
                FROM Doctos D
                INNER JOIN DocumentCatalog DC ON DC.IdDocument = D.IdDocumento
                INNER JOIN LoginUniPass L ON L.IdLogin = D.IdLogin
                WHERE L.TipoUser = 'ALUMNO'
                  AND (
                      (@IdDormitorio = 5 AND L.Dormitorio BETWEEN 1 AND 4)
                      OR
                      (@IdDormitorio <> 5 AND L.Dormitorio = @IdDormitorio)
                  );
            `);
        return result.recordset;
    });

export const findArchivosFiltered = ({ dormitorio, nombre, apellidos, matricula }) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('Dormitorio', sql.Int, dormitorio)
            .input('Nombre', sql.VarChar, nombre || null)
            .input('Apellidos', sql.VarChar, apellidos || null)
            .input('Matricula', sql.VarChar, matricula || null)
            .query(`
                SELECT Doctos.*, DocumentCatalog.*
                FROM Doctos
                INNER JOIN DocumentCatalog ON DocumentCatalog.IdDocument = Doctos.IdDocumento
                INNER JOIN LoginUniPass ON LoginUniPass.IdLogin = Doctos.IdLogin
                WHERE DocumentCatalog.Estado = 'Activo'
                  AND (
                      (@Dormitorio = 5 AND LoginUniPass.Matricula = @Matricula)
                      OR (@Dormitorio <> 5 AND
                          LoginUniPass.Dormitorio = @Dormitorio AND
                          (@Nombre IS NULL OR LoginUniPass.Nombre = @Nombre) AND
                          (@Apellidos IS NULL OR LoginUniPass.Apellidos = @Apellidos)
                      )
                  );
            `);
        return result.recordset;
    });

export const approveDocument = (idLogin, idDocumento) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('Id', sql.Int, idLogin)
            .input('IdDocumento', sql.Int, idDocumento)
            .query("UPDATE Doctos SET StatusRevision = 'Aprobado' WHERE IdLogin = @Id AND IdDocumento = @IdDocumento");
        return result.rowsAffected[0] > 0;
    });
