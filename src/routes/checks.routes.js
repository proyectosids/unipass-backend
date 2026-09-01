import { Router } from "express";
import { verifyToken } from '../Middleware/verifityToken.js';
import { getChecksDormitorio, getChecksDormitorioFinal, getChecksVigilancia, getChecksVigilanciaRegreso, putCheckPoint } from "../controllers/checks.controllers.js";
const router = Router();

// RETIRADO (Checks Hardening C2): POST /checks se ELIMINÓ. La creación de los 4 CheckPoints es una
// operación INTERNA del backend al transicionar Permission -> Aprobada (ensureCheckPointsTx dentro de
// resolveAuthorizeLinkTx). No existe ninguna API pública que inserte CheckPoints. Ruta inexistente -> 404.

// Listados de pendientes por paso (1..4); :Id = IdDormitorio
router.get("/checksDormitorio/:Id", getChecksDormitorio); // paso 1: salida dormitorio

router.get("/checksDormitorioFin/:Id", getChecksDormitorioFinal); // paso 4: regreso dormitorio

router.get("/checksVigilancia", getChecksVigilancia); // paso 2: salida caseta

router.get("/checksVigilanciaRegreso", getChecksVigilanciaRegreso); // paso 3: regreso caseta

// Confirmacion: exige token + CheckerGrant vigente del tipo del punto y orden 1->4
router.put("/checks/:id", verifyToken, putCheckPoint);

export default router;
