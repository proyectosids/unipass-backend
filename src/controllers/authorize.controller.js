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
import { emitToUser, emitToEmpleado } from '../util/socketHelpers.js';

export const createAuthorize = async (req, res) => {
    try {
        const newId = await createAuthorizeRepo({
            idEmpleado: req.body.IdEmpleado,
            noDepto: req.body.NoDepto,
            idPermission: req.body.IdPermission,
            statusAuthorize: req.body.StatusAuthorize
        });
        if (newId === null) {
            return res.status(404).json({ message: 'No se puede guardar el archivo' });
        }

        res.json({
            Id: newId,
            IdEmpleado: req.body.IdEmpleado,
            NoDepto: req.body.NoDepto,
            IdPermission: req.body.IdPermission,
            StatusAuthorize: req.body.StatusAuthorize
        });

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
        return res.json(authorizes);
    } catch (error) {
        console.error('Error en el servidor:', error);
        res.status(500).json({ error: error.message });
    }
};
