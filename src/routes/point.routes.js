import { Router } from "express";
import { getPointsChecks } from "../controllers/point.controller.js";
const router = Router();

// Puntos de control de un tipo de salida (:Id = IdExit); base de los 4 checks
router.get("/getPoints/:Id", getPointsChecks);

export default router;