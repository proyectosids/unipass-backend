import { Router } from "express";
import { requestRegistrationOtp, verifyRegistrationOtp, newUser } from "../controllers/register.controller.js";

const router = Router();

// Autoregistro PUBLICO seguro (3 pasos). La identidad se prueba con OTP al correo institucional
// (server-side) -> registrationToken -> alta con datos de ULV. El backend NO confía en TipoUser,
// Dormitorio ni datos institucionales del cliente. Ver docs/security/register-security-contract.md.

// 1) Solicitar OTP al correo institucional (respuesta genérica; anti-enumeración).
router.post("/register/otp", requestRegistrationOtp);

// 2) Verificar OTP server-side -> registrationToken (opaco, single-use, 10 min).
router.post("/register/verify-otp", verifyRegistrationOtp);

// 3) Alta final: requiere registrationToken; TipoUser/Dormitorio/datos se derivan de ULV.
router.post("/register", newUser);

export default router;
