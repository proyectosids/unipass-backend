import sql from 'mssql';
import { withConnection } from '../database/connection.js';

export const createRefreshToken = ({ idLogin, tokenHash, expiresAt, deviceInfo }) =>
    withConnection(async (pool) => {
        await pool
            .request()
            .input('IdLogin', sql.Int, idLogin)
            .input('TokenHash', sql.VarChar, tokenHash)
            .input('ExpiresAt', sql.DateTime, expiresAt)
            .input('DeviceInfo', sql.VarChar, deviceInfo)
            .query(`INSERT INTO RefreshToken (IdLogin, TokenHash, ExpiresAt, DeviceInfo)
                    VALUES (@IdLogin, @TokenHash, @ExpiresAt, @DeviceInfo)`);
    });

export const findRefreshTokenByHash = (tokenHash) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('TokenHash', sql.VarChar, tokenHash)
            .query('SELECT * FROM RefreshToken WHERE TokenHash = @TokenHash');
        return result.recordset[0] || null;
    });

export const revokeAllUserRefreshTokens = (idLogin) =>
    withConnection(async (pool) => {
        await pool
            .request()
            .input('IdLogin', sql.Int, idLogin)
            .query(`UPDATE RefreshToken
                    SET RevokedAt = GETDATE()
                    WHERE IdLogin = @IdLogin AND RevokedAt IS NULL`);
    });

export const revokeRefreshTokenById = (refreshTokenId, replacedByHash) =>
    withConnection(async (pool) => {
        await pool
            .request()
            .input('RefreshTokenId', sql.Int, refreshTokenId)
            .input('ReplacedBy', sql.VarChar, replacedByHash)
            .query(`UPDATE RefreshToken
                    SET RevokedAt = GETDATE(), ReplacedByTokenHash = @ReplacedBy
                    WHERE RefreshTokenId = @RefreshTokenId`);
    });

export const revokeRefreshTokenByHash = (tokenHash) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('TokenHash', sql.VarChar, tokenHash)
            .query(`UPDATE RefreshToken
                    SET RevokedAt = GETDATE()
                    OUTPUT INSERTED.RefreshTokenId, INSERTED.IdLogin
                    WHERE TokenHash = @TokenHash AND RevokedAt IS NULL`);
        return result.recordset[0] || null;
    });
