import {
    createCheckPoint,
    findPendingChecksDormitorioSalida,
    findPendingChecksDormitorioRetorno,
    findPendingChecksVigilanciaSalida,
    findPendingChecksVigilanciaRegreso,
    updateCheckPoint,
    findCheckInfoForSocket
} from '../repositories/checks.repo.js';
import { emitToUser } from '../util/socketHelpers.js';

export const createChecksPermission = async (req, res) => {
    try {
        const newId = await createCheckPoint({
            accion: req.body.Accion,
            idPoint: req.body.IdPoint,
            idPermission: req.body.IdPermission
        });
        res.json({
            Id: newId,
            StatusCheck: 'Pendiente',
            Accion: req.body.Accion,
            IdPoint: req.body.IdPoint,
            IdPermission: req.body.IdPermission,
            Observaciones: 'Ninguna'
        });
    } catch (error) {
        console.error('Error en el servidor');
        res.status(500).json({ error: 'Error al crear el servico' });
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

        const updated = await updateCheckPoint(id, {
            fechaCheck: FechaCheck,
            estatus: Estatus,
            observaciones: Observaciones
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
