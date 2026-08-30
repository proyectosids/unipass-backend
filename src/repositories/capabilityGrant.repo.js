import sql from 'mssql';
import { withConnection } from '../database/connection.js';

// Acceso a CapabilityGrant (grants genéricos de capability + scope). Único lugar que
// conoce el nombre físico de la tabla; el resto del código usa capability.service.js.

// Grants VIGENTES de un usuario: activos y no revocados.
export const findActiveGrantsByLogin = (idLogin) =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .input('IdLogin', sql.Int, idLogin)
            .query(`SELECT IdGrant, Capability, ScopeType, ScopeId
                    FROM UNIPASS.CapabilityGrant
                    WHERE IdLogin = @IdLogin AND Activo = 1 AND RevokedAt IS NULL`);
        return result.recordset;
    });

// Alta de grant (usado por scripts/aprovisionamiento controlado; NO expuesto por API todavía).
export const createGrant = ({ idLogin, capability, scopeType, scopeId = null, grantedBy = null }) =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .input('IdLogin', sql.Int, idLogin)
            .input('Capability', sql.NVarChar(20), capability)
            .input('ScopeType', sql.NVarChar(12), scopeType)
            .input('ScopeId', sql.Int, scopeId)
            .input('GrantedBy', sql.Int, grantedBy)
            .query(`INSERT INTO UNIPASS.CapabilityGrant (IdLogin, Capability, ScopeType, ScopeId, GrantedBy)
                    VALUES (@IdLogin, @Capability, @ScopeType, @ScopeId, @GrantedBy);
                    SELECT SCOPE_IDENTITY() AS IdGrant;`);
        return result.recordset[0].IdGrant;
    });

// Revoca (soft) un grant por Id.
export const revokeGrant = (idGrant) =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .input('IdGrant', sql.Int, idGrant)
            .query(`UPDATE UNIPASS.CapabilityGrant SET Activo = 0, RevokedAt = GETDATE()
                    WHERE IdGrant = @IdGrant AND RevokedAt IS NULL`);
        return result.rowsAffected[0] > 0;
    });
