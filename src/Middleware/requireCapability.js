import { findCapabilitiesByLogin } from '../repositories/checkerGrant.repo.js';

// Autorizacion por CAPABILITY. Debe usarse DESPUES de verifyToken (necesita req.user).
// Reune las capabilities EFECTIVAS del usuario:
//   - derivadas del rol: TipoUser='ADMINISTRATIVO' -> 'ADMIN' (coordinador de dormitorios).
//   - otorgadas (CheckerGrant vigente): 'CHECKER', 'SUPERVISOR'.
// Deja pasar si el usuario tiene ALGUNA de las capabilities permitidas; si no -> 403.
// Uso: router.get('/x', verifyToken, requireCapability(['ADMIN', 'SUPERVISOR']), handler)
export const requireCapability = (permitidas) => async (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ message: 'No autenticado', code: 'NOT_AUTHENTICATED' });
    }

    const efectivas = new Set();
    if (req.user.tipo === 'ADMINISTRATIVO') efectivas.add('ADMIN');

    try {
        const caps = await findCapabilitiesByLogin(req.user.id);
        for (const c of caps) efectivas.add(c.type); // 'CHECKER' | 'SUPERVISOR'
    } catch (error) {
        console.error('[Capability] Error validando capabilities:', error.message);
        return res.status(500).json({ message: 'Error validando permisos', code: 'SERVER_ERROR' });
    }

    if (permitidas.some((p) => efectivas.has(p))) return next();

    return res.status(403).json({
        message: 'No tienes permiso para acceder a este recurso',
        code: 'FORBIDDEN_CAPABILITY'
    });
};
