import { getScopesForUser, scopeCovers } from '../services/capability.service.js';

// Valida SCOPE/ámbito. Debe usarse DESPUES de verifyToken (y normalmente de requirePermission).
// resolveResource(req) -> Promise<{ type:'GLOBAL' } | { type:'DORMITORIO', id } | { type:'SELF', ownerId }>
//   describe el ÁMBITO del recurso solicitado, resuelto SERVER-SIDE (BD/token), nunca del cliente.
// Pasa si algún scope del actor cubre ese recurso; si no -> 403 FORBIDDEN_SCOPE.
export const validateScope = (resolveResource) => async (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ message: 'No autenticado', code: 'NOT_AUTHENTICATED' });
    }
    try {
        const resource = await resolveResource(req);
        const scopes = await getScopesForUser(req.user);
        if (!scopeCovers(scopes, resource, req.user)) {
            return res.status(403).json({ message: 'Fuera de tu ambito', code: 'FORBIDDEN_SCOPE' });
        }
        return next();
    } catch (error) {
        console.error('[Scope] Error validando scope:', error.message);
        return res.status(500).json({ message: 'Error validando ambito', code: 'SERVER_ERROR' });
    }
};

// Atajo: exige que el actor tenga scope que cubra un recurso GLOBAL (institucional).
export const requireGlobalScope = () => validateScope(async () => ({ type: 'GLOBAL' }));
