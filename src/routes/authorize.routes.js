import { Router } from "express";
import { verifyToken } from "../Middleware/verifityToken.js";
import { AdvancePermission, asignarPreceptor, createAuthorize, definirAutorizacion, verificarValidacion, getAutorizadorSalida } from "../controllers/authorize.controller.js";

const router = Router();

// Resuelve quien autoriza salidas ESPECIAL(2)/A CASA(3) segun el switch
// AUTORIZADOR_SALIDAS en UNIPASS.Configuracion (COORDINADOR o PRECEPTOR)
router.get("/autorizadorSalida", getAutorizadorSalida);

// Alta de un eslabon de la cadena (idempotente: repetido -> DualRole)
router.post("/authorize", createAuthorize);

// Dormitorio/preceptor que corresponde por nivel academico (+ ?Sexo=)
router.get("/asignarPrece/:Nivel", asignarPreceptor);

// Task 7.4B (Commit A): resolución SEGURA de un eslabón. :Id = IdPermission. REQUIERE Bearer.
// Actor = usuario autenticado (matrícula resuelta server-side); el IdEmpleado del body se IGNORA.
// Body: { StatusAuthorize: 'Aprobada' | 'Rechazada' }.
router.put("/autorizarPermission/:Id", verifyToken, definirAutorizacion);

// ¿El empleado :Id participa en la cadena del permiso ?IdPermiso= ?
router.get("/validarAuthorize/:Id", verificarValidacion);

// Avance de la cadena del permiso :Id (con Rol, NombreAprobador, Orden, DualRole)
router.get("/progresAuthorize/:Id", AdvancePermission);

export default router;
