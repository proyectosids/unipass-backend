import { Router } from "express";
import { verifyToken } from '../Middleware/verifityToken.js';
import { createChecksPermission, getChecksDormitorio, getChecksDormitorioFinal, getChecksVigilancia, getChecksVigilanciaRegreso, putCheckPoint } from "../controllers/checks.controllers.js";
const router = Router();

router.post("/checks", createChecksPermission);

router.get("/checksDormitorio/:Id", getChecksDormitorio);

router.get("/checksDormitorioFin/:Id", getChecksDormitorioFinal);

router.get("/checksVigilancia", getChecksVigilancia);

router.get("/checksVigilanciaRegreso", getChecksVigilanciaRegreso);

router.put("/checks/:id", verifyToken, putCheckPoint);

export default router;