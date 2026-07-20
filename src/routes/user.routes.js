import { Router } from "express";
import { verifyToken } from '../Middleware/verifityToken.js';
import { getUser, loginUser, putPassword, BuscarUserMatricula, getBuscarCheckers, buscarPersona, updateCargo, endCargo, registerTokenFCM, SearchTokenFCM, documentComplet, verifySessionToken, refreshTokenController, logoutUser } from "../controllers/user.controllers.js";

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

// Recuperacion/cambio de contraseña por correo
router.put("/password/:Correo", putPassword);

// LEGADO (modelo DEPARTAMENTO retirado): vivo solo durante la transicion a CheckerGrant
router.get("/userChecks/:EmailAsignador", getBuscarCheckers);

// Busqueda EXACTA por nombre o apellidos (la parcial es /buscarPersona en checkerGrant.routes)
router.get("/buscarUser/:Nombre", buscarPersona);

// Cargos delegados (suplencias, ver position.routes)
router.put("/cambiarCargo/:Matricula", updateCargo);

router.put("/terminarCargo/:Matricula", endCargo);

// Token FCM del dispositivo (VerToken resuelve la suplencia activa)
router.get("/VerToken/:Matricula", SearchTokenFCM);

router.put("/TokenDispositivo/:Matricula", registerTokenFCM);

// Marca el expediente documental como completo/incompleto
router.put('/Documentacion/:Matricula', documentComplet);

export default router;
