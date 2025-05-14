import { createAuthorizeUseCase, asignarPreceptorUseCase, definirAutorizacionUseCase, verificarValidacionUseCase, advancePermissionUseCase } from "../../usercases/authorize.usercase";

export async function createAuthorize(req, res) {
    try {
        const result = await createAuthorizeUseCase(req.body);
        if (!result) return res.status(404).json({ message: "No se puede guardar el archivo" });
        res.json({ ...req.body, Id: result.IdAuthorize });
    } catch (error) {
        res.status(500).json({ error: 'Error al crear el servicio' });
    }
}

export async function asignarPreceptor(req, res) {
    try {
        const result = await asignarPreceptorUseCase(req.params.Nivel, req.query.Sexo);
        if (!result) return res.status(404).json({ message: "Dato no encontrado" });
        res.json(result);
    } catch (error) {
        res.status(500).send(error.message);
    }
}

export async function definirAutorizacion(req, res) {
    try {
        const result = await definirAutorizacionUseCase(
            req.params.Id,
            req.body.IdEmpleado,
            req.body.StatusAuthorize
        );
        if (!result) return res.status(404).json({ message: "Dato no actualizado" });
        res.json(result);
    } catch (error) {
        res.status(500).send(error.message);
    }
}

export async function verificarValidacion(req, res) {
    try {
        const result = await verificarValidacionUseCase(req.params.Id, req.query.IdPermiso);
        if (!result) return res.status(404).json({ message: "Dato no encontrado" });
        res.json(result);
    } catch (error) {
        res.status(500).send(error.message);
    }
}

export async function advancePermission(req, res) {
    try {
        const result = await advancePermissionUseCase(req.params.Id);
        if (!result.length) return res.status(404).json({ message: "Dato no encontrado" });
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
