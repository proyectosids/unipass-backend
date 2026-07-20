import { Router } from "express";
import { getAdminDashboard } from "../controllers/admin.controller.js";

const router = Router();

// Panel del Coordinador de dormitorios: conteos agregados (pendientes 2/3,
// alumnos fuera, actividad reciente, totales por dormitorio). ?desde&hasta opcional.
router.get("/admin/dashboard", getAdminDashboard);

export default router;
