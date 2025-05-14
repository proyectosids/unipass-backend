import { createChecksPermissionUseCase, getChecksDormitorioUseCase, getChecksDormitorioFinalUseCase, getChecksVigilanciaUseCase, getChecksVigilanciaRegresoUseCase, putCheckPointUseCase } from "../../usercases/checks.usercase.js";

export async function createChecksPermission(req, res) {
    try {
        const result = await createChecksPermissionUseCase(req.body);
        res.json({
            Id: result.IdCheck,
            StatusCheck: "Pendiente",
            Accion: req.body.Accion,
            IdPoint: req.body.IdPoint,
            IdPermission: req.body.IdPermission,
            Observaciones: "Ninguna"
        });
    } catch (error) {
        res.status(500).json({ error: "Error al crear el servicio" });
    }
}

export async function getChecksDormitorio(req, res) {
    try {
        const data = await getChecksDormitorioUseCase(req.params.Id);
        if (!data.length) return res.status(200).json(null);
        res.json(data);
    } catch (error) {
        res.status(500).send(error.message);
    }
}

export async function getChecksDormitorioFinal(req, res) {
    try {
        const data = await getChecksDormitorioFinalUseCase(req.params.Id);
        if (!data.length) return res.status(200).json(null);
        res.json(data);
    } catch (error) {
        res.status(500).send(error.message);
    }
}

export async function getChecksVigilancia(req, res) {
    try {
      const data = await getChecksVigilanciaUseCase();
      return res.json(data.length ? data : null);
    } catch (error) {
      res.status(500).send(error.message);
    }
  }
  
  export async function getChecksVigilanciaRegreso(req, res) {
    try {
      const data = await getChecksVigilanciaRegresoUseCase();
      return res.json(data.length ? data : null);
    } catch (error) {
      res.status(500).send(error.message);
    }
  }
  
  export async function putCheckPoint(req, res) {
    try {
      const { id } = req.params;
      const { FechaCheck, Estatus, Observaciones } = req.body;
      const updated = await putCheckPointUseCase(id, FechaCheck, Estatus, Observaciones);
      if (!updated) {
        return res.status(404).json({ message: "CheckPoint no encontrado" });
      }
      return res.json({ message: "CheckPoint actualizado correctamente" });
    } catch (error) {
      res.status(500).json({ error: "Error al actualizar el CheckPoint" });
    }
  }
