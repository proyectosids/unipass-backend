import sql from 'mssql';
import { withConnection } from '../database/connection.js';

// Persistencia de registrationToken (solo hash). Ligado a matrícula + correo institucional.

export const createRegistrationToken = ({ matricula, correo, tokenHash, expiraEn }) =>
    withConnection(async (pool) => {
        await pool.request()
            .input('Matricula', sql.VarChar(10), matricula)
            .input('Correo', sql.VarChar(80), correo)
            .input('Hash', sql.NVarChar(128), tokenHash)
            .input('ExpiraEn', sql.DateTime, expiraEn)
            .query(`INSERT INTO UNIPASS.RegistrationToken (Matricula, CorreoInstitucional, TokenHash, ExpiraEn)
                    VALUES (@Matricula, @Correo, @Hash, @ExpiraEn)`);
    });

export const findRegistrationByTokenHash = (tokenHash) =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .input('Hash', sql.NVarChar(128), tokenHash)
            .query(`SELECT TOP 1 Id, Matricula, CorreoInstitucional, ExpiraEn, UsadoEn
                    FROM UNIPASS.RegistrationToken WHERE TokenHash = @Hash
                    ORDER BY Id DESC`);
        return result.recordset[0] || null;
    });

// Crea la cuenta y consume el token de forma ATOMICA (single-use race-safe).
// Devuelve { idLogin } o { conflict:'USED' } si el token ya se consumió (concurrencia).
export const consumeTokenAndCreateUserTx = ({ tokenId, user }) =>
    withConnection(async (pool) => {
        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            const consume = await new sql.Request(tx)
                .input('Id', sql.Int, tokenId)
                .query('UPDATE UNIPASS.RegistrationToken SET UsadoEn = GETDATE() WHERE Id = @Id AND UsadoEn IS NULL');
            if (consume.rowsAffected[0] !== 1) {
                await tx.rollback();
                return { conflict: 'USED' };
            }
            const ins = await new sql.Request(tx)
                .input('Matricula', sql.VarChar, user.matricula)
                .input('Contraseña', sql.VarChar, user.hashedPassword)
                .input('Correo', sql.VarChar, user.correo)
                .input('Nombre', sql.VarChar, user.nombre)
                .input('Apellidos', sql.VarChar, user.apellidos)
                .input('TipoUser', sql.VarChar, user.tipoUser)
                .input('Sexo', sql.VarChar, user.sexo)
                .input('FechaNacimiento', sql.DateTime, user.fechaNacimiento)
                .input('Celular', sql.VarChar, user.celular)
                .input('StatusActividad', sql.Int, 1)
                .input('Dormitorio', sql.Int, user.dormitorio)
                .query(`INSERT INTO UNIPASS.LoginUniPass
                          (Matricula, Contraseña, Correo, Nombre, Apellidos, TipoUser, Sexo, FechaNacimiento, Celular, StatusActividad, Dormitorio)
                        VALUES (@Matricula, @Contraseña, @Correo, @Nombre, @Apellidos, @TipoUser, @Sexo, @FechaNacimiento, @Celular, @StatusActividad, @Dormitorio);
                        SELECT SCOPE_IDENTITY() AS IdLogin;`);
            await tx.commit();
            return { idLogin: ins.recordset[0].IdLogin };
        } catch (error) {
            try { await tx.rollback(); } catch (rbErr) { console.error('[Tx] rollback error:', rbErr.message); }
            throw error;
        }
    });
