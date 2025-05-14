import { Router } from "express";
import { createAuthorize, asignarPreceptor, definirAutorizacion, verificarValidacion, advancePermission } from "../controller/authorize.controller.js";

const router = Router();

router.post("/authorize", createAuthorize);
router.get("/asignarPrece/:Nivel", asignarPreceptor);
router.put("/autorizarPermission/:Id", definirAutorizacion);
router.get("/validarAuthorize/:Id", verificarValidacion);
router.get("/progresAuthorize/:Id", advancePermission);

export default router;
