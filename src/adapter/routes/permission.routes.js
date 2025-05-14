import { Router } from "express";
import { getPermissionsByUser, getPermissionForAutorizacionPrece, getPermissionForAutorizacion, createPermission, deletePermission, cancelPermission, autorizarPermiso, topPermissionStudent, topPermissionEmployee, filtrarPermisos } from "../controller/permission.controller.js";

const router = Router();

router.get("/permission/:Id", getPermissionsByUser);
router.get("/PermissionsPreceptor/:Id", getPermissionForAutorizacionPrece);
router.get("/permissionsEmployee/:Id", getPermissionForAutorizacion);
router.post("/permission", createPermission);
router.delete("/permission/:Id", deletePermission);
router.put("/permission/:Id", cancelPermission);
router.put("/permissionValorado/:Id", autorizarPermiso);
router.get("/permissionTop/Student/:Id", topPermissionStudent);
router.get("/permissionTop/Employee/:Id", topPermissionEmployee);
router.get("/permissions/filter/:IdPreceptor", filtrarPermisos);

export default router;
