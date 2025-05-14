import { autorizarPermisoUseCase, cancelPermissionUseCase, createPermissionUseCase, dashboardDocumentosUseCase, dashboardPermissionUseCase, deletePermissionUseCase, filtrarPermisosUseCase, getPermissionForAutorizacionPreceUseCase, getPermissionForAutorizacionUseCase, getPermissionsByUserUseCase, topPermissionEmployeeUseCase, topPermissionPreceUseCase, topPermissionStudentUseCase } from "../../usercases/permission.usercase.js";

export async function getPermissionsByUser(req, res) {
    try {
        const { page = 1, limit = 10 } = req.query;
        const result = await getPermissionsByUserUseCase(req.params.Id, page, limit);

        return res.json({
            data: result.data,
            pagination: {
                totalItems: result.total,
                totalPages: Math.ceil(result.total / limit),
                currentPage: parseInt(page),
                limit: parseInt(limit)
            }
        });
    } catch (error) {
        res.status(500).send(error.message);
    }
}

export async function getPermissionForAutorizacionPrece(req, res) {
    try {
        const result = await getPermissionForAutorizacionPreceUseCase(req.params.Id);
        return res.json(result.length ? result : null);
    } catch (error) {
        res.status(500).send(error.message);
    }
}

export async function getPermissionForAutorizacion(req, res) {
    try {
        const result = await getPermissionForAutorizacionUseCase(req.params.Id);
        if (!result.length) return res.status(404).json({ message: "Dato no encontrado" });
        res.json(result);
    } catch (error) {
        res.status(500).send(error.message);
    }
}

export async function createPermission(req, res) {
    try {
        const result = await createPermissionUseCase(req.body);
        if (!result) {
            return res.status(400).json({ error: "El IdUsuario no existe en LoginUniPass" });
        }
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: "Error al crear el permiso" });
    }
}

export async function deletePermission(req, res) {
    try {
        const success = await deletePermissionUseCase(req.params.Id);
        if (!success) return res.status(404).json({ message: "Dato no encontrado" });
        res.json({ message: "Dato Eliminado" });
    } catch (error) {
        res.status(500).send(error.message);
    }
}

export async function cancelPermission(req, res) {
    try {
        const success = await cancelPermissionUseCase(req.params.Id);
        if (!success) return res.status(404).json({ message: "Dato no encontrado" });
        res.json("Dato Actualizado");
    } catch (error) {
        res.status(500).send(error.message);
    }
}

export async function autorizarPermiso(req, res) {
    try {
        const { StatusPermission, Observaciones } = req.body;
        const success = await autorizarPermisoUseCase(req.params.Id, StatusPermission, Observaciones);
        if (!success) return res.status(404).json({ message: "Dato no actualizado" });
        res.json({ message: "Permiso actualizado correctamente" });
    } catch (error) {
        res.status(500).send(error.message);
    }
}

export async function topPermissionStudent(req, res) {
    try {
        const result = await topPermissionStudentUseCase(req.params.Id);
        if (!result.length) return res.status(404).json({ message: "Dato no encontrado" });
        res.json(result);
    } catch (error) {
        res.status(500).send(error.message);
    }
}

export async function topPermissionEmployee(req, res) {
    try {
        const result = await topPermissionEmployeeUseCase(req.params.Id);
        if (!result.length) return res.status(404).json({ message: "Dato no encontrado" });
        res.json(result);
    } catch (error) {
        res.status(500).send(error.message);
    }
}

export async function topPermissionPrece(req, res) {
    try {
        const result = await topPermissionPreceUseCase(req.params.Id);
        if (!result.length) return res.status(404).json({ message: "Dato no encontrado" });
        res.json(result);
    } catch (error) {
        res.status(500).send(error.message);
    }
}

export async function DashboardPermission(req, res) {
    try {
        const result = await dashboardPermissionUseCase(req.params.IdPreceptor);
        if (!result.length) return res.status(404).json({ message: "Dato no encontrado" });
        res.json(result);
    } catch (error) {
        res.status(500).send(error.message);
    }
}

export async function DashboardDocumentos(req, res) {
    try {
        const result = await dashboardDocumentosUseCase(req.params.IdPreceptor);
        if (!result.length) return res.status(404).json({ message: "Dato no encontrado" });
        res.json(result);
    } catch (error) {
        res.status(500).send(error.message);
    }
}

export async function filtrarPermisos(req, res) {
    try {
        const result = await filtrarPermisosUseCase({
            idEmpleado: parseInt(req.params.IdPreceptor),
            fechaInicio: req.query.fechaInicio,
            fechaFin: req.query.fechaFin,
            status: req.query.status,
            nombre: req.query.nombre,
            matricula: req.query.matricula
        });

        if (!result || result.length === 0) {
            return res.status(404).json({ message: "No se encontraron permisos con los filtros aplicados." });
        }

        res.json(result);
    } catch (error) {
        console.error("Error al filtrar permisos:", error);
        res.status(500).send(error.message);
    }
}