import { Router } from "express";
import { getBedroomStudent } from "../controllers/bedroom.controller.js";

const router = Router();

// Dormitorio que corresponde por sexo y nivel academico (asignacion al registrarse)
router.get("/dormitorio/:Sexo/:NivelAcademico", getBedroomStudent);

export default router;
