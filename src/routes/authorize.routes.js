import { Router } from "express";
import { AdvancePermission, asignarPreceptor, createAuthorize, definirAutorizacion, verificarValidacion } from "../controllers/authorize.controller.js";

const router = Router();

// Alta de un eslabon de la cadena (idempotente: repetido -> DualRole)
router.post("/authorize", createAuthorize);

// Dormitorio/preceptor que corresponde por nivel academico (+ ?Sexo=)
router.get("/asignarPrece/:Nivel", asignarPreceptor);

// Resolucion de un eslabon (:Id = IdPermission; body IdEmpleado + StatusAuthorize)
router.put("/autorizarPermission/:Id", definirAutorizacion);

// ¿El empleado :Id participa en la cadena del permiso ?IdPermiso= ?
router.get("/validarAuthorize/:Id", verificarValidacion);

// Avance de la cadena del permiso :Id (con Rol, NombreAprobador, Orden, DualRole)
router.get("/progresAuthorize/:Id", AdvancePermission);

export default router;
