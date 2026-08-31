// Controlador de permisos de salida: CRUD del permiso, bandejas de autorizacion,
// tops, dashboards y filtros. Emite eventos de socket al alumno y a los empleados
// de la cadena (ver docs/API.md seccion 12).
import {
    findPermissionsByUserPaginated,
    findPermissionById,
    cancelPermissionById,
    findEmpleadosAuthorizeByPermission,
    deletePermissionById,
    findPermissionsForAutorizacionByEmpleado,
    findPermissionsForAutorizacionPreceByEmpleado,
    findAlumnoMatriculaByPermission,
    findTop10PermissionsByStudent,
    findTop10PermissionsByEmployee,
    findTop10PermissionsByPrece,
    findDashboardPermissionCounts,
    findDashboardDocumentosCounts,
    findUserTipoByMatricula,
    filterPermisosAdministrativo,
    filterPermisosPreceptor,
    createPermissionWithChainTx,
    findPermissionByIdempotencyKey
} from '../repositories/permission.repo.js';
import { findUserById, findUserByMatricula } from '../repositories/user.repo.js';
import { findBedroomIdentificador } from '../repositories/bedroom.repo.js';
import { resolvePuebloChain } from '../util/puebloChain.js';
import { resolverAutorizadorSalida } from '../services/authorizerResolver.service.js';
import * as ulv from '../services/ulvApiService.js';
import { sendToEmployee } from '../services/notificationService.js';
import { emitToUser, emitToEmpleado } from '../util/socketHelpers.js';

// Ajuste de zona horaria hardcodeado (UTC-6): el cliente manda hora local sin offset
// (deuda tecnica conocida, docs/API.md #14.3). Devuelve las 3 fechas en ISO UTC.
const ajustarFechasUTC = (body) => {
    const adj = (s) => { const d = new Date(s); d.setHours(d.getHours() - 6); return d.toISOString(); };
    return {
        fechaSolicitada: adj(body.FechaSolicitada),
        fechaSalida: adj(body.FechaSalida),
        fechaRegreso: adj(body.FechaRegreso)
    };
};

// Task 7.4A: HTTP por code de error de cadena. Transporte -> 502/504; dominio -> 409.
const HTTP_POR_CODE = { ULV_API_UNAVAILABLE: 502, ULV_API_TIMEOUT: 504 };

export const getPermissionsByUser = async (req, res) => {
    const { page = 1, limit = 10 } = req.query;
    try {
        const { data, totalItems } = await findPermissionsByUserPaginated(req.params.Id, page, limit);
        const totalPages = Math.ceil(totalItems / limit);
        res.json({
            data,
            pagination: {
                totalItems,
                totalPages,
                currentPage: parseInt(page),
                limit: parseInt(limit)
            }
        });
    } catch (error) {
        console.error('Error en el servidor:', error);
        res.status(500).send(error.message);
    }
};

export const getPermission = async (req, res) => {
    try {
        const permission = await findPermissionById(req.params.Id);
        if (!permission) {
            return res.status(404).json({ message: 'Dato no encontrado' });
        }
        return res.json(permission);
    } catch (error) {
        console.error('Error en el servidor:', error);
        res.status(500).send(error.message);
    }
};

// POST /permission. Task 7.4A: Tipo 1 (Pueblo) se crea server-side con su cadena
// (Jefe→Preceptor) de forma transaccional. Tipos 2/3(/4) conservan el comportamiento
// actual (Flutter orquesta /authorize; coordinador SIN cambios).
// Task 7.4B (Commit B): la cadena de autorización se crea SIEMPRE server-side. El cliente no decide
// autorizador ni estado. Tipo 1 = Pueblo (Jefe->Preceptor); Tipos 2/3 = autorizador único por el
// switch AUTORIZADOR_SALIDAS; Tipo 4 (Fin de curso) = BLOQUEADO (sin flujo certificable, ver
// docs/task7.4b y ulvApiService PENDING_FLOW_ANALYSIS_TYPE_4); otros = inválido.
export const createPermission = async (req, res) => {
    const tipo = Number(req.body?.IdTipoSalida);
    if (tipo === 1) return createPermissionPueblo(req, res);
    if (tipo === 2 || tipo === 3) return createPermissionConAutorizador(req, res);
    if (tipo === 4) {
        return res.status(501).json({ message: 'El tipo de salida Fin de curso no esta disponible', code: 'SALIDA_TIPO_NO_DISPONIBLE' });
    }
    return res.status(400).json({ message: 'IdTipoSalida invalido', code: 'SALIDA_TIPO_INVALIDA' });
};

// Tipo 1 (Pueblo): cadena Jefe de trabajo (orden 1) -> Preceptor (orden 2), dedupe por
// matricula. API-ULV se consulta ANTES de abrir la transaccion; Permission + Authorize se
// crean atomicamente (o nada). Idempotencia por header Idempotency-Key.
const createPermissionPueblo = async (req, res) => {
    const idUser = req.user.id;
    try {
        // Idempotencia: replay antes de gastar llamadas a API-ULV.
        const idempotencyKey = req.header('Idempotency-Key') || null;
        if (idempotencyKey) {
            const prev = await findPermissionByIdempotencyKey(idempotencyKey);
            if (prev) {
                return res.status(200).json({ Id: prev, IdTipoSalida: 1, StatusPermission: 'Pendiente', replayed: true });
            }
        }

        const alumno = await findUserById(idUser);
        if (!alumno || !alumno.Matricula || alumno.Dormitorio === null || alumno.Dormitorio === undefined) {
            return res.status(409).json({ message: 'Datos del alumno incompletos para construir la cadena', code: 'INCONSISTENT_DATA' });
        }
        const identificador = await findBedroomIdentificador(alumno.Dormitorio);
        if (identificador === null || identificador === undefined) {
            return res.status(409).json({ message: 'No se pudo resolver el preceptor (dormitorio sin registro institucional)', code: 'PRECEPTOR_NOT_FOUND' });
        }

        // Resolucion de cadena (fuera de la transaccion).
        let authorizers;
        try {
            authorizers = await resolvePuebloChain({
                getStudentData: ulv.getStudentData,
                getDepartmentHead: ulv.getDepartmentHead,
                getPreceptor: ulv.getPreceptor,
                resolveLocalUser: async (matricula) => {
                    const u = await findUserByMatricula(matricula);
                    return u && u.StatusActividad === 1 ? u : null;
                },
                onMismatch: (info) => console.warn('[Task7.4A][JEFE_MISMATCH]', JSON.stringify(info))
            }, { matricula: alumno.Matricula, identificador });
        } catch (chainErr) {
            const code = chainErr.code || 'AUTHORIZATION_CHAIN_INCOMPLETE';
            return res.status(HTTP_POR_CODE[code] || 409).json({ message: 'No se pudo construir la cadena de autorizacion', code });
        }

        const fechas = ajustarFechasUTC(req.body);
        const { idPermission, replayed } = await createPermissionWithChainTx({
            permission: {
                fechaSolicitada: fechas.fechaSolicitada,
                statusPermission: 'Pendiente', // SIEMPRE Pendiente: el cliente no fija el estado inicial
                fechaSalida: fechas.fechaSalida,
                fechaRegreso: fechas.fechaRegreso,
                motivo: req.body.Motivo,
                idUser,
                idTipoSalida: 1
            },
            authorizers,
            idempotencyKey,
            idLogin: idUser
        });

        // Notificaciones best-effort DESPUES del COMMIT: la Permission ya está creada, un
        // fallo de socket/FCM NO debe revertirla. Solo en creación real (201), NUNCA en
        // replay idempotente (evita reenvíos por reintento/timeout).
        if (!replayed) {
            const jefe = authorizers[0]; // orden 1 (o único, si dedupe)
            // Socket (best-effort). Solo al Jefe (orden 1); Preceptor -> 7.4B.
            try {
                const io = req.app.get('io');
                emitToUser(io, alumno.Matricula, 'new_permission_request', {
                    idPermission, idTipoSalida: 1,
                    matriculaAlumno: String(alumno.Matricula), nombreAlumno: alumno.Nombre,
                    fechaSalida: fechas.fechaSalida, timestamp: new Date().toISOString()
                });
                await emitToEmpleado(io, null, jefe.idEmpleado, 'new_authorization_assigned', {
                    idPermission, status: 'Pendiente', timestamp: new Date().toISOString()
                });
            } catch (socketErr) {
                console.error('[Task7.4A] Notificacion socket post-commit fallo (Permission ya creada):', socketErr.message);
            }
            // Push FCM server-side al Jefe (orden 1). Token resuelto en el backend; best-effort:
            // un fallo o la ausencia de token NO revierten ni fallan el POST /permission.
            try {
                await sendToEmployee({
                    matricula: jefe.matricula,
                    title: 'Solicitud de Salida al Pueblo',
                    body: 'Tienes una solicitud de Salida al Pueblo pendiente de autorización.'
                });
            } catch (pushErr) {
                console.error('[Task7.4A] Push FCM post-commit fallo (Permission ya creada):', pushErr.message);
            }
        }

        res.status(replayed ? 200 : 201).json({
            Id: idPermission,
            IdTipoSalida: 1,
            StatusPermission: 'Pendiente',
            cadena: authorizers.map((a) => ({ orden: a.orden, IdEmpleado: a.idEmpleado, matricula: a.matricula, rol: a.rol })),
            replayed
        });
    } catch (err) {
        console.error('Error creando Permission Pueblo:', err);
        if (!res.headersSent) res.status(500).json({ message: 'Error al crear el permiso', code: 'SERVER_ERROR' });
    }
};

// Tipos 2 (Especial) / 3 (A Casa): autorizador ÚNICO resuelto SERVER-SIDE por el switch
// AUTORIZADOR_SALIDAS (Coordinador o Preceptor). El cliente NO envía IdEmpleado/NoDepto/StatusAuthorize
// ni autorizador. Permission + Authorize (Orden 1, Pendiente) se crean atómicamente (o nada).
const createPermissionConAutorizador = async (req, res) => {
    const idUser = req.user.id;
    try {
        const idTipoSalida = Number(req.body?.IdTipoSalida);
        const idempotencyKey = req.header('Idempotency-Key') || null;
        if (idempotencyKey) {
            const prev = await findPermissionByIdempotencyKey(idempotencyKey);
            if (prev) return res.status(200).json({ Id: prev, IdTipoSalida: idTipoSalida, StatusPermission: 'Pendiente', replayed: true });
        }

        // Identidad del alumno = token (Task 7.2). Datos autoritativos desde BD.
        const alumno = await findUserById(idUser);
        if (!alumno || !alumno.Matricula) {
            return res.status(409).json({ message: 'Datos del alumno incompletos', code: 'INCONSISTENT_DATA' });
        }

        // Autorizador resuelto server-side (misma regla institucional). El body NO participa.
        const resol = await resolverAutorizadorSalida({ dormitorio: alumno.Dormitorio });
        if (resol.error) {
            return res.status(409).json({ message: 'No se pudo resolver el autorizador de la salida', code: resol.error });
        }

        // El autorizador debe tener cuenta UniPass ACTIVA; si no, la cadena sería irresoluble ->
        // se rechaza ANTES de crear nada (no dejar Permission huérfano).
        const autorizador = await findUserByMatricula(String(resol.idEmpleado));
        if (!autorizador || autorizador.StatusActividad !== 1) {
            return res.status(409).json({ message: 'El autorizador no tiene cuenta activa', code: 'AUTHORIZER_NOT_REGISTERED' });
        }

        const fechas = ajustarFechasUTC(req.body);
        const { idPermission, replayed } = await createPermissionWithChainTx({
            permission: {
                fechaSolicitada: fechas.fechaSolicitada,
                statusPermission: 'Pendiente', // SIEMPRE Pendiente: el cliente no fija el estado inicial
                fechaSalida: fechas.fechaSalida,
                fechaRegreso: fechas.fechaRegreso,
                motivo: req.body.Motivo,
                idUser,
                idTipoSalida
            },
            authorizers: [{ orden: 1, idEmpleado: resol.idEmpleado, noDepto: resol.noDepto, dualRole: false }],
            idempotencyKey,
            idLogin: idUser
        });

        res.status(replayed ? 200 : 201).json({
            Id: idPermission,
            IdTipoSalida: idTipoSalida,
            StatusPermission: 'Pendiente',
            cadena: [{ orden: 1, IdEmpleado: resol.idEmpleado, rol: resol.modo === 'COORDINADOR' ? 'Coordinación' : 'Preceptor' }],
            replayed
        });

        // Notificaciones best-effort POST-commit (no revierten la creación).
        if (!replayed) {
            try {
                const io = req.app.get('io');
                emitToUser(io, alumno.Matricula, 'new_permission_request', {
                    idPermission, idTipoSalida,
                    matriculaAlumno: String(alumno.Matricula), nombreAlumno: alumno.Nombre,
                    fechaSalida: fechas.fechaSalida, timestamp: new Date().toISOString()
                });
                await emitToEmpleado(io, null, resol.idEmpleado, 'new_authorization_assigned', {
                    idPermission, status: 'Pendiente', timestamp: new Date().toISOString()
                });
            } catch (socketErr) {
                console.error('[Task7.4B] Notificacion socket post-commit fallo (Permission ya creada):', socketErr.message);
            }
            try {
                await sendToEmployee({
                    matricula: String(resol.idEmpleado),
                    title: 'Solicitud de salida pendiente',
                    body: 'Tienes una solicitud de salida pendiente de autorización.'
                });
            } catch (pushErr) {
                console.error('[Task7.4B] Push FCM post-commit fallo (Permission ya creada):', pushErr.message);
            }
        }
    } catch (err) {
        console.error('Error creando Permission (2/3):', err);
        if (!res.headersSent) res.status(500).json({ message: 'Error al crear el permiso', code: 'SERVER_ERROR' });
    }
};

export const cancelPermission = async (req, res) => {
    try {
        const cancelled = await cancelPermissionById(req.params.Id);
        if (!cancelled) {
            return res.status(404).json({ message: 'Dato no encontrado' });
        }

        let empleados = [];
        try {
            empleados = await findEmpleadosAuthorizeByPermission(req.params.Id);
        } catch (queryError) {
            console.error('Error obteniendo empleados para socket:', queryError);
        }

        res.json('Dato Actualizado');

        try {
            const io = req.app.get('io');
            const eventData = {
                idPermission: parseInt(req.params.Id),
                timestamp: new Date().toISOString()
            };
            for (const emp of empleados) {
                await emitToEmpleado(io, null, emp.IdEmpleado, 'permission_cancelled', eventData);
            }
        } catch (socketError) {
            console.error('[Socket] Error en cancelPermission:', socketError.message);
        }
    } catch (error) {
        console.error('Error en el servidor:', error);
        res.status(500).send(error.message);
    }
};

export const deletePermission = async (req, res) => {
    try {
        const deleted = await deletePermissionById(req.params.Id);
        if (!deleted) {
            return res.status(404).json({ message: 'Dato no encontrado' });
        }
        return res.json({ message: 'Dato Eliminado' });
    } catch (error) {
        console.error('Error en el servidor:', error);
        res.status(500).send(error.message);
    }
};

export const getPermissionForAutorizacion = async (req, res) => {
    try {
        const permissions = await findPermissionsForAutorizacionByEmpleado(req.params.Id);
        // Lista vacia NO es error: 200 [] (antes 404, la app lo mapeaba a "sin pendientes").
        return res.json(permissions);
    } catch (error) {
        console.error('Error en el servidor:', error);
        res.status(500).send(error.message);
    }
};

export const getPermissionForAutorizacionPrece = async (req, res) => {
    try {
        const permissions = await findPermissionsForAutorizacionPreceByEmpleado(req.params.Id);
        if (permissions.length === 0) {
            return res.json(null);
        }
        return res.json(permissions);
    } catch (error) {
        console.error('Error en el servidor:', error);
        res.status(500).send(error.message);
    }
};

// RETIRADO (Task 7.4B, Commit A): autorizarPermiso / PUT /permissionValorado/:Id fue ELIMINADO del
// flujo de aprobación. El cliente ya NO puede fijar Permission.StatusPermission: el estado global lo
// calcula EXCLUSIVAMENTE el backend al resolver cada eslabón (resolveAuthorizeLinkTx en
// authorize.controller). Un eventual cierre administrativo se diseñará aparte (ruta + permiso + audit).

export const topPermissionStudent = async (req, res) => {
    try {
        const top = await findTop10PermissionsByStudent(req.params.Id);
        // Lista vacia NO es error: 200 [] (antes 404).
        return res.json(top);
    } catch (error) {
        console.error('Error en el servidor:', error);
        res.status(500).send(error.message);
    }
};

export const topPermissionEmployee = async (req, res) => {
    try {
        const top = await findTop10PermissionsByEmployee(req.params.Id);
        // Lista vacia NO es error: 200 [] (antes 404).
        return res.json(top);
    } catch (error) {
        console.error('Error en el servidor:', error);
        res.status(500).send(error.message);
    }
};

export const topPermissionPrece = async (req, res) => {
    try {
        const top = await findTop10PermissionsByPrece(req.params.Id);
        // Lista vacia NO es error: 200 [] (antes 404).
        return res.json(top);
    } catch (error) {
        console.error('Error en el servidor:', error);
        res.status(500).send(error.message);
    }
};

export const DashboardPermission = async (req, res) => {
    try {
        const resultados = await findDashboardPermissionCounts(req.params.IdPreceptor);
        if (!resultados || resultados.length === 0) {
            return res.status(404).json({ message: 'Dato no encontrado' });
        }
        return res.json(resultados);
    } catch (error) {
        console.error('Error en el servidor:', error);
        return res.status(500).send(error.message);
    }
};

export const DashboardDocumentos = async (req, res) => {
    try {
        const resultados = await findDashboardDocumentosCounts(req.params.IdPreceptor);
        if (!resultados || resultados.length === 0) {
            return res.status(404).json({ message: 'Dato no encontrado' });
        }
        return res.json(resultados);
    } catch (error) {
        console.error('Error en el servidor:', error);
        return res.status(500).send(error.message);
    }
};

export const filtrarPermisos = async (req, res) => {
    const { fechaInicio, fechaFin, status, nombre, matricula: filtroMatricula } = req.query;
    const idEmpleado = parseInt(req.params.IdPreceptor, 10);

    try {
        const tipoUser = await findUserTipoByMatricula(idEmpleado.toString());

        if (!tipoUser) {
            return res.status(404).json({ message: 'Usuario no encontrado.' });
        }

        let permisos;
        if (tipoUser === 'ADMINISTRATIVO') {
            permisos = await filterPermisosAdministrativo({
                fechaInicio, fechaFin, status, nombre, matricula: filtroMatricula, idEmpleado
            });
        } else if (tipoUser === 'PRECEPTOR') {
            permisos = await filterPermisosPreceptor({
                fechaInicio, fechaFin, status, nombre, matricula: filtroMatricula, idEmpleado
            });
        } else {
            return res.status(403).json({ message: 'El tipo de usuario no tiene permisos para consultar salidas.' });
        }

        if (!permisos.length) {
            return res.status(404).json({ message: 'No se encontraron permisos con los filtros aplicados.' });
        }

        res.json(permisos);
    } catch (error) {
        console.error('Error al filtrar permisos:', error);
        res.status(500).send(error.message);
    }
};
