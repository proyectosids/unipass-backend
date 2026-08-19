import crypto from 'crypto';
import { hashData } from '../util/hashData.js';
import { validatePassword } from '../util/passwordPolicy.js';
import { findUserByCorreo } from '../repositories/user.repo.js';
import {
    createResetToken,
    findResetByTokenHash,
    consumeResetAndUpdatePasswordTx
} from '../repositories/passwordReset.repo.js';
import { revokeAllUserRefreshTokens } from '../repositories/refreshToken.repo.js';
import * as otpProvider from '../services/otpProviderService.js';
import { OtpProviderError } from '../services/otpProviderService.js';

// Task 7.1.B - Recuperación de contraseña server-side. El backend es la autoridad: envía
// el OTP, lo valida contra el proveedor, emite un resetToken propio y actualiza el hash.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESET_TTL_MS = 10 * 60 * 1000; // 10 minutos
const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');
const normEmail = (v) => String(v ?? '').trim().toLowerCase();

const httpDeProveedor = (code) => (code === 'OTP_PROVIDER_TIMEOUT' ? 504 : 502);

// POST /password/forgot { email }. Respuesta pública GENÉRICA (no enumeración de cuentas).
export const postForgot = async (req, res) => {
    try {
        const email = normEmail(req.body?.email);
        if (!EMAIL_RE.test(email)) {
            return res.status(400).json({ message: 'Email invalido', code: 'INVALID_EMAIL' });
        }
        const user = await findUserByCorreo(email);
        if (user) {
            // Solo se llama al proveedor si la cuenta existe (no enviar OTP a correos ajenos).
            await otpProvider.sendRecoveryOtp(email);
        }
        // Misma respuesta exista o no la cuenta.
        return res.json({ message: 'Si la cuenta existe, se enviaron instrucciones de recuperacion.' });
    } catch (error) {
        if (error instanceof OtpProviderError) {
            return res.status(httpDeProveedor(error.code)).json({ message: 'Servicio de verificacion no disponible', code: error.code });
        }
        console.error('Error en /password/forgot:', error);
        return res.status(500).json({ message: 'Error en recuperacion', code: 'SERVER_ERROR' });
    }
};

// POST /password/verify-otp { email, otp }. Valida el OTP server-side; si es válido emite
// un resetToken opaco de un solo uso (10 min). Flutter NUNCA recibe el hash almacenado.
export const postVerifyOtp = async (req, res) => {
    try {
        const email = normEmail(req.body?.email);
        const otp = String(req.body?.otp ?? '').trim();
        if (!EMAIL_RE.test(email) || !otp) {
            return res.status(400).json({ message: 'email y otp son obligatorios', code: 'MISSING_FIELDS' });
        }

        let valido = false;
        try {
            valido = await otpProvider.verifyOtp(email, otp);
        } catch (error) {
            if (error instanceof OtpProviderError) {
                return res.status(httpDeProveedor(error.code)).json({ message: 'Servicio de verificacion no disponible', code: error.code });
            }
            throw error;
        }

        const user = await findUserByCorreo(email);
        if (!valido || !user) {
            return res.status(400).json({ message: 'OTP invalido o expirado', code: 'INVALID_OTP' });
        }

        const resetToken = crypto.randomBytes(32).toString('hex');
        await createResetToken({
            idLogin: user.IdLogin,
            tokenHash: sha256(resetToken),
            expiraEn: new Date(Date.now() + RESET_TTL_MS)
        });
        return res.json({ resetToken });
    } catch (error) {
        console.error('Error en /password/verify-otp:', error);
        return res.status(500).json({ message: 'Error verificando el codigo', code: 'SERVER_ERROR' });
    }
};

// POST /password/reset { resetToken, nueva }. Valida el resetToken (existe/no expirado/no
// usado), aplica la política, actualiza el hash y consume el token de forma atómica.
export const postReset = async (req, res) => {
    try {
        const { resetToken, nueva } = req.body || {};
        if (!resetToken || !nueva) {
            return res.status(400).json({ message: 'resetToken y nueva son obligatorios', code: 'MISSING_FIELDS' });
        }
        const policy = validatePassword(nueva);
        if (!policy.ok) {
            return res.status(400).json({ message: policy.message, code: 'WEAK_PASSWORD' });
        }

        const record = await findResetByTokenHash(sha256(resetToken));
        if (!record) {
            return res.status(400).json({ message: 'Token de recuperacion invalido', code: 'RESET_TOKEN_INVALID' });
        }
        if (record.UsadoEn) {
            return res.status(400).json({ message: 'Token de recuperacion ya utilizado', code: 'RESET_TOKEN_USED' });
        }
        if (new Date(record.ExpiraEn) < new Date()) {
            return res.status(400).json({ message: 'Token de recuperacion expirado', code: 'RESET_TOKEN_EXPIRED' });
        }

        const hashedPassword = await hashData(nueva);
        const ok = await consumeResetAndUpdatePasswordTx({ resetId: record.Id, idLogin: record.IdLogin, hashedPassword });
        if (!ok) {
            // Race: consumido concurrentemente entre la lectura y el update.
            return res.status(400).json({ message: 'Token de recuperacion ya utilizado', code: 'RESET_TOKEN_USED' });
        }

        // Revocar sesiones previas del usuario (refresh tokens) tras la recuperación.
        try {
            await revokeAllUserRefreshTokens(record.IdLogin);
        } catch (revErr) {
            console.error('[7.1.B] No se pudieron revocar sesiones tras reset:', revErr.message);
        }

        return res.json({ message: 'Contrasena actualizada correctamente' });
    } catch (error) {
        console.error('Error en /password/reset:', error);
        return res.status(500).json({ message: 'Error al restablecer la contrasena', code: 'SERVER_ERROR' });
    }
};
