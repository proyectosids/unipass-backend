import { getConnection } from "../database/connection.js";
import { hashData, VerifyHashData } from '../util/hashData.js';
import sql from 'mssql';
import { generateToken } from '../util/generateToken.js'
import {
    generateAccessToken,
    generateRefreshToken,
    hashRefreshToken,
    getRefreshExpiresAt
} from '../util/tokens.js';

export const getUsers = async (req, res) => {
    let pool;
    try {
        pool = await getConnection();
        const result = await pool.request().query('SELECT * FROM Users');
        res.json(result.recordset);
    } catch (error) {
        res.status(500).json({ error: error.message });
    } finally {
        if (pool) pool.close();
    }
};

export const getUser = async (req, res) => {
    let pool;
    try {
        console.log(req.params.Id);
        pool = await getConnection();
        const result = await pool
            .request()
            .input("Id", sql.Int, req.params.Id)
            .query("SELECT * FROM LoginUniPass WHERE IdLogin = @Id");
        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ message: "Dato no encontrado" });
        }
        return res.json(result.recordset[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    } finally {
        if (pool) pool.close();
    }
};

export const endCargo = async (req, res) => {
    let pool;
    try {
        pool = await getConnection();

        // Obtener el IdCargoDelegado relacionado
        const getIdCargoResult = await pool
            .request()
            .input("Matricula", sql.VarChar, req.params.Matricula)
            .query(`SELECT IdCargoDelegado FROM LoginUniPass WHERE Matricula = @Matricula`);

        if (getIdCargoResult.recordset.length === 0) {
            return res.status(404).json({ message: "Matrícula no encontrada" });
        }

        const idCargoDelegado = getIdCargoResult.recordset[0].IdCargoDelegado;

        // Verificar si IdCargoDelegado tiene un valor válido
        if (!idCargoDelegado) {
            return res.status(400).json({ message: "El registro no tiene un IdCargoDelegado válido" });
        }

        // Actualizar el IdCargoDelegado a NULL
        await pool
            .request()
            .input("Matricula", sql.VarChar, req.params.Matricula)
            .query(`UPDATE LoginUniPass SET IdCargoDelegado = NULL WHERE Matricula = @Matricula`);

        // Eliminar el registro en la tabla Position
        const deleteResult = await pool
            .request()
            .input("IdCargo", sql.VarChar, idCargoDelegado.toString())
            .query(`DELETE FROM Position WHERE IdCargo = @IdCargo`);

        if (deleteResult.rowsAffected[0] === 0) {
            return res.status(404).json({ message: "No se encontró un registro en Position con el IdCargo relacionado" });
        }

        return res.status(200).json({ message: "Estado actualizado y registro eliminado exitosamente" });
    } catch (error) {
        console.error('Error en el servidor:', error);
        res.status(500).send(error.message);
    } finally {
        if (pool) {
            try {
                await pool.close();
            } catch (closeError) {
                console.error('Error al cerrar la conexión a la base de datos');
            }
        }
    }
};

export const updateCargo = async (req, res) => {
    let pool;
    try {
        pool = await getConnection();
        const result = await pool
            .request()
            .input("Matricula", sql.VarChar, req.params.Matricula)
            .input("Delegado", sql.Int, req.body.IdCargoDelegado)
            .query(`UPDATE LoginUniPass SET IdCargoDelegado = @Delegado WHERE Matricula = @Matricula`);

        if (result.rowsAffected[0] > 0) {
            return res.status(200).json({ message: "Estado actualizado exitosamente" });
        } else {
            return res.status(404).json({ message: "Registro no encontrado" });
        }
    } catch (error) {
        console.error('Error en el servidor:', error);
        res.status(500).send(error.message);
    } finally {
        if (pool) {
            try {
                await pool.close();
            } catch (closeError) {
                console.error('Error al cerrar la conexion a la base de datos');
            }
        }
    }
}

export const updateUser = async (req, res) => {
    let pool;
    try {
        pool = await getConnection();
        const result = await pool
            .request()
            .input("Id", sql.Int, req.params.Id)
            .input('Matricula', sql.VarChar, req.body.Matricula)
            .input('Contraseña', sql.VarChar, req.body.Contraseña)
            .input('Correo', sql.VarChar, req.body.Correo)
            .input('Nombre', sql.VarChar, req.body.Nombre)
            .input('Telefono', sql.VarChar, req.body.Telefono)
            .input('Celular', sql.VarChar, req.body.Celular)
            .input('Sexo', sql.VarChar, req.body.Sexo)
            .input('Domicilio', sql.VarChar, req.body.Domicilio)
            .input('TipoUser', sql.VarChar, req.body.TipoUser)
            .input('IdTutor', sql.Int, req.body.IdTutor)
            .input('IdTrabajo', sql.Int, req.body.IdTrabajo)
            .query("UPDATE Tutors SET Matricula = @Matricula, Contraseña = @Contraseña, Correo = @Correo, Nombre = @Nombre, Telefono = @Telefono, Celular = @Celular, Domicilio = @Domicilio, TipoUser = @TipoUser, IdTutor = @IdTutor, IdTrabajo = @IdTrabajo WHERE IdUser = @Id");
        console.log(result);
        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ message: "Dato no encontrado" });
        }
        res.json("Dato Actulizado");
    } catch (error) {
        res.status(500).json({ error: error.message });
    } finally {
        if (pool) pool.close();
    }
};

export const deleteUser = async (req, res) => {
    let pool;
    try {
        pool = await getConnection();
        const result = await pool
            .request()
            .input("Id", sql.Int, req.params.Id)
            .query("DELETE FROM Users WHERE IdUser = @Id");
        console.log(result);
        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ message: "Dato no encontrado" });
        }
        return res.json({ message: "Dato Eliminado" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    } finally {
        if (pool) pool.close();
    }
};

//==================================== LOGIN ================================================

export const loginUser = async (req, res) => {
    let pool;
    try {
        const { Matricula, Contraseña, Correo } = req.body;
        pool = await getConnection();

        let result;

        // Intentar con matrícula
        if (Matricula || Correo) {
            result = await pool
                .request()
                .input('Matricula', sql.VarChar, Matricula)
                .query('SELECT * FROM LoginUniPass WHERE Matricula = @Matricula OR Correo = @Matricula');
        } 
        // Intentar con correo
        else if (Correo) {
            result = await pool
                .request()
                .input('Correo', sql.VarChar, Correo)
                .query('SELECT * FROM LoginUniPass WHERE Correo = @Correo');
        } else {
            return res.status(400).json({ success: false, message: 'Debe proporcionar matrícula o correo' });
        }

        if (result.recordset.length === 0) {
            return res.status(401).json({ success: false, message: 'Credenciales inválidas' });
        }

        const user = result.recordset[0];
        const isPasswordValid = await VerifyHashData(Contraseña, user.Contraseña);
        if (!isPasswordValid) {
            return res.status(401).json({ success: false, message: 'Credenciales inválidas' });
        }

        // Generar par access + refresh
        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken();
        const refreshHash = hashRefreshToken(refreshToken);
        const expiresAt = getRefreshExpiresAt();
        const deviceInfo = (req.headers['user-agent'] || '').slice(0, 255);

        await pool.request()
            .input('IdLogin', sql.Int, user.IdLogin)
            .input('TokenHash', sql.VarChar, refreshHash)
            .input('ExpiresAt', sql.DateTime, expiresAt)
            .input('DeviceInfo', sql.VarChar, deviceInfo)
            .query(`INSERT INTO RefreshToken (IdLogin, TokenHash, ExpiresAt, DeviceInfo)
                    VALUES (@IdLogin, @TokenHash, @ExpiresAt, @DeviceInfo)`);

        console.log(`[Auth] Login: userId=${user.IdLogin}`);

        // 'token' se mantiene temporalmente por compatibilidad con clientes viejos.
        return res.json({
            success: true,
            accessToken,
            refreshToken,
            token: accessToken,
            user
        });

    } catch (error) {
        console.error('[Auth] Error en login:', error);
        res.status(500).json({ error: error.message });
    } finally {
        if (pool) pool.close();
    }
};

export const refreshTokenController = async (req, res) => {
    let pool;
    try {
        const { refreshToken } = req.body || {};
        if (!refreshToken) {
            return res.status(400).json({ message: 'refreshToken requerido', code: 'MISSING_REFRESH_TOKEN' });
        }

        const tokenHash = hashRefreshToken(refreshToken);
        pool = await getConnection();

        const tokenResult = await pool.request()
            .input('TokenHash', sql.VarChar, tokenHash)
            .query('SELECT * FROM RefreshToken WHERE TokenHash = @TokenHash');

        if (tokenResult.recordset.length === 0) {
            return res.status(401).json({ message: 'Refresh token invalido', code: 'INVALID_REFRESH_TOKEN' });
        }

        const stored = tokenResult.recordset[0];

        // Detectar reuso: si ya estaba revocado, asumir robo y revocar todos los tokens activos del usuario
        if (stored.RevokedAt !== null) {
            await pool.request()
                .input('IdLogin', sql.Int, stored.IdLogin)
                .query(`UPDATE RefreshToken
                        SET RevokedAt = GETDATE()
                        WHERE IdLogin = @IdLogin AND RevokedAt IS NULL`);
            console.warn(`[Auth] Refresh REUSE detected: userId=${stored.IdLogin} - revoking all`);
            return res.status(401).json({ message: 'Refresh token reutilizado, sesion revocada', code: 'REFRESH_REUSE_DETECTED' });
        }

        if (new Date(stored.ExpiresAt) < new Date()) {
            return res.status(401).json({ message: 'Refresh token expirado', code: 'REFRESH_EXPIRED' });
        }

        // Cargar usuario para armar nuevo access token
        const userResult = await pool.request()
            .input('IdLogin', sql.Int, stored.IdLogin)
            .query('SELECT * FROM LoginUniPass WHERE IdLogin = @IdLogin');

        if (userResult.recordset.length === 0) {
            return res.status(401).json({ message: 'Usuario no encontrado', code: 'USER_NOT_FOUND' });
        }
        const user = userResult.recordset[0];

        // Rotacion: generar nuevo par
        const newAccess = generateAccessToken(user);
        const newRefresh = generateRefreshToken();
        const newHash = hashRefreshToken(newRefresh);
        const newExpires = getRefreshExpiresAt();
        const deviceInfo = (req.headers['user-agent'] || '').slice(0, 255);

        // Marcar el viejo como revocado y reemplazado
        await pool.request()
            .input('RefreshTokenId', sql.Int, stored.RefreshTokenId)
            .input('ReplacedBy', sql.VarChar, newHash)
            .query(`UPDATE RefreshToken
                    SET RevokedAt = GETDATE(), ReplacedByTokenHash = @ReplacedBy
                    WHERE RefreshTokenId = @RefreshTokenId`);

        // Insertar el nuevo
        await pool.request()
            .input('IdLogin', sql.Int, user.IdLogin)
            .input('TokenHash', sql.VarChar, newHash)
            .input('ExpiresAt', sql.DateTime, newExpires)
            .input('DeviceInfo', sql.VarChar, deviceInfo)
            .query(`INSERT INTO RefreshToken (IdLogin, TokenHash, ExpiresAt, DeviceInfo)
                    VALUES (@IdLogin, @TokenHash, @ExpiresAt, @DeviceInfo)`);

        console.log(`[Auth] Refresh: userId=${user.IdLogin} tokenId=${stored.RefreshTokenId}`);

        return res.json({ accessToken: newAccess, refreshToken: newRefresh });
    } catch (error) {
        console.error('[Auth] Error en refresh:', error);
        res.status(500).json({ error: 'Error en refresh' });
    } finally {
        if (pool) {
            try { await pool.close(); } catch (e) { console.error('Error cerrando pool:', e.message); }
        }
    }
};

export const logoutUser = async (req, res) => {
    let pool;
    try {
        const { refreshToken } = req.body || {};
        if (!refreshToken) {
            return res.status(400).json({ message: 'refreshToken requerido', code: 'MISSING_REFRESH_TOKEN' });
        }

        const tokenHash = hashRefreshToken(refreshToken);
        pool = await getConnection();

        const result = await pool.request()
            .input('TokenHash', sql.VarChar, tokenHash)
            .query(`UPDATE RefreshToken
                    SET RevokedAt = GETDATE()
                    OUTPUT INSERTED.RefreshTokenId, INSERTED.IdLogin
                    WHERE TokenHash = @TokenHash AND RevokedAt IS NULL`);

        if (result.recordset.length > 0) {
            const { RefreshTokenId, IdLogin } = result.recordset[0];
            console.log(`[Auth] Logout: userId=${IdLogin} tokenId=${RefreshTokenId}`);
        }

        return res.status(204).send();
    } catch (error) {
        console.error('[Auth] Error en logout:', error);
        res.status(500).json({ error: 'Error en logout' });
    } finally {
        if (pool) {
            try { await pool.close(); } catch (e) { console.error('Error cerrando pool:', e.message); }
        }
    }
};

export const verifySessionToken = (req, res) => {
    // Si el middleware pasó, el token es válido
    res.status(200).json({ success: true, user: req.user });
};

//==================================== FIN LOGIN ================================================

//==================================== CAMBIAR CONTRASEÑA (aNALIZARA PARA SU MEJORA) ====================================

export const putPassword = async (req, res) => {
    let pool;
    try {
        const { Correo } = req.params; // Correo del usuario
        const { NewPassword } = req.body; // Nueva contraseña enviada en la petición
        // Hashear la nueva contraseña
        const hashedPassword = await hashData(NewPassword);
        
        pool = await getConnection();
        const result = await pool
            .request()
            .input('Correo', sql.VarChar, Correo)
            .input('Password', sql.VarChar, hashedPassword) // La nueva contraseña
            .input('TipoUser', sql.VarChar, "DEPARTAMENTO")
            .query('UPDATE LoginUniPass SET Contraseña = @Password WHERE Correo = @Correo AND TipoUser != @TipoUser');

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ message: "Contraseña no actualizada" });
        }

        res.json({ message: "Contraseña actualizado correctamente" });
    } catch (error) {
        console.error('Error al actualizar la contraseña:', error);
        res.status(500).json({ error: 'Error al actualizar la contraseña' });
    } finally {
        if (pool) {
            try {
                await pool.close();
            } catch (closeError) {
                console.error('Error al cerrar la conexión a la base de datos:', closeError);
            }
        }
    }
}

export const BuscarUserMatricula = async (req, res) => {
    let pool;
    try {
        console.log(req.params.Matricula);
        pool = await getConnection();
        const result = await pool
            .request()
            .input("Matricula", sql.VarChar, req.params.Matricula)
            .query("SELECT * FROM LoginUniPass WHERE Matricula = @Matricula");
        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ message: "Dato no encontrado" });
        }
        return res.json(result.recordset[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    } finally {
        if (pool) pool.close();
    }
};

export const getBuscarCheckers = async (req, res) => {
    let pool;
    try {
        console.log(req.params.EmailAsignador)
        pool = await getConnection();
        const result = await pool
            .request()
            .input("EmailEncargado", sql.VarChar, req.params.EmailAsignador)
            .query(`SELECT * FROM LoginUniPass WHERE TipoUser = 'DEPARTAMENTO' AND Correo = @EmailEncargado`)
        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({message: "No hay datos registrados"})
        }
        return res.json(result.recordset);
    } catch (error) {
        res.status(500).json({ error: error.message});
    } finally {
        if (pool) {
            try {
                await pool.close();
            } catch (closeError) {
                console.error('Error al cerrar la conexión a la base de datos:', closeError);
            }
        }
    }
}

export const buscarPersona = async (req, res) => {
    let pool;
    try {
        pool = await getConnection();
        const result = await pool
            .request()
            .input('Nombre', sql.VarChar, req.params.Nombre)
            .query(`SELECT 
                lp.*, 
                CASE 
                    WHEN p.MatriculaEncargado IS NOT NULL THEN 'Existe en Position' 
                    ELSE 'No existe en Position' 
                END AS ExisteEnPosition
            FROM 
                LoginUniPass AS lp
            LEFT JOIN 
                Position AS p ON lp.Matricula = p.Asignado
            WHERE 
                (lp.Nombre = @Nombre OR lp.Apellidos = @Nombre)
                `);
        
        if (result.rowsAffected[0] === 0) {
            // Retornar un null explícito si no hay registros
            return res.status(404).json(null);
        }

        return res.json(result.recordset);
    } catch (error) {
        res.status(500).json({ error: error.message });
    } finally {
        if (pool) {
            try {
                await pool.close();
            } catch (closeError) {
                console.error('Error al cerrar la conexión a la base de datos:', closeError);
            }
        }
    }
};

export const SearchTokenFCM = async (req, res) => {
    let pool
    try {
        console.log(req.params.Matricula)
        pool = await getConnection();
        const respuesta = await pool.request()
        .input('Matricula', sql.VarChar, req.params.Matricula)
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
    if (respuesta.rowsAffected[0] === 0) {
        return res.status(404).json({ message: "Dato no encontrado" });
    }
    return res.json(respuesta.recordset);
    } catch (error) {
        res.status(500).json({ error: error.message });
    } finally {
        if (pool) {
            try {
                await pool.close();
            } catch (closeError) {
                console.error('Error al cerrar la conexión a la base de datos:', closeError);
            }
        }
    }
}

export const documentComplet = async (req, res) => {
    let pool
    try {
        console.log(req.params.Matricula)
        pool = await getConnection();
        const respuesta = await pool.request()
            .input('Matricula', sql.VarChar, req.params.Matricula)
            .input('StatusDoc', sql.Int, req.body.StatusDoc)
            .query(`UPDATE LoginUniPass SET Documentacion = @StatusDoc WHERE Matricula = @Matricula`);
        if (respuesta.rowsAffected[0] === 0) {
            return res.status(404).json({ message: "Dato no encontrado" });
        }
        res.json("Dato Actulizado");
    } catch (error) {
        res.status(500).json({ error: error.message });
    } finally {
        if (pool) {
            try {
                await pool.close();
            } catch (closeError) {
                console.error('Error al cerrar la conexión a la base de datos:', closeError);
            }
        }
    }
}

export const registerTokenFCM = async (req, res) => {
    let pool
    try {
        console.log(req.params.Matricula)
        pool = await getConnection();
        const respuesta = await pool.request()
        .input('Matricula', sql.VarChar, req.params.Matricula)
        .input('TokenCFM', sql.VarChar, req.body.TokenCFM)
        .query(`UPDATE LoginUniPass SET TokenCFM = @TokenCFM WHERE Matricula = @Matricula`);
    if (respuesta.rowsAffected[0] === 0) {
        return res.status(404).json({ message: "Dato no encontrado" });
    }
    res.json("Dato Actulizado");
    } catch (error) {
        res.status(500).json({ error: error.message });
    } finally {
        if (pool) {
            try {
                await pool.close();
            } catch (closeError) {
                console.error('Error al cerrar la conexión a la base de datos:', closeError);
            }
        }
    }
}