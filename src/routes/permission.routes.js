import { Router } from "express";
import { verifyToken } from "../Middleware/verifityToken.js";
import { requireCapability } from "../Middleware/requireCapability.js";
import { autorizarPermiso, cancelPermission, createPermission, DashboardDocumentos, DashboardPermission, deletePermission, filtrarPermisos, getPermissionForAutorizacion, getPermissionForAutorizacionPrece, getPermissionsByUser, topPermissionEmployee, topPermissionPrece, topPermissionStudent } from "../controllers/permission.controller.js";

const router = Router();

// Historial del alumno (paginado con ?page&limit)
router.get("/permission/:Id", getPermissionsByUser);

// Bandejas de autorizacion (:Id = IdEmpleado/matricula numerica)
router.get("/PermissionsPreceptor/:Id", getPermissionForAutorizacionPrece);

router.get("/permissionsEmployee/:Id", getPermissionForAutorizacion);

// Ciclo de vida del permiso
router.post("/permission", createPermission);

// Task 7 (§8): Frontend confirmo que NO consume este endpoint. Se cierra a ADMIN
// (operacion administrativa interna); las cancelaciones normales usan PUT /permission/:Id.
router.delete("/permission/:Id", verifyToken, requireCapability(['ADMIN']), deletePermission);

router.put("/permission/:Id", cancelPermission); // cancela (StatusPermission = 'Cancelado')

router.put("/permissionValorado/:Id", autorizarPermiso); // resolucion final

// Ultimos 10 por bandeja
router.get("/permissionTop/Student/:Id", topPermissionStudent);

router.get("/permissionTop/Employee/:Id", topPermissionEmployee);

router.get("/permissionTop/Preceptor/:Id", topPermissionPrece);

// Dashboards y filtro (preceptor/administrativo; :IdPreceptor = matricula)
router.get("/dashboardPermission/:IdPreceptor", DashboardPermission);

router.get("/dashboardDocumentos/:IdPreceptor", DashboardDocumentos);

router.get('/permissions/filter/:IdPreceptor', filtrarPermisos);

export default router;
