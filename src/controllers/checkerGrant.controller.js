import {
    createOrReactivateGrant,
    findGrantsByPoint,
    findGrantsByLogin,
    findCapabilitiesByLogin,
    setGrantActivo,
    deleteGrant
} from '../repositories/checkerGrant.repo.js';

const SCOPES = new Set(['SALIDA', 'RETORNO', 'AMBOS']);
const VIGENCIAS = new Set(['TEMPORAL', 'PERMANENTE']);

// POST /checkerGrant  { IdLogin, IdPoint, Scope, Vigencia, FechaExpira? }
// AsignadoPor se toma del token (req.user.id). Solo PRECEPTOR/VIGILANCIA (ruta).
export const postCheckerGrant = async (req, res) => {
    try {
        const { IdLogin, IdPoint, Scope, Vigencia, FechaExpira } = req.body || {};

        if (!IdLogin || !IdPoint || !Scope || !Vigencia) {
            return res.status(400).json({
                message: 'IdLogin, IdPoint, Scope y Vigencia son obligatorios',
                code: 'MISSING_FIELDS'
            });
        }
        if (!SCOPES.has(Scope)) {
            return res.status(400).json({ message: 'Scope invalido', code: 'INVALID_SCOPE' });
        }
        if (!VIGENCIAS.has(Vigencia)) {
            return res.status(400).json({ message: 'Vigencia invalida', code: 'INVALID_VIGENCIA' });
        }
        if (Vigencia === 'TEMPORAL' && !FechaExpira) {
            return res.status(400).json({
                message: 'FechaExpira es obligatoria cuando Vigencia es TEMPORAL',
                code: 'MISSING_FECHA_EXPIRA'
            });
        }

        const { grant, reactivated } = await createOrReactivateGrant({
            idLogin: IdLogin,
            idPoint: IdPoint,
            scope: Scope,
            vigencia: Vigencia,
            fechaExpira: Vigencia === 'TEMPORAL' ? FechaExpira : null,
            asignadoPor: req.user.id
        });

        return res.status(reactivated ? 200 : 201).json(grant);
    } catch (error) {
        console.error('Error al crear CheckerGrant:', error);
        return res.status(500).json({ message: 'Error al crear el grant', code: 'SERVER_ERROR' });
    }
};

// GET /checkerGrants/:idPoint  -> checkers activos del punto
export const getCheckerGrantsByPoint = async (req, res) => {
    try {
        const grants = await findGrantsByPoint(req.params.idPoint);
        return res.json(grants);
    } catch (error) {
        console.error('Error al listar grants por punto:', error);
        return res.status(500).json({ message: 'Error al listar grants', code: 'SERVER_ERROR' });
    }
};

// GET /checkerGrantsByUser/:idLogin  -> grants de un usuario
export const getCheckerGrantsByUser = async (req, res) => {
    try {
        const grants = await findGrantsByLogin(req.params.idLogin);
        return res.json(grants);
    } catch (error) {
        console.error('Error al listar grants por usuario:', error);
        return res.status(500).json({ message: 'Error al listar grants', code: 'SERVER_ERROR' });
    }
};

// PUT /checkerGrant/:idGrant  { Activo: 0|1 }
export const putCheckerGrant = async (req, res) => {
    try {
        const { Activo } = req.body || {};
        if (Activo !== 0 && Activo !== 1) {
            return res.status(400).json({ message: 'Activo debe ser 0 o 1', code: 'INVALID_ACTIVO' });
        }

        const updated = await setGrantActivo(req.params.idGrant, Activo);
        if (!updated) {
            return res.status(404).json({ message: 'Grant no encontrado', code: 'GRANT_NOT_FOUND' });
        }
        return res.json({ message: 'Grant actualizado', code: 'GRANT_UPDATED' });
    } catch (error) {
        console.error('Error al actualizar grant:', error);
        return res.status(500).json({ message: 'Error al actualizar el grant', code: 'SERVER_ERROR' });
    }
};

// DELETE /checkerGrant/:idGrant  -> revoca definitivamente
export const deleteCheckerGrant = async (req, res) => {
    try {
        const deleted = await deleteGrant(req.params.idGrant);
        if (!deleted) {
            return res.status(404).json({ message: 'Grant no encontrado', code: 'GRANT_NOT_FOUND' });
        }
        return res.json({ message: 'Grant revocado', code: 'GRANT_REVOKED' });
    } catch (error) {
        console.error('Error al revocar grant:', error);
        return res.status(500).json({ message: 'Error al revocar el grant', code: 'SERVER_ERROR' });
    }
};

// GET /getCapabilities  -> capabilities del usuario autenticado
export const getCapabilities = async (req, res) => {
    try {
        const capabilities = await findCapabilitiesByLogin(req.user.id);
        return res.json({ capabilities });
    } catch (error) {
        console.error('Error al obtener capabilities:', error);
        return res.status(500).json({ message: 'Error al obtener capabilities', code: 'SERVER_ERROR' });
    }
};
