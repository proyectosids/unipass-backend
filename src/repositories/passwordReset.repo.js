import sql from 'mssql';
import { withConnection } from '../database/connection.js';

// Task 7.1.B - Persistencia de reset tokens (solo hash). Un solo uso + expiración.

export const createResetToken = ({ idLogin, tokenHash, expiraEn }) =>
    withConnection(async (pool) => {
        await pool.request()
            .input('IdLogin', sql.Int, idLogin)
            .input('Hash', sql.NVarChar(128), tokenHash)
            .input('ExpiraEn', sql.DateTime, expiraEn)
            .query(`INSERT INTO UNIPASS.PasswordReset (IdLogin, ResetTokenHash, ExpiraEn)
                    VALUES (@IdLogin, @Hash, @ExpiraEn)`);
    });

export const findResetByTokenHash = (tokenHash) =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .input('Hash', sql.NVarChar(128), tokenHash)
            .query(`SELECT TOP 1 Id, IdLogin, ExpiraEn, UsadoEn
                    FROM UNIPASS.PasswordReset WHERE ResetTokenHash = @Hash
                    ORDER BY Id DESC`);
        return result.recordset[0] || null;
    });

// Consume el reset token (single-use, race-safe) y actualiza la contraseña, de forma
// ATÓMICA. El UPDATE de consumo filtra UsadoEn IS NULL: si 0 filas -> ya usado (concurrencia)
// -> ROLLBACK y devuelve false. Si todo OK -> commit y true.
export const consumeResetAndUpdatePasswordTx = ({ resetId, idLogin, hashedPassword }) =>
    withConnection(async (pool) => {
        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            const consume = await new sql.Request(tx)
                .input('Id', sql.Int, resetId)
                .query('UPDATE UNIPASS.PasswordReset SET UsadoEn = GETDATE() WHERE Id = @Id AND UsadoEn IS NULL');
            if (consume.rowsAffected[0] !== 1) {
                await tx.rollback();
                return false; // ya consumido (single-use)
            }
            await new sql.Request(tx)
                .input('IdLogin', sql.Int, idLogin)
                .input('Password', sql.VarChar, hashedPassword)
                .query('UPDATE UNIPASS.LoginUniPass SET Contraseña = @Password WHERE IdLogin = @IdLogin');
            await tx.commit();
            return true;
        } catch (error) {
            try { await tx.rollback(); } catch (rbErr) { console.error('[Tx] rollback error:', rbErr.message); }
            throw error;
        }
    });
