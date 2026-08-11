import { Router } from "express";
import { verifyToken } from "../Middleware/verifityToken.js";
import { requireCapability } from "../Middleware/requireCapability.js";
import { getAdminDashboard, getReporteSalidas, getObservacionesChecadores } from "../controllers/admin.controller.js";

const router = Router();

// Monitoreo institucional (solo lectura): requiere token + capability ADMIN o SUPERVISOR.
// ADMIN = coordinador ADMINISTRATIVO (por rol); SUPERVISOR = capability otorgada.
const soloMonitoreo = [verifyToken, requireCapability(['ADMIN', 'SUPERVISOR'])];

// Panel del Coordinador de dormitorios: conteos agregados (pendientes 2/3,
// alumnos fuera, actividad reciente, totales por dormitorio). ?desde&hasta opcional.
router.get("/admin/dashboard", ...soloMonitoreo, getAdminDashboard);

// Reporte de salidas valoradas (2/3) por rango de FechaSalida
router.get("/admin/reporte", ...soloMonitoreo, getReporteSalidas);

// Observaciones no vacias de checadores por rango de FechaCheck
router.get("/admin/observaciones", ...soloMonitoreo, getObservacionesChecadores);

export default router;
