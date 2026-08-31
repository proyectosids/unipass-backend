import {
    createCheckPoint,
    findPendingChecksDormitorioSalida,
    findPendingChecksDormitorioRetorno,
    findPendingChecksVigilanciaSalida,
    findPendingChecksVigilanciaRegreso,
    updateCheckPoint,
    findCheckInfoForSocket,
    findCheckAuthInfo,
    findPermissionSteps
} from '../repositories/checks.repo.js';
import { findActiveGrantByTipo } from '../repositories/checkerGrant.repo.js';
import { emitToUser } from '../util/socketHelpers.js';

// Paso (1..4) de un check segun su accion y tipo de punto.
const pasoDe = (accion, nombrePunto) => {
    if (accion === 'SALIDA' && nombrePunto === 'Dormitorio') return 1;
    if (accion === 'SALIDA' && nombrePunto === 'Caseta') return 2;
    if (accion === 'RETORNO' && nombrePunto === 'Caseta') return 3;
    if (accion === 'RETORNO' && nombrePunto === 'Dormitorio') return 4;
    return null;
};

// DEPRECATED / TRANSITIONAL (Checks Hardening C1): POST /checks. La creación autoritativa de los 4
// CheckPoints es server-side al aprobarse el permiso (ver ensureCheckPointsTx en authorize.repo). Este
// endpoint se conserva SOLO como puente de compatibilidad mientras Flutter migra; es IDEMPOTENTE (no
// duplica: si el (IdPermission, IdPoint, Accion) ya existe, devuelve el existente con `existing:true`).
// El sistema NO depende de él. Se RETIRA en C2 tras migrar Flutter.
export const createChecksPermission = async (req, res) => {
    try {
        const { Accion, IdPoint, IdPermission } = req.body || {};
        const r = await createCheckPoint({ accion: Accion, idPoint: IdPoint, idPermission: IdPermission });
        res.json({
            Id: r.id,
            StatusCheck: 'Pendiente',
            Accion,
            IdPoint,
            IdPermission,
            Observaciones: 'Ninguna',
            existing: !r.created // true si ya existía (idempotente): NO se duplicó
        });
    } catch (error) {
        console.error('Error en POST /checks (transicional):', error.message);
        res.status(500).json({ error: 'Error al crear el check' });
    }
};

export const getChecksDormitorio = async (req, res) => {
    try {
        const checks = await findPendingChecksDormitorioSalida(req.params.Id);
        if (checks.length === 0) {
            return res.status(200).json(null);
        }
        return res.json(checks);
    } catch (error) {
        console.error('Error en el servidor:', error);
        res.status(500).send(error.message);
    }
};

export const getChecksDormitorioFinal = async (req, res) => {
    try {
        const checks = await findPendingChecksDormitorioRetorno(req.params.Id);
        if (checks.length === 0) {
            return res.status(200).json(null);
        }
        return res.json(checks);
    } catch (error) {
        console.error('Error en el servidor:', error);
        res.status(500).send(error.message);
    }
};

export const getChecksVigilancia = async (req, res) => {
    try {
        const checks = await findPendingChecksVigilanciaSalida();
        if (checks.length === 0) {
            return res.status(200).json(null);
        }
        return res.json(checks);
    } catch (error) {
        console.error('Error en el servidor:', error);
        res.status(500).send(error.message);
    }
};

export const getChecksVigilanciaRegreso = async (req, res) => {
    try {
        const checks = await findPendingChecksVigilanciaRegreso();
        if (checks.length === 0) {
            return res.status(200).json(null);
        }
        return res.json(checks);
    } catch (error) {
        console.error('Error en el servidor:', error);
        res.status(500).send(error.message);
    }
};

export const putCheckPoint = async (req, res) => {
    try {
        const { id } = req.params;
        const { FechaCheck, Estatus, Observaciones } = req.body;
        const idLogin = req.user.id; // token exigido por la ruta

        const checkInfoAuth = await findCheckAuthInfo(id);
        if (!checkInfoAuth) {
            return res.status(404).json({ message: 'CheckPoint no encontrado', code: 'CHECK_NOT_FOUND' });
        }

        // Autorizacion por TIPO de punto: el usuario debe tener un CheckerGrant
        // vigente del tipo del check (Caseta = cualquier dorm; Dormitorio = el del
        // alumno) y cuyo Scope cubra la Accion (SALIDA/RETORNO).
        const idDormitorio = checkInfoAuth.NombrePunto === 'Dormitorio' ? checkInfoAuth.AlumnoDormitorio : null;
        const grant = await findActiveGrantByTipo(idLogin, checkInfoAuth.NombrePunto, idDormitorio);
        const scopeCubre = grant && (grant.Scope === 'AMBOS' || grant.Scope === checkInfoAuth.Accion);
        if (!scopeCubre) {
            return res.status(403).json({
                message: 'No estas autorizado para confirmar este check',
                code: 'NOT_AUTHORIZED_CHECKER'
            });
        }

        // Enforce del orden 1->2->3->4 solo al confirmar: el paso anterior de esa
        // salida debe estar Confirmada.
        if (Estatus === 'Confirmada') {
            const pasoActual = pasoDe(checkInfoAuth.Accion, checkInfoAuth.NombrePunto);
            if (pasoActual && pasoActual > 1) {
                const steps = await findPermissionSteps(checkInfoAuth.IdPermission);
                const previo = steps.find((s) => s.Paso === pasoActual - 1);
                if (previo && previo.Estatus !== 'Confirmada') {
                    return res.status(409).json({
                        message: 'Debes confirmar el check anterior de esta salida primero',
                        code: 'CHECK_OUT_OF_ORDER'
                    });
                }
            }
        }

        // Solo registramos ConfirmadoPor cuando el check pasa a Confirmada.
        const confirmadoPor = Estatus === 'Confirmada' ? idLogin : null;

        const updated = await updateCheckPoint(id, {
            fechaCheck: FechaCheck,
            estatus: Estatus,
            observaciones: Observaciones,
            confirmadoPor
        });

        if (!updated) {
            return res.status(404).json({ message: 'CheckPoint no encontrado' });
        }

        let checkInfo = null;
        try {
            checkInfo = await findCheckInfoForSocket(id);
        } catch (queryError) {
            console.error('Error obteniendo info check para socket:', queryError);
        }

        res.json({ message: 'CheckPoint actualizado correctamente' });

        try {
            const io = req.app.get('io');
            if (checkInfo) {
                emitToUser(io, checkInfo.Matricula, 'check_updated', {
                    idCheck: parseInt(id),
                    idPermission: checkInfo.IdPermission,
                    estatus: Estatus,
                    accion: checkInfo.Accion,
                    timestamp: new Date().toISOString()
                });
            }
        } catch (socketError) {
            console.error('[Socket] Error en putCheckPoint:', socketError.message);
        }
    } catch (error) {
        console.error('Error al actualizar el CheckPoint:', error);
        res.status(500).json({ error: 'Error al actualizar el CheckPoint' });
    }
};
