import {
    createOrReactivateGrant,
    findGrantsScoped,
    findGrantsByLogin,
    findCapabilitiesByLogin,
    setGrantActivo,
    deleteGrant,
    createOrReactivateSupervisorGrant,
    deleteSupervisorGrant
} from '../repositories/checkerGrant.repo.js';
import { searchAssignablePersonsByName } from '../repositories/user.repo.js';
import { getPermissionsForUser } from '../services/capability.service.js';

const SCOPES = new Set(['SALIDA', 'RETORNO', 'AMBOS']);
const VIGENCIAS = new Set(['TEMPORAL', 'PERMANENTE']);

// GET /buscarPersona/:Nombre -> personas asignables como checador (LIKE, solo activos,
// campos seguros). Devuelve lista (vacia si no hay match).
export const buscarPersonaAsignable = async (req, res) => {
    try {
        const personas = await searchAssignablePersonsByName(req.params.Nombre);
        return res.json(personas);
    } catch (error) {
        console.error('Error al buscar persona:', error);
        return res.status(500).json({ message: 'Error al buscar persona', code: 'SERVER_ERROR' });
    }
};

// Tipo de checador segun el rol que asigna/consulta.
const tipoPorRol = (tipoUser) =>
    tipoUser === 'PRECEPTOR' ? 'Dormitorio'
    : tipoUser === 'VIGILANCIA' ? 'Caseta'
    : null;

// POST /checkerGrant  { IdLogin, Scope, Vigencia, FechaExpira? }
// El alcance (Tipo/IdDormitorio) y AsignadoPor se derivan del token, NO del cliente:
//   PRECEPTOR  -> Tipo='Dormitorio', IdDormitorio = req.user.dormitorio
//   VIGILANCIA -> Tipo='Caseta'
export const postCheckerGrant = async (req, res) => {
    try {
        const { IdLogin, Scope, Vigencia, FechaExpira } = req.body || {};

        const tipo = tipoPorRol(req.user.tipo);
        if (!tipo) {
            return res.status(403).json({ message: 'No tienes permisos para asignar checadores', code: 'FORBIDDEN_ROLE' });
        }
        if (!IdLogin || !Scope || !Vigencia) {
            return res.status(400).json({
                message: 'IdLogin, Scope y Vigencia son obligatorios',
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
            tipo,
            idDormitorio: tipo === 'Dormitorio' ? req.user.dormitorio : null,
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

// GET /checkerGrants  -> checadores activos scopeados por el rol del que consulta:
//   PRECEPTOR  -> los de su dormitorio; VIGILANCIA -> los de caseta.
export const getCheckerGrantsScoped = async (req, res) => {
    try {
        const tipo = tipoPorRol(req.user.tipo);
        if (!tipo) {
            return res.status(403).json({ message: 'No tienes permisos', code: 'FORBIDDEN_ROLE' });
        }
        const grants = await findGrantsScoped({
            tipo,
            idDormitorio: tipo === 'Dormitorio' ? req.user.dormitorio : null
        });
        return res.json(grants);
    } catch (error) {
        console.error('Error al listar grants:', error);
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

// POST /supervisorGrant  { IdLogin }  -> otorga capability SUPERVISOR (solo ADMIN).
// Global, solo lectura: AsignadoPor = admin del token. 201 nuevo / 200 reactivado.
export const postSupervisorGrant = async (req, res) => {
    try {
        const { IdLogin } = req.body || {};
        if (!IdLogin) {
            return res.status(400).json({ message: 'IdLogin es obligatorio', code: 'MISSING_FIELDS' });
        }
        const { grant, reactivated } = await createOrReactivateSupervisorGrant(IdLogin, req.user.id);
        return res.status(reactivated ? 200 : 201).json(grant);
    } catch (error) {
        console.error('Error al asignar SUPERVISOR:', error);
        return res.status(500).json({ message: 'Error al asignar SUPERVISOR', code: 'SERVER_ERROR' });
    }
};

// DELETE /supervisorGrant/:idLogin  -> revoca la capability SUPERVISOR (solo ADMIN).
export const revokeSupervisorGrant = async (req, res) => {
    try {
        const deleted = await deleteSupervisorGrant(req.params.idLogin);
        if (!deleted) {
            return res.status(404).json({ message: 'SUPERVISOR no encontrado', code: 'GRANT_NOT_FOUND' });
        }
        return res.json({ message: 'SUPERVISOR revocado', code: 'GRANT_REVOKED' });
    } catch (error) {
        console.error('Error al revocar SUPERVISOR:', error);
        return res.status(500).json({ message: 'Error al revocar SUPERVISOR', code: 'SERVER_ERROR' });
    }
};

// GET /getCapabilities  -> capabilities del usuario autenticado.
// `capabilities` se mantiene igual (forma que consume Flutter, sin cambios). Se añade de
// forma ADITIVA `permissions` (permisos resueltos del nuevo modelo) para que Flutter pueda
// manejar UI por permiso sin conocer la estructura interna. No requiere cambios en Flutter.
export const getCapabilities = async (req, res) => {
    try {
        const capabilities = await findCapabilitiesByLogin(req.user.id);
        const permissions = [...(await getPermissionsForUser(req.user))];
        return res.json({ capabilities, permissions });
    } catch (error) {
        console.error('Error al obtener capabilities:', error);
        return res.status(500).json({ message: 'Error al obtener capabilities', code: 'SERVER_ERROR' });
    }
};
