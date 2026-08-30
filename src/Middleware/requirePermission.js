import { getPermissionsForUser } from '../services/capability.service.js';

// Autorización por PERMISO concreto. Debe usarse DESPUES de verifyToken.
// Resuelve los permisos efectivos del usuario (capabilities -> permisos, server-side) y
// exige el permiso indicado. La identidad y los permisos NUNCA vienen del body/params.
// Deja en req.authz los permisos resueltos para middlewares/handlers siguientes.
export const requirePermission = (permiso) => async (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ message: 'No autenticado', code: 'NOT_AUTHENTICATED' });
    }
    try {
        const permisos = await getPermissionsForUser(req.user);
        if (!permisos.has(permiso)) {
            return res.status(403).json({ message: 'No tienes permiso para esta accion', code: 'FORBIDDEN_PERMISSION' });
        }
        req.authz = { ...(req.authz || {}), permissions: permisos };
        return next();
    } catch (error) {
        console.error('[Permission] Error resolviendo permisos:', error.message);
        return res.status(500).json({ message: 'Error validando permisos', code: 'SERVER_ERROR' });
    }
};
