import sql from 'mssql';
import { withConnection } from '../database/connection.js';

// Predicado de vigencia reutilizado: grant activo y no expirado.
const VIGENTE = `Activo = 1
                 AND (Vigencia = 'PERMANENTE' OR FechaExpira IS NULL OR FechaExpira > GETDATE())`;

// Upsert idempotente por (IdLogin, IdPoint) -> respeta UQ_CheckerGrant_Login_Point.
// Si ya existe, reactiva y actualiza Scope/Vigencia/FechaExpira/AsignadoPor.
// Si no existe, inserta. Devuelve el grant resultante.
export const createOrReactivateGrant = ({ idLogin, idPoint, scope, vigencia, fechaExpira = null, asignadoPor }) =>
    withConnection(async (pool) => {
        const existing = await pool.request()
            .input('IdLogin', sql.Int, idLogin)
            .input('IdPoint', sql.Int, idPoint)
            .query('SELECT IdGrant FROM CheckerGrant WHERE IdLogin = @IdLogin AND IdPoint = @IdPoint');

        if (existing.recordset.length > 0) {
            const idGrant = existing.recordset[0].IdGrant;
            const updated = await pool.request()
                .input('IdGrant', sql.Int, idGrant)
                .input('Scope', sql.NVarChar(10), scope)
                .input('Vigencia', sql.NVarChar(12), vigencia)
                .input('FechaExpira', sql.DateTime, fechaExpira)
                .input('AsignadoPor', sql.Int, asignadoPor)
                .query(`UPDATE CheckerGrant
                        SET Scope = @Scope,
                            Vigencia = @Vigencia,
                            FechaExpira = @FechaExpira,
                            AsignadoPor = @AsignadoPor,
                            Activo = 1
                        WHERE IdGrant = @IdGrant;
                        SELECT * FROM CheckerGrant WHERE IdGrant = @IdGrant;`);
            return { grant: updated.recordset[0], reactivated: true };
        }

        const inserted = await pool.request()
            .input('IdLogin', sql.Int, idLogin)
            .input('IdPoint', sql.Int, idPoint)
            .input('Scope', sql.NVarChar(10), scope)
            .input('Vigencia', sql.NVarChar(12), vigencia)
            .input('FechaExpira', sql.DateTime, fechaExpira)
            .input('AsignadoPor', sql.Int, asignadoPor)
            .query(`INSERT INTO CheckerGrant (IdLogin, IdPoint, Scope, AsignadoPor, Vigencia, FechaExpira)
                    VALUES (@IdLogin, @IdPoint, @Scope, @AsignadoPor, @Vigencia, @FechaExpira);
                    SELECT * FROM CheckerGrant WHERE IdGrant = SCOPE_IDENTITY();`);
        return { grant: inserted.recordset[0], reactivated: false };
    });

// Grant vigente de un usuario sobre un punto. Usado por la autorizacion de /checks.
export const findActiveGrant = (idLogin, idPoint) =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .input('IdLogin', sql.Int, idLogin)
            .input('IdPoint', sql.Int, idPoint)
            .query(`SELECT TOP 1 * FROM CheckerGrant
                    WHERE IdLogin = @IdLogin AND IdPoint = @IdPoint AND ${VIGENTE}`);
        return result.recordset[0] || null;
    });

// Capabilities vigentes del usuario para exponer en login / getCapabilities.
export const findCapabilitiesByLogin = (idLogin) =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .input('IdLogin', sql.Int, idLogin)
            .query(`SELECT IdPoint, Scope FROM CheckerGrant
                    WHERE IdLogin = @IdLogin AND ${VIGENTE}`);
        return result.recordset.map((r) => ({
            type: 'CHECKER',
            idPoint: r.IdPoint,
            scope: r.Scope
        }));
    });

// Checkers activos de un punto (pantalla de gestion).
export const findGrantsByPoint = (idPoint) =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .input('IdPoint', sql.Int, idPoint)
            .query(`SELECT CG.IdGrant, CG.IdLogin, CG.IdPoint, CG.Scope, CG.Vigencia,
                           CG.FechaExpira, CG.Activo, CG.AsignadoPor, CG.FechaCreacion,
                           L.Matricula, L.Nombre, L.Apellidos, L.TipoUser
                    FROM CheckerGrant CG
                    INNER JOIN LoginUniPass L ON L.IdLogin = CG.IdLogin
                    WHERE CG.IdPoint = @IdPoint AND CG.Activo = 1
                    ORDER BY CG.FechaCreacion DESC`);
        return result.recordset;
    });

// Todos los grants de un usuario (para construir su UI).
export const findGrantsByLogin = (idLogin) =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .input('IdLogin', sql.Int, idLogin)
            .query(`SELECT CG.*, P.NombrePunto
                    FROM CheckerGrant CG
                    LEFT JOIN Point P ON P.IdPoint = CG.IdPoint
                    WHERE CG.IdLogin = @IdLogin
                    ORDER BY CG.FechaCreacion DESC`);
        return result.recordset;
    });

export const setGrantActivo = (idGrant, activo) =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .input('IdGrant', sql.Int, idGrant)
            .input('Activo', sql.Bit, activo)
            .query('UPDATE CheckerGrant SET Activo = @Activo WHERE IdGrant = @IdGrant');
        return result.rowsAffected[0] > 0;
    });

export const deleteGrant = (idGrant) =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .input('IdGrant', sql.Int, idGrant)
            .query('DELETE FROM CheckerGrant WHERE IdGrant = @IdGrant');
        return result.rowsAffected[0] > 0;
    });
