import { Router } from "express";
import { verifyToken } from '../Middleware/verifityToken.js';
import { getUsers, getUser, updateUser, deleteUser, loginUser, putPassword, BuscarUserMatricula, getBuscarCheckers, buscarPersona, updateCargo, endCargo, registerTokenFCM, SearchTokenFCM, documentComplet, verifySessionToken, refreshTokenController, logoutUser } from "../controllers/user.controllers.js";

const router = Router();

router.get("/users", getUsers);

router.get("/user/:Id", getUser);

router.get("/userMatricula/:Matricula", BuscarUserMatricula);

router.put("/users/:Id", updateUser);

router.delete("/users/:Id", deleteUser);

//=========== LOGIN ===============

router.post("/login", loginUser);

router.post("/refresh-token", refreshTokenController);

router.post("/logout", verifyToken, logoutUser);

router.get("/verifyToken", verifyToken, verifySessionToken);

//==================================

router.put("/password/:Correo", putPassword);

router.get("/userChecks/:EmailAsignador", getBuscarCheckers);

router.get("/buscarUser/:Nombre", buscarPersona);

router.put("/cambiarCargo/:Matricula", updateCargo);

router.put("/terminarCargo/:Matricula", endCargo);

router.get("/VerToken/:Matricula", SearchTokenFCM);

router.put("/TokenDispositivo/:Matricula", registerTokenFCM);

router.put('/Documentacion/:Matricula', documentComplet);

export default router;