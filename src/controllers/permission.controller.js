// Controlador de permisos de salida: CRUD del permiso, bandejas de autorizacion,
// tops, dashboards y filtros. Emite eventos de socket al alumno y a los empleados
// de la cadena (ver docs/API.md seccion 12).
import {
    findPermissionsByUserPaginated,
    findPermissionById,
    userExistsById,
    createPermissionRecord,
    findAlumnoBasicByLogin,
    cancelPermissionById,
    findEmpleadosAuthorizeByPermission,
    deletePermissionById,
    findPermissionsForAutorizacionByEmpleado,
    findPermissionsForAutorizacionPreceByEmpleado,
    updatePermissionStatus,
    findAlumnoMatriculaByPermission,
    findTop10PermissionsByStudent,
    findTop10PermissionsByEmployee,
    findTop10PermissionsByPrece,
    findDashboardPermissionCounts,
    findDashboardDocumentosCounts,
    findUserTipoByMatricula,
    filterPermisosAdministrativo,
    filterPermisosPreceptor
} from '../repositories/permission.repo.js';
import { emitToUser, emitToEmpleado } from '../util/socketHelpers.js';

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

export const createPermission = async (req, res) => {
    try {
        const exists = await userExistsById(req.body.IdUser);
        if (!exists) {
            return res.status(400).json({ error: 'El IdUsuario no existe en dbo.Users' });
        }

        // Ajuste de zona horaria hardcodeado (UTC-6): el cliente manda hora local sin
        // offset y aqui se convierte a UTC. Deuda tecnica conocida (docs/API.md #14.3):
        // no maneja DST ni otras zonas; cambiarlo requiere coordinarse con la app.
        const fechaSolicitada = new Date(req.body.FechaSolicitada);
        fechaSolicitada.setHours(fechaSolicitada.getHours() - 6);
        const fechaSalida = new Date(req.body.FechaSalida);
        fechaSalida.setHours(fechaSalida.getHours() - 6);
        const fechaRegreso = new Date(req.body.FechaRegreso);
        fechaRegreso.setHours(fechaRegreso.getHours() - 6);

        const fechaSolicitadaUTC = fechaSolicitada.toISOString();
        const fechaSalidaUTC = fechaSalida.toISOString();
        const fechaRegresoUTC = fechaRegreso.toISOString();

        const idPermissionCreated = await createPermissionRecord({
            fechaSolicitada: fechaSolicitadaUTC,
            statusPermission: req.body.StatusPermission,
            fechaSalida: fechaSalidaUTC,
            fechaRegreso: fechaRegresoUTC,
            motivo: req.body.Motivo,
            idUser: req.body.IdUser,
            idTipoSalida: req.body.IdTipoSalida
        });

        let alumnoInfo = null;
        try {
            alumnoInfo = await findAlumnoBasicByLogin(req.body.IdUser);
        } catch (queryError) {
            console.error('Error obteniendo info alumno para socket:', queryError);
        }

        res.json({
            Id: idPermissionCreated,
            FechaSolicitada: fechaSolicitadaUTC,
            StatusPermission: req.body.StatusPermission,
            FechaSalida: fechaSalidaUTC,
            FechaRegreso: fechaRegresoUTC,
            Motivo: req.body.Motivo,
            MedioSalida: req.body.MedioSalida,
            IdUser: req.body.IdUser,
            IdTipoSalida: req.body.IdTipoSalida
        });

        try {
            const io = req.app.get('io');
            if (alumnoInfo) {
                emitToUser(io, alumnoInfo.Matricula, 'new_permission_request', {
                    idPermission: idPermissionCreated,
                    idTipoSalida: req.body.IdTipoSalida,
                    matriculaAlumno: String(alumnoInfo.Matricula),
                    nombreAlumno: alumnoInfo.Nombre,
                    fechaSalida: fechaSalidaUTC,
                    timestamp: new Date().toISOString()
                });
            }
        } catch (socketError) {
            console.error('[Socket] Error en createPermission:', socketError.message);
        }
    } catch (err) {
        console.error('Error en el servidor:', err);
        res.status(500).json({ error: 'Error al crear el permiso' });
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

export const autorizarPermiso = async (req, res) => {
    try {
        const updated = await updatePermissionStatus(req.params.Id, req.body.StatusPermission, req.body.Observaciones);
        if (!updated) {
            return res.status(404).json({ message: 'Dato no actualizado' });
        }

        let matriculaAlumno = null;
        try {
            matriculaAlumno = await findAlumnoMatriculaByPermission(req.params.Id);
        } catch (queryError) {
            console.error('Error obteniendo matricula para socket:', queryError);
        }

        res.json({ message: 'Permiso actualizado correctamente' });

        try {
            const io = req.app.get('io');
            emitToUser(io, matriculaAlumno, 'permission_finalized', {
                idPermission: parseInt(req.params.Id),
                status: req.body.StatusPermission,
                observaciones: req.body.Observaciones,
                timestamp: new Date().toISOString()
            });
        } catch (socketError) {
            console.error('[Socket] Error en autorizarPermiso:', socketError.message);
        }
    } catch (error) {
        console.error('Error en el servidor:', error);
        res.status(500).send(error.message);
    }
};

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
