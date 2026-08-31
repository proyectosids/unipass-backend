import { Router } from "express";
import { verifyToken } from '../Middleware/verifityToken.js';
import { getUser, loginUser, putMePassword, BuscarUserMatricula, getBuscarCheckers, buscarPersona, updateCargo, endCargo, registerTokenFCM, SearchTokenFCM, documentComplet, verifySessionToken, refreshTokenController, logoutUser } from "../controllers/user.controllers.js";

const router = Router();

// Consulta de perfil (por IdLogin / por matricula)
router.get("/user/:Id", getUser);

router.get("/userMatricula/:Matricula", BuscarUserMatricula);

//=========== LOGIN ===============

router.post("/login", loginUser);

router.post("/refresh-token", refreshTokenController);

router.post("/logout", verifyToken, logoutUser);

router.get("/verifyToken", verifyToken, verifySessionToken);

//==================================

// Task 7.1: cambio de contraseña del usuario autenticado (identidad del token).
router.put("/me/password", verifyToken, putMePassword);

// RETIRADO (P0): PUT /password/:Correo se ELIMINÓ. El correo del cliente nunca autoriza un cambio
// de contraseña. Cambio autenticado -> PUT /me/password (identidad = req.user). Recuperación ->
// POST /password/forgot -> /password/verify-otp -> /password/reset (resetToken). Ver
// docs/security/authorization-model.md. Sin ruta = 404 estándar de Express.

// LEGADO (modelo DEPARTAMENTO retirado): vivo solo durante la transicion a CheckerGrant
router.get("/userChecks/:EmailAsignador", getBuscarCheckers);

// Busqueda EXACTA por nombre o apellidos (la parcial es /buscarPersona en checkerGrant.routes)
router.get("/buscarUser/:Nombre", buscarPersona);

// Cargos delegados (suplencias, ver position.routes)
router.put("/cambiarCargo/:Matricula", updateCargo);

router.put("/terminarCargo/:Matricula", endCargo);

// Token FCM del dispositivo (VerToken resuelve la suplencia activa)
router.get("/VerToken/:Matricula", SearchTokenFCM);

// Task 7.2: identidad del token (matrícula del path ignorada). Un 403 aquí no debe bloquear login.
router.put("/TokenDispositivo/:Matricula", verifyToken, registerTokenFCM);

// Marca el expediente documental como completo/incompleto
router.put('/Documentacion/:Matricula', documentComplet);

export default router;
