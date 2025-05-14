import { buscarCheckersUseCase, cambiarActividadUseCase, eliminarCheckerUseCase } from "../../usercases/checker.usercase.js";

export async function buscarCheckers(req, res) {
    try {
        const data = await buscarCheckersUseCase(req.params.CorreoEmpleado);
        if (!data.length) return res.status(404).json({ message: "Dato no encontrado" });
        res.json(data);
    } catch (error) {
        res.status(500).send(error.message);
    }
}

export async function cambiarActividad(req, res) {
    try {
        const success = await cambiarActividadUseCase(
            req.params.IdLogin,
            req.body.StatusActividad,
            req.body.Matricula
        );
        if (!success) return res.status(404).json({ message: "Dato no encontrado" });
        res.json("Dato Actualizado");
    } catch (error) {
        res.status(500).send(error.message);
    }
}

export async function eliminarChecker(req, res) {
    try {
        const success = await eliminarCheckerUseCase(req.params.IdLogin);
        if (!success) return res.status(404).json({ message: "Dato no encontrado" });
        res.json("Dato Eliminado");
    } catch (error) {
        res.status(500).send(error.message);
    }
}
