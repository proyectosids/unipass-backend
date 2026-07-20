import { Router } from "express";
import { newUser } from "../controllers/register.controller.js";

const router = Router();

// Alta de usuario (rechaza TipoUser='DEPARTAMENTO': 400 DEPARTAMENTO_RETIRED)
router.post("/register", newUser);

export default router;
