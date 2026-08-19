import { Router } from "express";
import { postForgot, postVerifyOtp, postReset } from "../controllers/password.controller.js";

const router = Router();

// Task 7.1.B - Recuperación de contraseña server-side (públicos: el usuario olvidó su clave).
router.post("/password/forgot", postForgot);       // envía OTP de recuperación (respuesta genérica)
router.post("/password/verify-otp", postVerifyOtp); // valida OTP server-side -> resetToken
router.post("/password/reset", postReset);          // valida resetToken + actualiza contraseña

export default router;
