import { Router } from "express";
import { cambiarActivo, createPosition, getInfoCargo, getInfoDelegado } from "../controllers/position.controller.js";

const router = Router();

// Cargo que cubre la matricula :Id (como suplente)
router.get("/InfoCargo/:Id", getInfoCargo);

// Delegaciones hechas por el encargado :Id
router.get("/InfoDelegado/:Id", getInfoDelegado);

// Alta de suplencia (se crea con Activo = 0)
router.post("/createPosition", createPosition);

// Activa/desactiva la suplencia (:Id = IdCargo)
router.put("/activarCargo/:Id", cambiarActivo);

export default router;
