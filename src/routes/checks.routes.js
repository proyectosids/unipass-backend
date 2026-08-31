import { Router } from "express";
import { verifyToken } from '../Middleware/verifityToken.js';
import { createChecksPermission, getChecksDormitorio, getChecksDormitorioFinal, getChecksVigilancia, getChecksVigilanciaRegreso, putCheckPoint } from "../controllers/checks.controllers.js";
const router = Router();

// DEPRECATED / TRANSITIONAL (Checks Hardening C1): el backend crea los 4 CheckPoints server-side al
// aprobarse el permiso. Esta ruta queda solo como PUENTE idempotente mientras Flutter migra; se RETIRA
// en C2 (-> 404). No ampliar su uso. El sistema no depende de ella.
router.post("/checks", createChecksPermission);

// Listados de pendientes por paso (1..4); :Id = IdDormitorio
router.get("/checksDormitorio/:Id", getChecksDormitorio); // paso 1: salida dormitorio

router.get("/checksDormitorioFin/:Id", getChecksDormitorioFinal); // paso 4: regreso dormitorio

router.get("/checksVigilancia", getChecksVigilancia); // paso 2: salida caseta

router.get("/checksVigilanciaRegreso", getChecksVigilanciaRegreso); // paso 3: regreso caseta

// Confirmacion: exige token + CheckerGrant vigente del tipo del punto y orden 1->4
router.put("/checks/:id", verifyToken, putCheckPoint);

export default router;
