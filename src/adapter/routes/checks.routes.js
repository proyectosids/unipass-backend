import { Router } from "express";
import { createChecksPermission, getChecksDormitorio, getChecksDormitorioFinal, getChecksVigilancia, getChecksVigilanciaRegreso, putCheckPoint } from "../controller/checks.controller.js";

const router = Router();

router.post("/checks", createChecksPermission);
router.get("/checksDormitorio/:Id", getChecksDormitorio);
router.get("/checksDormitorioFin/:Id", getChecksDormitorioFinal);
router.get("/checksVigilancia", getChecksVigilancia);
router.get("/checksVigilanciaRegreso", getChecksVigilanciaRegreso);
router.put("/checks/:id", putCheckPoint);

export default router;
