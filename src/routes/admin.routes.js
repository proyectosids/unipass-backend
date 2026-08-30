import { Router } from "express";
import { verifyToken } from "../Middleware/verifityToken.js";
import { requirePermission } from "../Middleware/requirePermission.js";
import { requireGlobalScope } from "../Middleware/validateScope.js";
import { PERMISSIONS } from "../security/permissions.js";
import { getAdminDashboard, getReporteSalidas, getObservacionesChecadores } from "../controllers/admin.controller.js";

const router = Router();

// PILOTO del nuevo modelo de autorización (FASE C): token -> permiso -> scope.
// Comportamiento equivalente al anterior (ADMIN|SUPERVISOR con lectura global): DASHBOARD_VIEW
// y REPORTS_VIEW los tienen ADMIN, SUPERVISOR y SUPERADMIN; el scope GLOBAL lo cumplen sus grants.
// ADMIN incluye al coordinador ADMINISTRATIVO por el puente transitorio (capability.service).

router.get("/admin/dashboard", verifyToken, requirePermission(PERMISSIONS.DASHBOARD_VIEW), requireGlobalScope(), getAdminDashboard);

router.get("/admin/reporte", verifyToken, requirePermission(PERMISSIONS.REPORTS_VIEW), requireGlobalScope(), getReporteSalidas);

router.get("/admin/observaciones", verifyToken, requirePermission(PERMISSIONS.REPORTS_VIEW), requireGlobalScope(), getObservacionesChecadores);

export default router;
