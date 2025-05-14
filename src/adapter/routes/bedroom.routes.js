// src/adapter/routes/bedroom.routes.js
import { Router } from "express";
import { getBedroomStudent } from "../controller/bedroom.controller.js";

const router = Router();

router.get("/dormitorio/:Sexo/:NivelAcademico", getBedroomStudent);

export default router;

