// Middleware de autorizacion por rol (TipoUser del token).
// Debe usarse despues de verifyToken (que setea req.user).
// Uso: router.post('/x', verifyToken, requireRole('PRECEPTOR', 'VIGILANCIA'), handler)
export const requireRole = (...roles) => (req, res, next) => {
    const tipo = req.user?.tipo;

    if (!tipo) {
        return res.status(401).json({ message: 'No autenticado', code: 'NOT_AUTHENTICATED' });
    }

    if (!roles.includes(tipo)) {
        return res.status(403).json({
            message: 'No tienes permisos para realizar esta accion',
            code: 'FORBIDDEN_ROLE'
        });
    }

    next();
};
