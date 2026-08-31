import { Router } from "express";
import { verifyToken } from "../Middleware/verifityToken.js";
import { requireCapability } from "../Middleware/requireCapability.js";
import { requireOwnership } from "../Middleware/requireOwnership.js";
import { findPermissionOwnerId } from "../repositories/permission.repo.js";
import { cancelPermission, createPermission, DashboardDocumentos, DashboardPermission, deletePermission, filtrarPermisos, getPermissionForAutorizacion, getPermissionForAutorizacionPrece, getPermissionsByUser, topPermissionEmployee, topPermissionPrece, topPermissionStudent } from "../controllers/permission.controller.js";

const router = Router();

// Historial del alumno (paginado con ?page&limit)
router.get("/permission/:Id", getPermissionsByUser);

// Bandejas de autorizacion (:Id = IdEmpleado/matricula numerica)
router.get("/PermissionsPreceptor/:Id", getPermissionForAutorizacionPrece);

router.get("/permissionsEmployee/:Id", getPermissionForAutorizacion);

// Ciclo de vida del permiso — Task 7.2: identidad del token (IdUser del body ignorado).
router.post("/permission", verifyToken, createPermission);

// Task 7 (§8): Frontend confirmo que NO consume este endpoint. Se cierra a ADMIN
// (operacion administrativa interna); las cancelaciones normales usan PUT /permission/:Id.
router.delete("/permission/:Id", verifyToken, requireCapability(['ADMIN']), deletePermission);

// Cancela (StatusPermission='Cancelado'); Task 7.2: solo el dueño (Permission.IdUser == token.id)
router.put("/permission/:Id", verifyToken, requireOwnership((req) => findPermissionOwnerId(req.params.Id), { notFoundCode: 'PERMISSION_NOT_FOUND' }), cancelPermission);

// RETIRADO (Task 7.4B, Commit A): PUT /permissionValorado/:Id se ELIMINÓ. El estado global de
// Permission ya no lo fija el cliente: lo calcula el backend al resolver cada eslabón
// (PUT /autorizarPermission/:Id -> resolveAuthorizeLinkTx). Ruta inexistente -> 404.

// Ultimos 10 por bandeja
router.get("/permissionTop/Student/:Id", topPermissionStudent);

router.get("/permissionTop/Employee/:Id", topPermissionEmployee);

router.get("/permissionTop/Preceptor/:Id", topPermissionPrece);

// Dashboards y filtro (preceptor/administrativo; :IdPreceptor = matricula)
router.get("/dashboardPermission/:IdPreceptor", DashboardPermission);

router.get("/dashboardDocumentos/:IdPreceptor", DashboardDocumentos);

router.get('/permissions/filter/:IdPreceptor', filtrarPermisos);

export default router;
