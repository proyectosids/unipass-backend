import { Router } from "express";
import { buscarCheckers, cambiarActividad, eliminarChecker } from "../controller/checker.controller.js";

const router = Router();

router.get("/buscarCheckers/:CorreoEmpleado", buscarCheckers);
router.put("/DesactivarChecker/:IdLogin", cambiarActividad);
router.delete("/EliminarChecker/:IdLogin", eliminarChecker);

export default router;
