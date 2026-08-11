import sql from 'mssql';
import { withConnection } from '../database/connection.js';

// Predicado de vigencia reutilizado: grant activo y no expirado.
const VIGENTE = `Activo = 1
                 AND (Vigencia = 'PERMANENTE' OR FechaExpira IS NULL OR FechaExpira > GETDATE())`;

// Upsert idempotente por (IdLogin, Tipo, IdDormitorio) -> respeta
// UQ_CheckerGrant_Tipo_Dorm. El alcance es por TIPO de punto (Dormitorio/Caseta);
// IdPoint ya no se usa. Si existe, reactiva y actualiza Scope/Vigencia/FechaExpira.
export const createOrReactivateGrant = ({ idLogin, tipo, idDormitorio = null, scope, vigencia, fechaExpira = null, asignadoPor }) =>
    withConnection(async (pool) => {
        const existing = await pool.request()
            .input('IdLogin', sql.Int, idLogin)
            .input('Tipo', sql.NVarChar(12), tipo)
            .input('IdDormitorio', sql.Int, idDormitorio)
            .query(`SELECT IdGrant FROM CheckerGrant
                    WHERE IdLogin = @IdLogin AND Tipo = @Tipo
                      AND ((IdDormitorio IS NULL AND @IdDormitorio IS NULL) OR IdDormitorio = @IdDormitorio)`);

        if (existing.recordset.length > 0) {
            const idGrant = existing.recordset[0].IdGrant;
            const updated = await pool.request()
                .input('IdGrant', sql.Int, idGrant)
                .input('Scope', sql.NVarChar(10), scope)
                .input('Vigencia', sql.NVarChar(12), vigencia)
                .input('FechaExpira', sql.DateTime, fechaExpira)
                .input('AsignadoPor', sql.Int, asignadoPor)
                .query(`UPDATE CheckerGrant
                        SET Scope = @Scope, Vigencia = @Vigencia, FechaExpira = @FechaExpira,
                            AsignadoPor = @AsignadoPor, Activo = 1
                        WHERE IdGrant = @IdGrant;
                        SELECT * FROM CheckerGrant WHERE IdGrant = @IdGrant;`);
            return { grant: updated.recordset[0], reactivated: true };
        }

        const inserted = await pool.request()
            .input('IdLogin', sql.Int, idLogin)
            .input('Tipo', sql.NVarChar(12), tipo)
            .input('IdDormitorio', sql.Int, idDormitorio)
            .input('Scope', sql.NVarChar(10), scope)
            .input('Vigencia', sql.NVarChar(12), vigencia)
            .input('FechaExpira', sql.DateTime, fechaExpira)
            .input('AsignadoPor', sql.Int, asignadoPor)
            .query(`INSERT INTO CheckerGrant (IdLogin, Tipo, IdDormitorio, Scope, AsignadoPor, Vigencia, FechaExpira)
                    VALUES (@IdLogin, @Tipo, @IdDormitorio, @Scope, @AsignadoPor, @Vigencia, @FechaExpira);
                    SELECT * FROM CheckerGrant WHERE IdGrant = SCOPE_IDENTITY();`);
        return { grant: inserted.recordset[0], reactivated: false };
    });

// Grant vigente de un usuario para un TIPO de punto. Para Dormitorio se matchea
// IdDormitorio (el del alumno del check); para Caseta IdDormitorio es irrelevante.
export const findActiveGrantByTipo = (idLogin, tipo, idDormitorio = null) =>
    withConnection(async (pool) => {
        const req = pool.request()
            .input('IdLogin', sql.Int, idLogin)
            .input('Tipo', sql.NVarChar(12), tipo)
            .input('IdDormitorio', sql.Int, idDormitorio);
        const dormFilter = tipo === 'Dormitorio' ? 'AND IdDormitorio = @IdDormitorio' : '';
        const result = await req.query(`SELECT TOP 1 * FROM CheckerGrant
                    WHERE IdLogin = @IdLogin AND Tipo = @Tipo ${dormFilter} AND ${VIGENTE}`);
        return result.recordset[0] || null;
    });

// Capabilities vigentes del usuario para login / getCapabilities.
// CHECKER -> { type, pointType, idDormitorio?, scope }; SUPERVISOR -> { type } (global).
export const findCapabilitiesByLogin = (idLogin) =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .input('IdLogin', sql.Int, idLogin)
            .query(`SELECT Capability, Tipo, IdDormitorio, Scope FROM CheckerGrant
                    WHERE IdLogin = @IdLogin AND ${VIGENTE}`);
        return result.recordset.map((r) => {
            if (r.Capability === 'SUPERVISOR') return { type: 'SUPERVISOR' };
            return {
                type: 'CHECKER',
                pointType: r.Tipo,
                ...(r.Tipo === 'Dormitorio' ? { idDormitorio: r.IdDormitorio } : {}),
                scope: r.Scope
            };
        });
    });

// Otorga/reactiva la capability SUPERVISOR (global, solo lectura) sobre una cuenta.
// Upsert por (IdLogin, Capability='SUPERVISOR'); reutiliza el esquema de CheckerGrant.
export const createOrReactivateSupervisorGrant = (idLogin, asignadoPor) =>
    withConnection(async (pool) => {
        const existing = await pool.request()
            .input('IdLogin', sql.Int, idLogin)
            .query(`SELECT IdGrant FROM CheckerGrant
                    WHERE IdLogin = @IdLogin AND Capability = 'SUPERVISOR'`);

        if (existing.recordset.length > 0) {
            const idGrant = existing.recordset[0].IdGrant;
            const updated = await pool.request()
                .input('IdGrant', sql.Int, idGrant)
                .input('AsignadoPor', sql.Int, asignadoPor)
                .query(`UPDATE CheckerGrant SET Activo = 1, AsignadoPor = @AsignadoPor
                        WHERE IdGrant = @IdGrant;
                        SELECT * FROM CheckerGrant WHERE IdGrant = @IdGrant;`);
            return { grant: updated.recordset[0], reactivated: true };
        }

        const inserted = await pool.request()
            .input('IdLogin', sql.Int, idLogin)
            .input('AsignadoPor', sql.Int, asignadoPor)
            .query(`INSERT INTO CheckerGrant (IdLogin, Capability, Tipo, IdDormitorio, Scope, AsignadoPor, Vigencia, Activo)
                    VALUES (@IdLogin, 'SUPERVISOR', NULL, NULL, 'AMBOS', @AsignadoPor, 'PERMANENTE', 1);
                    SELECT * FROM CheckerGrant WHERE IdGrant = SCOPE_IDENTITY();`);
        return { grant: inserted.recordset[0], reactivated: false };
    });

// Revoca (borra) la capability SUPERVISOR de una cuenta.
export const deleteSupervisorGrant = (idLogin) =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .input('IdLogin', sql.Int, idLogin)
            .query(`DELETE FROM CheckerGrant WHERE IdLogin = @IdLogin AND Capability = 'SUPERVISOR'`);
        return result.rowsAffected[0] > 0;
    });

// Listado de grants scopeado por rol del que consulta (pantalla de gestion).
// PRECEPTOR -> Dormitorio de su dorm; VIGILANCIA -> Caseta.
export const findGrantsScoped = ({ tipo, idDormitorio = null }) =>
    withConnection(async (pool) => {
        const req = pool.request().input('Tipo', sql.NVarChar(12), tipo);
        let dormFilter = '';
        if (tipo === 'Dormitorio') {
            req.input('IdDormitorio', sql.Int, idDormitorio);
            dormFilter = 'AND CG.IdDormitorio = @IdDormitorio';
        }
        const result = await req.query(`SELECT CG.IdGrant, CG.IdLogin, CG.Tipo, CG.IdDormitorio,
                           CG.Scope, CG.Vigencia, CG.FechaExpira, CG.Activo, CG.AsignadoPor, CG.FechaCreacion,
                           L.Matricula, L.Nombre, L.Apellidos, L.TipoUser
                    FROM CheckerGrant CG
                    INNER JOIN LoginUniPass L ON L.IdLogin = CG.IdLogin
                    WHERE CG.Tipo = @Tipo ${dormFilter} AND CG.Activo = 1
                    ORDER BY CG.FechaCreacion DESC`);
        return result.recordset;
    });

// Todos los grants de un usuario (para construir su UI).
export const findGrantsByLogin = (idLogin) =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .input('IdLogin', sql.Int, idLogin)
            .query(`SELECT IdGrant, IdLogin, Tipo, IdDormitorio, Scope, Vigencia,
                           FechaExpira, Activo, AsignadoPor, FechaCreacion
                    FROM CheckerGrant
                    WHERE IdLogin = @IdLogin AND Capability = 'CHECKER'
                    ORDER BY FechaCreacion DESC`);
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
