import { Router } from "express";
import { verifyToken } from '../Middleware/verifityToken.js';
import { getMe, loginUser, putMePassword, updateCargo, endCargo, registerTokenFCM, documentComplet, verifySessionToken, refreshTokenController, logoutUser } from "../controllers/user.controllers.js";

const router = Router();

// BOLA/IDOR R1: perfil del usuario AUTENTICADO (identidad = token; sin IdLogin del cliente). ÚNICA
// lectura SELF de usuario. Respuesta con proyección segura (sin Contraseña ni TokenCFM).
router.get("/me", verifyToken, getMe);

// RETIRADO (BOLA/IDOR R1-C) -> 404 (con o sin Bearer): GET /user/:Id y GET /userMatricula/:Matricula
// (Frontend ya migró a /me, 0 consumidores). El identificador del cliente no selecciona usuario. Usar /me.

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

// RETIRADO (BOLA/IDOR R1) -> 404:
// - GET /userChecks/:EmailAsignador (modelo DEPARTAMENTO retirado; SELECT * incl. hash; anónimo).
// - GET /buscarUser/:Nombre (SELECT lp.* incl. hash/token; enumeración anónima). Reemplazo seguro:
//   GET /buscarPersona (checkerGrant.routes, verifyToken + canGrant, campos seguros).
// - GET /VerToken/:Matricula (exponía TokenCFM de cualquiera). La resolución FCM es interna server-side.

// Cargos delegados (suplencias, ver position.routes)
router.put("/cambiarCargo/:Matricula", updateCargo);

router.put("/terminarCargo/:Matricula", endCargo);

// Task 7.2: identidad del token (matrícula del path ignorada). Un 403 aquí no debe bloquear login.
router.put("/TokenDispositivo/:Matricula", verifyToken, registerTokenFCM);

// CONTENIDO (Task 7.3 D1-A · DEPRECATED — REMOVE D1-C): ahora exige Bearer y NO permite fijar 0/1
// arbitrario (:Matricula y StatusDoc se ignoran); devuelve el Documentacion actual del usuario (SELF).
router.put('/Documentacion/:Matricula', verifyToken, documentComplet);

export default router;
