import sql from 'mssql';
import { withConnection } from '../database/connection.js';

// Repositorio de Doctos + DocumentCatalog (expediente documental del alumno).
// Regla de dormitorio: IdDormitorio = 5 significa vista global (dormitorios 1-4).

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
            .query(`
                SELECT
                    D.IdDoctos,
                    D.IdLogin,
                    D.IdDocumento,
                    D.Archivo,
                    D.StatusDoctos,
                    D.StatusRevision,
                    D.MotivoRechazo,
                    D.ComentarioRechazo,
                    D.FechaRechazo,
                    DC.TipoDocumento,
                    LTRIM(RTRIM(CONCAT(LP.Nombre, ' ', LP.Apellidos))) AS RechazadoPor
                FROM Doctos D
                LEFT JOIN DocumentCatalog DC ON DC.IdDocument = D.IdDocumento
                LEFT JOIN LoginUniPass LP ON LP.Matricula = D.RechazadoPor
                WHERE D.IdLogin = @Id
            `);
        return result.recordset;
    });

// Upsert: si ya existe (IdLogin, IdDocumento), actualiza limpiando campos de rechazo.
// Si no existe, inserta normal.
export const createDocument = ({ idDocumento, archivo, idLogin, statusDoctos = 'Adjunto' }) =>
    withConnection(async (pool) => {
        const existing = await pool.request()
            .input('IdLogin', sql.Int, idLogin)
            .input('IdDocumento', sql.Int, idDocumento)
            .query(`SELECT IdDoctos FROM Doctos
                    WHERE IdLogin = @IdLogin AND IdDocumento = @IdDocumento`);

        if (existing.recordset.length > 0) {
            const existingId = existing.recordset[0].IdDoctos;
            await pool.request()
                .input('IdDoctos', sql.Int, existingId)
                .input('Archivo', sql.VarChar, archivo)
                .input('StatusDoctos', sql.VarChar, statusDoctos)
                .query(`UPDATE Doctos
                        SET Archivo = @Archivo,
                            StatusDoctos = @StatusDoctos,
                            StatusRevision = 'Pendiente',
                            MotivoRechazo = NULL,
                            ComentarioRechazo = NULL,
                            RechazadoPor = NULL,
                            FechaRechazo = NULL
                        WHERE IdDoctos = @IdDoctos`);
            return existingId;
        }

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
            .query(`UPDATE Doctos
                    SET Archivo = @Archivo,
                        StatusRevision = 'Pendiente',
                        MotivoRechazo = NULL,
                        ComentarioRechazo = NULL,
                        RechazadoPor = NULL,
                        FechaRechazo = NULL
                    WHERE IdDocumento = @IdDocumento AND IdLogin = @IdLogin`);
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
                SELECT
                    Doctos.*,
                    DocumentCatalog.*,
                    LTRIM(RTRIM(CONCAT(LR.Nombre, ' ', LR.Apellidos))) AS NombreRechazadoPor
                FROM Doctos
                INNER JOIN DocumentCatalog ON DocumentCatalog.IdDocument = Doctos.IdDocumento
                INNER JOIN LoginUniPass ON LoginUniPass.IdLogin = Doctos.IdLogin
                LEFT JOIN LoginUniPass LR ON LR.Matricula = Doctos.RechazadoPor
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

export const rejectDocument = ({ idLogin, idDocumento, motivo, comentario, matriculaPreceptor }) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('IdLogin', sql.Int, idLogin)
            .input('IdDocumento', sql.Int, idDocumento)
            .input('Motivo', sql.VarChar(80), motivo)
            .input('Comentario', sql.NVarChar(500), comentario || null)
            .input('Matricula', sql.VarChar(20), matriculaPreceptor)
            .query(`UPDATE Doctos
                    SET StatusRevision = 'Rechazado',
                        MotivoRechazo = @Motivo,
                        ComentarioRechazo = @Comentario,
                        RechazadoPor = @Matricula,
                        FechaRechazo = GETDATE()
                    WHERE IdLogin = @IdLogin AND IdDocumento = @IdDocumento`);
        return result.rowsAffected[0] > 0;
    });

// Devuelve { tokenFCM, tipoDocumento, matricula } para construir la notificacion.
export const findRejectNotificationContext = (idLogin, idDocumento) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('IdLogin', sql.Int, idLogin)
            .input('IdDocumento', sql.Int, idDocumento)
            .query(`SELECT LP.TokenCFM AS TokenFCM, LP.Matricula, DC.TipoDocumento
                    FROM LoginUniPass LP
                    INNER JOIN DocumentCatalog DC ON DC.IdDocument = @IdDocumento
                    WHERE LP.IdLogin = @IdLogin`);
        return result.recordset[0] || null;
    });
