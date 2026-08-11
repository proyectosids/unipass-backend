// Ownership/scope: valida que el usuario autenticado sea el DUEÑO del recurso (o que
// el recurso caiga en su ambito). Infra para Task 7; se usa DESPUES de verifyToken.
//
// resolveOwnerId(req) -> Promise<ownerId|null>: carga el recurso (por req.params/body)
// y devuelve el IdLogin dueño, o null si no existe. La identidad SIEMPRE se compara
// contra req.user.id (token), nunca contra identificadores del body/params del cliente.
//
// Uso:
//   router.put('/permission/:Id',
//       verifyToken,
//       requireOwnership((req) => findPermissionOwnerId(req.params.Id)),
//       cancelPermission);
export const requireOwnership = (resolveOwnerId, { notFoundCode = 'NOT_FOUND' } = {}) => async (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ message: 'No autenticado', code: 'NOT_AUTHENTICATED' });
    }
    try {
        const ownerId = await resolveOwnerId(req);
        if (ownerId === null || ownerId === undefined) {
            return res.status(404).json({ message: 'Recurso no encontrado', code: notFoundCode });
        }
        if (Number(ownerId) !== Number(req.user.id)) {
            return res.status(403).json({
                message: 'No puedes operar sobre un recurso que no te pertenece',
                code: 'FORBIDDEN_OWNERSHIP'
            });
        }
        return next();
    } catch (error) {
        console.error('[Ownership] Error validando propiedad:', error.message);
        return res.status(500).json({ message: 'Error validando propiedad del recurso', code: 'SERVER_ERROR' });
    }
};
