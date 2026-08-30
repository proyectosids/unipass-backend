import { Router } from "express";
import { verifyToken } from "../Middleware/verifityToken.js";
import { requireCapability } from "../Middleware/requireCapability.js";
import { newUser } from "../controllers/register.controller.js";

const router = Router();

// P0 (hardening): el alta de usuario ANTES era anónima -> permitía crear cuentas
// ADMINISTRATIVO y escalar a ADMIN. Ahora exige token + capability ADMIN. El TipoUser
// permitido se valida server-side con una allowlist en el controlador (no se confía en el body).
router.post("/register", verifyToken, requireCapability(['ADMIN']), newUser);

export default router;
