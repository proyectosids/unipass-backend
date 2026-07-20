// Controlador de la cadena de autorizacion (Authorize): alta de eslabones (con
// DualRole cuando la misma persona es jefe y preceptor), resolucion por eslabon y
// avance. Notifica por socket al alumno y al siguiente aprobador pendiente.
import {
    createAuthorize as createAuthorizeRepo,
    updateAuthorizeStatus,
    findUpdatedAuthorize,
    findNextPendingEmpleado,
    findAuthorizeByEmpleadoAndPermiso,
    findAllAuthorizeByPermission
} from '../repositories/authorize.repo.js';
import { findBedroomBySexoYNivel } from '../repositories/bedroom.repo.js';
import { findAlumnoMatriculaByPermission } from '../repositories/permission.repo.js';
import { findConfigValue } from '../repositories/config.repo.js';
import { findPreceptorMatriculaByDormitorio, findCoordinadorActivo } from '../repositories/user.repo.js';
import { emitToUser, emitToEmpleado } from '../util/socketHelpers.js';

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
// dbo.Configuracion (migracion 005), sin fallback silencioso:
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

export const createAuthorize = async (req, res) => {
    try {
        const result = await createAuthorizeRepo({
            idEmpleado: req.body.IdEmpleado,
            noDepto: req.body.NoDepto,
            idPermission: req.body.IdPermission,
            statusAuthorize: req.body.StatusAuthorize
        });
        if (result === null) {
            return res.status(404).json({ message: 'No se puede guardar el archivo' });
        }

        res.json({
            Id: result.id,
            IdEmpleado: req.body.IdEmpleado,
            NoDepto: req.body.NoDepto,
            IdPermission: req.body.IdPermission,
            StatusAuthorize: req.body.StatusAuthorize,
            DualRole: result.dualRoleApplied
        });

        // No emitimos cuando se aplico DualRole: ya hubo un emit en el primer POST
        // y la app no debe recibir una segunda notificacion para la misma persona.
        if (!result.dualRoleApplied) {
            try {
                const io = req.app.get('io');
                await emitToEmpleado(io, null, req.body.IdEmpleado, 'new_authorization_assigned', {
                    idPermission: req.body.IdPermission,
                    status: req.body.StatusAuthorize,
                    timestamp: new Date().toISOString()
                });
            } catch (socketError) {
                console.error('[Socket] Error en createAuthorize:', socketError.message);
            }
        }
    } catch (error) {
        console.error('Error en el servidor:', error);
        res.status(500).json({ error: 'Error al crear el servicio' });
    }
};

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

export const definirAutorizacion = async (req, res) => {
    try {
        const updated = await updateAuthorizeStatus(req.params.Id, req.body.IdEmpleado, req.body.StatusAuthorize);
        if (!updated) {
            return res.status(404).json({ message: 'Dato no actualizado' });
        }

        const updatedRecord = await findUpdatedAuthorize(req.params.Id, req.body.IdEmpleado, req.body.StatusAuthorize);

        let matriculaAlumno = null;
        let nextEmpleado = null;
        try {
            matriculaAlumno = await findAlumnoMatriculaByPermission(req.params.Id);
            if (req.body.StatusAuthorize === 'Aprobada') {
                nextEmpleado = await findNextPendingEmpleado(req.params.Id);
            }
        } catch (queryError) {
            console.error('[Socket] Error obteniendo datos para emit:', queryError.message);
        }

        res.json(updatedRecord);

        try {
            const io = req.app.get('io');

            // 1) Notificar al alumno del cambio de estado
            emitToUser(io, matriculaAlumno, 'permission_status_changed', {
                idPermission: parseInt(req.params.Id),
                status: req.body.StatusAuthorize,
                updatedBy: req.body.IdEmpleado,
                timestamp: new Date().toISOString()
            });

            // 2) Si hay siguiente eslabon (jefe aprobo -> preceptor), notificarlo
            if (nextEmpleado) {
                await emitToEmpleado(io, null, nextEmpleado, 'new_authorization_assigned', {
                    idPermission: parseInt(req.params.Id),
                    status: 'Pendiente',
                    timestamp: new Date().toISOString()
                });
            }
        } catch (socketError) {
            console.error('[Socket] Error en definirAutorizacion:', socketError.message);
        }
    } catch (error) {
        console.error('Error en el servidor:', error);
        res.status(500).send(error.message);
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
