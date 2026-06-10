import { hashData, VerifyHashData } from '../util/hashData.js';
import {
    generateAccessToken,
    generateRefreshToken,
    hashRefreshToken,
    getRefreshExpiresAt
} from '../util/tokens.js';
import {
    findUserById,
    findUserByMatricula,
    findUserByMatriculaOrCorreo,
    findCheckersByEmail,
    findPersonaByNombreOApellidos,
    findTokenFCMByMatricula,
    updateUserPassword,
    updateDocumentacion,
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

export const getUser = async (req, res) => {
    try {
        const user = await findUserById(req.params.Id);
        if (!user) {
            return res.status(404).json({ message: 'Dato no encontrado' });
        }
        return res.json(user);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

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

        console.log(`[Auth] Login: userId=${user.IdLogin}`);

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

export const verifySessionToken = (req, res) => {
    res.status(200).json({ success: true, user: req.user });
};

//==================================== FIN LOGIN ================================================

export const putPassword = async (req, res) => {
    try {
        const { Correo } = req.params;
        const { NewPassword } = req.body;
        const hashedPassword = await hashData(NewPassword);

        const updated = await updateUserPassword(Correo, hashedPassword);

        if (!updated) {
            return res.status(404).json({ message: 'Contraseña no actualizada' });
        }

        res.json({ message: 'Contraseña actualizado correctamente' });
    } catch (error) {
        console.error('Error al actualizar la contraseña:', error);
        res.status(500).json({ error: 'Error al actualizar la contraseña' });
    }
};

export const BuscarUserMatricula = async (req, res) => {
    try {
        const user = await findUserByMatricula(req.params.Matricula);
        if (!user) {
            return res.status(404).json({ message: 'Dato no encontrado' });
        }
        return res.json(user);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const getBuscarCheckers = async (req, res) => {
    try {
        const checkers = await findCheckersByEmail(req.params.EmailAsignador);
        if (checkers.length === 0) {
            return res.status(404).json({ message: 'No hay datos registrados' });
        }
        return res.json(checkers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const buscarPersona = async (req, res) => {
    try {
        const personas = await findPersonaByNombreOApellidos(req.params.Nombre);
        if (personas.length === 0) {
            return res.status(404).json(null);
        }
        return res.json(personas);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const SearchTokenFCM = async (req, res) => {
    try {
        const tokens = await findTokenFCMByMatricula(req.params.Matricula);
        if (tokens.length === 0) {
            return res.status(404).json({ message: 'Dato no encontrado' });
        }
        return res.json(tokens);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const documentComplet = async (req, res) => {
    try {
        const updated = await updateDocumentacion(req.params.Matricula, req.body.StatusDoc);
        if (!updated) {
            return res.status(404).json({ message: 'Dato no encontrado' });
        }
        res.json('Dato Actulizado');
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const registerTokenFCM = async (req, res) => {
    try {
        const updated = await updateTokenFCM(req.params.Matricula, req.body.TokenCFM);
        if (!updated) {
            return res.status(404).json({ message: 'Dato no encontrado' });
        }
        res.json('Dato Actulizado');
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
