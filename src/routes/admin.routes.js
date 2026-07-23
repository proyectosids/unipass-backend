import { Router } from "express";
import { getAdminDashboard, getReporteSalidas, getObservacionesChecadores } from "../controllers/admin.controller.js";

const router = Router();

// Panel del Coordinador de dormitorios: conteos agregados (pendientes 2/3,
// alumnos fuera, actividad reciente, totales por dormitorio). ?desde&hasta opcional.
router.get("/admin/dashboard", getAdminDashboard);

// Reporte de salidas valoradas (2/3) por rango de FechaSalida
router.get("/admin/reporte", getReporteSalidas);

// Observaciones no vacias de checadores por rango de FechaCheck
router.get("/admin/observaciones", getObservacionesChecadores);

export default router;
