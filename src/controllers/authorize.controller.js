// Controlador de la cadena de autorizacion (Authorize): alta de eslabones (con
// DualRole cuando la misma persona es jefe y preceptor), resolucion por eslabon y
// avance. Notifica por socket al alumno y al siguiente aprobador pendiente.
import {
    findNextPendingEmpleado,
    findAuthorizeByEmpleadoAndPermiso,
    findAllAuthorizeByPermission,
    resolveAuthorizeLinkTx
} from '../repositories/authorize.repo.js';
import { findBedroomBySexoYNivel } from '../repositories/bedroom.repo.js';
import { findAlumnoMatriculaByPermission } from '../repositories/permission.repo.js';
import { findConfigValue } from '../repositories/config.repo.js';
import { findPreceptorMatriculaByDormitorio, findCoordinadorActivo, findUserById } from '../repositories/user.repo.js';
import { emitToUser, emitToEmpleado } from '../util/socketHelpers.js';

// Task 7.4B (Commit A): mapeo de código de dominio -> HTTP para la resolución de eslabón.
const HTTP_AUTORIZAR = {
    PERMISSION_NOT_FOUND: 404,
    NOT_AUTHORIZER: 403,
    PERMISSION_NOT_PENDING: 409,
    INVALID_TRANSITION: 409,
    ORDER_NOT_READY: 409
};

// Salidas cuyo autorizador se resuelve por el switch: 2=ESPECIAL, 3=A CASA.
const TIPOS_SALIDA_SWITCH = new Set(['2', '3']);

// Entero valido (> 0) o null. Number('')/(null) -> 0 y Number(undefined) -> NaN,
// ambos descartados: asi un valor vacio en Configuracion equivale a "sin override".
const enteroPositivoONull = (valor) => {
    const n = Number(valor);
    return Number.isInteger(n) && n > 0 ? n : null;
};

// GET /autorizadorSalida?tipo=2|3&nivelAcademico=...&sexo=...
// Resuelve QUIEN autoriza la salida segun el switch AUTORIZADOR_SALIDAS de
// UNIPASS.Configuracion (migracion 005), sin fallback silencioso:
//   COORDINADOR -> HIBRIDO: si Configuracion trae COORDINADOR_IDEMPLEADO/NODEPTO
//                  (override explicito) manda; si estan vacios, se resuelve por rol
//                  (ADMINISTRATIVO activo de Coordinacion) para auto-heredar el
//                  cambio de coordinador sin tocar config ni codigo.
//   PRECEPTOR   -> misma resolucion que hace hoy la app: Bedroom por sexo+nivel
//                  (= /asignarPrece, Identificador = NoDepto) y preceptor del
//                  dormitorio (= "ID JEFE" de la API institucional /api/datos/prece).
export const getAutorizadorSalida = async (req, res) => {
    try {
        const { tipo, nivelAcademico, sexo } = req.query;
        if (!TIPOS_SALIDA_SWITCH.has(String(tipo))) {
            return res.status(400).json({ message: 'tipo debe ser 2 o 3' });
        }

        const modo = ((await findConfigValue('AUTORIZADOR_SALIDAS')) || 'PRECEPTOR').toUpperCase();

        if (modo === 'COORDINADOR') {
            // 1) Override explicito en Configuracion (si ambos son validos, mandan).
            let idEmpleado = enteroPositivoONull(await findConfigValue('COORDINADOR_IDEMPLEADO'));
            let noDepto = enteroPositivoONull(await findConfigValue('COORDINADOR_NODEPTO'));

            // 2) Sin override -> resolver por rol (auto-heal al cambiar de coordinador).
            if (idEmpleado == null || noDepto == null) {
                const coord = await findCoordinadorActivo();
                idEmpleado = enteroPositivoONull(coord?.IdEmpleado);
                noDepto = enteroPositivoONull(coord?.NoDepto);
            }

            if (idEmpleado == null || noDepto == null) {
                return res.status(400).json({ message: 'Coordinador de dormitorios no configurado ni resoluble' });
            }
            return res.json({ IdEmpleado: idEmpleado, NoDepto: noDepto, modo: 'COORDINADOR' });
        }

        // Modo PRECEPTOR (default): replica el calculo actual de la app.
        if (!nivelAcademico || !sexo) {
            return res.status(400).json({ message: 'nivelAcademico y sexo son obligatorios en modo PRECEPTOR' });
        }
        const bedroom = await findBedroomBySexoYNivel(sexo, nivelAcademico);
        if (!bedroom || !bedroom.Identificador) {
            return res.status(404).json({ message: 'Preceptor no resuelto para ese nivel/sexo' });
        }
        const matriculaPreceptor = await findPreceptorMatriculaByDormitorio(bedroom.IdBedroom);
        if (matriculaPreceptor == null) {
            return res.status(404).json({ message: 'Jefe de preceptor no resuelto para ese dormitorio' });
        }
        return res.json({
            IdEmpleado: Number(matriculaPreceptor),
            NoDepto: Number(bedroom.Identificador),
            modo: 'PRECEPTOR'
        });
    } catch (error) {
        console.error('Error resolviendo autorizador:', error);
        return res.status(500).json({ message: 'Error resolviendo autorizador' });
    }
};

// RETIRADO (Task 7.4B, Commit B): createAuthorize / POST /authorize fue ELIMINADO. El cliente ya no
// inserta filas Authorize con IdEmpleado/StatusAuthorize arbitrarios. La cadena la crea el backend
// server-side (createPermissionWithChainTx) al crear el Permission, siempre 'Pendiente'.

export const asignarPreceptor = async (req, res) => {
    try {
        const bedroom = await findBedroomBySexoYNivel(req.query.Sexo, req.params.Nivel);
        if (!bedroom) {
            return res.status(404).json({ message: 'Dato no encontrado' });
        }
        return res.json(bedroom);
    } catch (error) {
        console.error('Error en el servidor:', error);
        res.status(500).send(error.message);
    }
};

// PUT /autorizarPermission/:Id  (:Id = IdPermission). REQUIERE verifyToken.
// Task 7.4B (Commit A): el actor es SIEMPRE el usuario autenticado. Su matrícula se resuelve
// server-side (req.user.id -> LoginUniPass.Matricula); el IdEmpleado del body se IGNORA. Body válido:
// { StatusAuthorize: 'Aprobada' | 'Rechazada' }. La correspondencia con la fila Authorize, la máquina
// de estados, el Orden estricto, el recálculo global de Permission y el AuditLog ocurren en UNA sola
// transacción (resolveAuthorizeLinkTx). Ver docs/security/authorization-model.md.
export const definirAutorizacion = async (req, res) => {
    try {
        const idPermission = Number(req.params.Id);
        if (!Number.isInteger(idPermission) || idPermission <= 0) {
            return res.status(400).json({ message: 'IdPermission invalido', code: 'MISSING_FIELDS' });
        }
        const nuevoStatus = String(req.body?.StatusAuthorize ?? '').trim();
        if (nuevoStatus !== 'Aprobada' && nuevoStatus !== 'Rechazada') {
            return res.status(400).json({ message: "StatusAuthorize debe ser 'Aprobada' o 'Rechazada'", code: 'INVALID_STATUS' });
        }

        // Identidad del actor SIEMPRE del token -> matrícula autoritativa desde BD (no del body).
        const actor = await findUserById(req.user.id);
        if (!actor) {
            return res.status(404).json({ message: 'Usuario no encontrado', code: 'USER_NOT_FOUND' });
        }

        const accion = nuevoStatus === 'Aprobada' ? 'PERMISSION_AUTHORIZE_APPROVE' : 'PERMISSION_AUTHORIZE_REJECT';
        const result = await resolveAuthorizeLinkTx({
            idPermission,
            actorMatricula: actor.Matricula,
            nuevoStatus,
            audit: {
                actorIdLogin: req.user.id,
                actorMatricula: actor.Matricula,
                accion,
                ip: req.ip || req.headers?.['x-forwarded-for'] || null,
                endpoint: req.originalUrl || null,
                metodo: req.method || null
            }
        });

        if (result.error) {
            return res.status(HTTP_AUTORIZAR[result.error] || 409).json({ message: 'No se pudo resolver la autorizacion', code: result.error });
        }

        res.json({
            IdPermission: idPermission,
            IdAuthorize: result.idAuthorize,
            StatusAuthorize: result.authDespues,
            StatusPermission: result.permDespues
        });

        // Notificaciones best-effort DESPUES del commit (nunca revierten la operación). El actor y el
        // siguiente eslabón se derivan server-side, no del cliente.
        try {
            const io = req.app.get('io');
            let matriculaAlumno = null, nextEmpleado = null;
            try {
                matriculaAlumno = await findAlumnoMatriculaByPermission(idPermission);
                if (nuevoStatus === 'Aprobada') nextEmpleado = await findNextPendingEmpleado(idPermission);
            } catch (qErr) {
                console.error('[Socket] Error obteniendo datos para emit:', qErr.message);
            }
            emitToUser(io, matriculaAlumno, 'permission_status_changed', {
                idPermission,
                status: result.authDespues,
                statusPermission: result.permDespues,
                updatedBy: actor.Matricula,
                timestamp: new Date().toISOString()
            });
            if (nextEmpleado) {
                await emitToEmpleado(io, null, nextEmpleado, 'new_authorization_assigned', {
                    idPermission, status: 'Pendiente', timestamp: new Date().toISOString()
                });
            }
        } catch (socketError) {
            console.error('[Socket] Error en definirAutorizacion:', socketError.message);
        }
    } catch (error) {
        console.error('Error en definirAutorizacion:', error);
        res.status(500).json({ message: 'Error resolviendo la autorizacion', code: 'SERVER_ERROR' });
    }
};

export const verificarValidacion = async (req, res) => {
    try {
        const authorize = await findAuthorizeByEmpleadoAndPermiso(req.params.Id, req.query.IdPermiso);
        if (!authorize) {
            return res.status(404).json({ message: 'Dato no encontrado' });
        }
        return res.json(authorize);
    } catch (error) {
        console.error('Error en el servidor:', error);
        res.status(500).send(error.message);
    }
};

export const AdvancePermission = async (req, res) => {
    try {
        const authorizes = await findAllAuthorizeByPermission(req.params.Id);
        if (authorizes.length === 0) {
            return res.status(404).json({ message: 'Dato no encontrado' });
        }

        const enriched = authorizes.map((row) => ({
            ...row,
            DualRole: Boolean(row.DualRole),
            Roles: row.DualRole ? ['Jefe de trabajo', 'Preceptor'] : null
        }));

        return res.json(enriched);
    } catch (error) {
        console.error('Error en el servidor:', error);
        res.status(500).json({ error: error.message });
    }
};
