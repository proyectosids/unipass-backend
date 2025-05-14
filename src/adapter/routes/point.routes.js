import { Router } from "express";
import { getPointsChecks } from "../controller/point.controller.js";

const router = Router();

router.get("/getPoints/:Id", getPointsChecks);

export default router;
