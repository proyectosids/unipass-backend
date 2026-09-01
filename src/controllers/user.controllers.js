// Controlador de usuarios: sesion (login + refresh rotativo con deteccion de reuso,
// logout, verify), password, busquedas, cargo delegado, token FCM y documentacion.
import { hashData, VerifyHashData } from '../util/hashData.js';
import { validatePassword } from '../util/passwordPolicy.js';
import { toSafeUser } from '../util/safeUser.js';
import {
    generateAccessToken,
    generateRefreshToken,
    hashRefreshToken,
    getRefreshExpiresAt
} from '../util/tokens.js';
import {
    findUserById,
    findUserByMatriculaOrCorreo,
    findSafeUserById,
    updateUserPasswordById,
    updateTokenFCM,
    findIdCargoDelegadoByMatricula,
    clearIdCargoDelegado,
    deletePositionByIdCargo,
    updateUserCargo
} from '../repositories/user.repo.js';
import {
    createRefreshToken,
    findRefreshTokenByHash,
    revokeAllUserRefreshTokens,
    revokeRefreshTokenById,
    revokeRefreshTokenByHash
} from '../repositories/refreshToken.repo.js';
import { findCapabilitiesByLogin } from '../repositories/checkerGrant.repo.js';

// BOLA/IDOR R1: perfil del usuario AUTENTICADO. Identidad = req.user.id (token); no acepta IdLogin del
// cliente. Respuesta con proyección segura (sin Contraseña ni TokenCFM). Destino final del legacy /user/:Id.
export const getMe = async (req, res) => {
    try {
        const user = await findSafeUserById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'Usuario no encontrado', code: 'USER_NOT_FOUND' });
        }
        return res.json(toSafeUser(user));
    } catch (error) {
        console.error('Error en GET /me:', error.message);
        return res.status(500).json({ message: 'Error obteniendo el usuario', code: 'SERVER_ERROR' });
    }
};

// RETIRADO (BOLA/IDOR R1-C): getUser (GET /user/:Id) fue ELIMINADO. La única lectura SELF de usuario
// es GET /me (getMe). El identificador del cliente ya no selecciona usuario.

export const endCargo = async (req, res) => {
    try {
        const idCargoDelegado = await findIdCargoDelegadoByMatricula(req.params.Matricula);

        if (idCargoDelegado === undefined) {
            return res.status(404).json({ message: 'Matrícula no encontrada' });
        }

        if (!idCargoDelegado) {
            return res.status(400).json({ message: 'El registro no tiene un IdCargoDelegado válido' });
        }

        await clearIdCargoDelegado(req.params.Matricula);

        const deleted = await deletePositionByIdCargo(idCargoDelegado);
        if (!deleted) {
            return res.status(404).json({ message: 'No se encontró un registro en Position con el IdCargo relacionado' });
        }

        return res.status(200).json({ message: 'Estado actualizado y registro eliminado exitosamente' });
    } catch (error) {
        console.error('Error en el servidor:', error);
        res.status(500).send(error.message);
    }
};

export const updateCargo = async (req, res) => {
    try {
        const updated = await updateUserCargo(req.params.Matricula, req.body.IdCargoDelegado);
        if (updated) {
            return res.status(200).json({ message: 'Estado actualizado exitosamente' });
        }
        return res.status(404).json({ message: 'Registro no encontrado' });
    } catch (error) {
        console.error('Error en el servidor:', error);
        res.status(500).send(error.message);
    }
};

//==================================== LOGIN ================================================

export const loginUser = async (req, res) => {
    try {
        const { Matricula, Contraseña, Correo } = req.body;

        if (!Matricula && !Correo) {
            return res.status(400).json({ success: false, message: 'Debe proporcionar matrícula o correo' });
        }

        const user = await findUserByMatriculaOrCorreo(Matricula);

        if (!user) {
            return res.status(401).json({ success: false, message: 'Credenciales inválidas' });
        }

        const isPasswordValid = await VerifyHashData(Contraseña, user.Contraseña);
        if (!isPasswordValid) {
            return res.status(401).json({ success: false, message: 'Credenciales inválidas' });
        }

        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken();
        const refreshHash = hashRefreshToken(refreshToken);
        const expiresAt = getRefreshExpiresAt();
        const deviceInfo = (req.headers['user-agent'] || '').slice(0, 255);

        await createRefreshToken({
            idLogin: user.IdLogin,
            tokenHash: refreshHash,
            expiresAt,
            deviceInfo
        });

        // Capabilities aditivas (p.ej. CHECKER) para que el cliente muestre tabs
        // segun permisos y no segun TipoUser. No rompe clientes viejos (campo extra).
        let capabilities = [];
        try {
            capabilities = await findCapabilitiesByLogin(user.IdLogin);
        } catch (capError) {
            console.error('[Auth] Error obteniendo capabilities:', capError.message);
        }

        console.log(`[Auth] Login: userId=${user.IdLogin}`);

        return res.json({
            success: true,
            accessToken,
            refreshToken,
            token: accessToken,
            user: toSafeUser(user), // BOLA/IDOR R1: nunca serializar Contraseña/TokenCFM del registro
            capabilities
        });
    } catch (error) {
        console.error('[Auth] Error en login:', error);
        res.status(500).json({ error: error.message });
    }
};

export const refreshTokenController = async (req, res) => {
    try {
        const { refreshToken } = req.body || {};
        if (!refreshToken) {
            return res.status(400).json({ message: 'refreshToken requerido', code: 'MISSING_REFRESH_TOKEN' });
        }

        const tokenHash = hashRefreshToken(refreshToken);
        const stored = await findRefreshTokenByHash(tokenHash);

        if (!stored) {
            return res.status(401).json({ message: 'Refresh token invalido', code: 'INVALID_REFRESH_TOKEN' });
        }

        if (stored.RevokedAt !== null) {
            await revokeAllUserRefreshTokens(stored.IdLogin);
            console.warn(`[Auth] Refresh REUSE detected: userId=${stored.IdLogin} - revoking all`);
            return res.status(401).json({ message: 'Refresh token reutilizado, sesion revocada', code: 'REFRESH_REUSE_DETECTED' });
        }

        if (new Date(stored.ExpiresAt) < new Date()) {
            return res.status(401).json({ message: 'Refresh token expirado', code: 'REFRESH_EXPIRED' });
        }

        const user = await findUserById(stored.IdLogin);
        if (!user) {
            return res.status(401).json({ message: 'Usuario no encontrado', code: 'USER_NOT_FOUND' });
        }

        const newAccess = generateAccessToken(user);
        const newRefresh = generateRefreshToken();
        const newHash = hashRefreshToken(newRefresh);
        const newExpires = getRefreshExpiresAt();
        const deviceInfo = (req.headers['user-agent'] || '').slice(0, 255);

        await revokeRefreshTokenById(stored.RefreshTokenId, newHash);
        await createRefreshToken({
            idLogin: user.IdLogin,
            tokenHash: newHash,
            expiresAt: newExpires,
            deviceInfo
        });

        console.log(`[Auth] Refresh: userId=${user.IdLogin} tokenId=${stored.RefreshTokenId}`);

        return res.json({ accessToken: newAccess, refreshToken: newRefresh });
    } catch (error) {
        console.error('[Auth] Error en refresh:', error);
        res.status(500).json({ error: 'Error en refresh' });
    }
};

export const logoutUser = async (req, res) => {
    try {
        const { refreshToken } = req.body || {};
        if (!refreshToken) {
            return res.status(400).json({ message: 'refreshToken requerido', code: 'MISSING_REFRESH_TOKEN' });
        }

        const tokenHash = hashRefreshToken(refreshToken);
        const revoked = await revokeRefreshTokenByHash(tokenHash);

        if (revoked) {
            console.log(`[Auth] Logout: userId=${revoked.IdLogin} tokenId=${revoked.RefreshTokenId}`);
        }

        return res.status(204).send();
    } catch (error) {
        console.error('[Auth] Error en logout:', error);
        res.status(500).json({ error: 'Error en logout' });
    }
};

export const verifySessionToken = async (req, res) => {
    let capabilities = [];
    try {
        capabilities = await findCapabilitiesByLogin(req.user.id);
    } catch (capError) {
        console.error('[Auth] Error obteniendo capabilities:', capError.message);
    }
    res.status(200).json({ success: true, user: req.user, capabilities });
};

//==================================== FIN LOGIN ================================================

// Task 7.1: cambio de contraseña del usuario AUTENTICADO. Identidad = token; NO usa el
// correo como autorización. Requiere la contraseña actual (se verifica contra la BD).
export const putMePassword = async (req, res) => {
    try {
        const { actual, nueva } = req.body || {};
        if (!actual || !nueva) {
            return res.status(400).json({ message: 'actual y nueva son obligatorias', code: 'MISSING_FIELDS' });
        }
        // Task 7.1.B: política unificada (min 8, 1 letra, 1 número) — misma que /password/reset.
        const policy = validatePassword(nueva);
        if (!policy.ok) {
            return res.status(400).json({ message: policy.message, code: 'WEAK_PASSWORD' });
        }

        const user = await findUserById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'Usuario no encontrado', code: 'USER_NOT_FOUND' });
        }

        const actualOk = await VerifyHashData(actual, user.Contraseña);
        if (!actualOk) {
            return res.status(403).json({ message: 'La contraseña actual no es correcta', code: 'PASSWORD_MISMATCH' });
        }

        const hashedPassword = await hashData(nueva);
        const updated = await updateUserPasswordById(req.user.id, hashedPassword);
        if (!updated) {
            return res.status(500).json({ message: 'No se pudo actualizar la contraseña', code: 'SERVER_ERROR' });
        }

        return res.json({ message: 'Contraseña actualizada correctamente' });
    } catch (error) {
        console.error('Error en PUT /me/password:', error);
        return res.status(500).json({ error: 'Error al actualizar la contraseña' });
    }
};

// RETIRADO (P0): el antiguo PUT /password/:Correo (cambio por correo arbitrario, sin identidad
// autenticada ni OTP) fue ELIMINADO junto con su ruta y su función de repositorio
// (updateUserPassword por Correo). El correo del cliente NUNCA autoriza un cambio de contraseña.
// Rutas soportadas: PUT /me/password (identidad = token) y el flujo de recuperación con resetToken
// (/password/forgot -> /password/verify-otp -> /password/reset).

// RETIRADO (BOLA/IDOR R1-C): BuscarUserMatricula (GET /userMatricula/:Matricula) fue ELIMINADO.
// La única lectura SELF de usuario es GET /me (getMe).

// RETIRADO (BOLA/IDOR R1):
// - getBuscarCheckers (GET /userChecks/:EmailAsignador): modelo DEPARTAMENTO retirado, SELECT * incl.
//   hash, anónimo. Sin consumidores. → 404. Búsqueda segura: GET /buscarPersona (canGrant).
// - buscarPersona (GET /buscarUser/:Nombre): SELECT lp.* incl. hash/token, enumeración anónima por
//   nombre. Sin consumidores. → 404. Reemplazo: GET /buscarPersona (canGrant, campos seguros).
// - SearchTokenFCM (GET /VerToken/:Matricula): exponía TokenCFM (token de push) de cualquier matrícula.
//   Sin consumidores HTTP; la resolución FCM es INTERNA (notificationService.findTokenFCMByMatricula). → 404.

// CONTENIDO (Task 7.3 D1-A · DEPRECATED — REMOVE D1-C): PUT /Documentacion/:Matricula. Antes era
// ANÓNIMO y el cliente fijaba LoginUniPass.Documentacion (0/1) de cualquier matrícula. Ahora requiere
// Bearer y NO acepta escritura arbitraria: la `:Matricula` del path y el `StatusDoc` del body se
// IGNORAN. Devuelve el valor ACTUAL de Documentacion del usuario autenticado (SELF), sin modificarlo.
// El recálculo server-computed real se implementa en D1-A.2 (requiere la regla de tipos requeridos).
export const documentComplet = async (req, res) => {
    try {
        const user = await findUserById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'Usuario no encontrado', code: 'USER_NOT_FOUND' });
        }
        return res.json({ Documentacion: user.Documentacion ?? null });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const registerTokenFCM = async (req, res) => {
    try {
        // Task 7.2: la matrícula viene del token, no del path (:Matricula se ignora).
        const updated = await updateTokenFCM(req.user.matricula, req.body.TokenCFM);
        if (!updated) {
            return res.status(404).json({ message: 'Dato no encontrado' });
        }
        res.json('Dato Actulizado');
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
