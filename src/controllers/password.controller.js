import crypto from 'crypto';
import { hashData } from '../util/hashData.js';
import { validatePassword } from '../util/passwordPolicy.js';
import { findUserByMatricula } from '../repositories/user.repo.js';
import {
    createResetToken,
    findResetByTokenHash,
    consumeResetAndUpdatePasswordTx
} from '../repositories/passwordReset.repo.js';
import { revokeAllUserRefreshTokens } from '../repositories/refreshToken.repo.js';
import * as otpProvider from '../services/otpProviderService.js';
import { OtpProviderError } from '../services/otpProviderService.js';
import * as ulv from '../services/ulvApiService.js';
import { UlvApiError } from '../services/ulvApiService.js';

// Task 7.1.B - Recuperación de contraseña server-side, INICIADA POR MATRÍCULA. El backend
// resuelve matrícula → cuenta UniPass (IdLogin) → correo institucional AUTORITATIVO (API-ULV),
// y solo entonces habla con el proveedor OTP (que sigue recibiendo email, sin cambios).
// Flutter nunca resuelve ni recibe el correo.

const RESET_TTL_MS = 10 * 60 * 1000; // 10 minutos
const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');

// Caída de fuente institucional (UlvApiError) o proveedor OTP (OtpProviderError) -> HTTP normalizado.
const httpDeInfra = (code) => (String(code).endsWith('TIMEOUT') ? 504 : 502);
const esErrorDeInfra = (e) => e instanceof OtpProviderError || e instanceof UlvApiError;

// POST /password/forgot { matricula }. Respuesta pública GENÉRICA (anti-enumeración): no
// revela si la matrícula/cuenta/email existe. Solo contacta al proveedor si hay email resoluble.
export const postForgot = async (req, res) => {
    try {
        const matricula = String(req.body?.matricula ?? '').trim();
        if (!matricula) {
            return res.status(400).json({ message: 'matricula es obligatoria', code: 'MISSING_FIELDS' });
        }
        const user = await findUserByMatricula(matricula);
        if (user && user.StatusActividad === 1) {
            const email = await ulv.getInstitutionalEmail(matricula); // autoritativo; UlvApiError si cae
            if (email) {
                await otpProvider.sendRecoveryOtp(email); // OtpProviderError si cae
            }
        }
        // Idéntica respuesta exista o no la cuenta / el email.
        return res.json({ message: 'Si la cuenta existe, se enviaron instrucciones de recuperacion.' });
    } catch (error) {
        if (esErrorDeInfra(error)) {
            return res.status(httpDeInfra(error.code)).json({ message: 'Servicio no disponible', code: error.code });
        }
        console.error('Error en /password/forgot');
        return res.status(500).json({ message: 'Error en recuperacion', code: 'SERVER_ERROR' });
    }
};

// POST /password/verify-otp { matricula, otp }. Resuelve matrícula → IdLogin → email, valida
// el OTP server-side y, si es válido, emite un resetToken opaco ligado al IdLogin. Una matrícula
// inexistente produce la MISMA respuesta que un OTP inválido (INVALID_OTP), sin enumeración.
export const postVerifyOtp = async (req, res) => {
    try {
        const matricula = String(req.body?.matricula ?? '').trim();
        const otp = String(req.body?.otp ?? '').trim();
        if (!matricula || !otp) {
            return res.status(400).json({ message: 'matricula y otp son obligatorios', code: 'MISSING_FIELDS' });
        }

        const user = await findUserByMatricula(matricula);
        if (!user || user.StatusActividad !== 1) {
            return res.status(400).json({ message: 'OTP invalido o expirado', code: 'INVALID_OTP' });
        }

        let email;
        try {
            email = await ulv.getInstitutionalEmail(matricula);
        } catch (error) {
            if (esErrorDeInfra(error)) return res.status(httpDeInfra(error.code)).json({ message: 'Servicio no disponible', code: error.code });
            throw error;
        }
        if (!email) {
            return res.status(400).json({ message: 'OTP invalido o expirado', code: 'INVALID_OTP' });
        }

        let valido = false;
        try {
            valido = await otpProvider.verifyOtp(email, otp);
        } catch (error) {
            if (esErrorDeInfra(error)) return res.status(httpDeInfra(error.code)).json({ message: 'Servicio no disponible', code: error.code });
            throw error;
        }
        if (!valido) {
            return res.status(400).json({ message: 'OTP invalido o expirado', code: 'INVALID_OTP' });
        }

        const resetToken = crypto.randomBytes(32).toString('hex');
        await createResetToken({
            idLogin: user.IdLogin, // el resetToken queda ligado al IdLogin resuelto server-side
            tokenHash: sha256(resetToken),
            expiraEn: new Date(Date.now() + RESET_TTL_MS)
        });
        return res.json({ resetToken });
    } catch (error) {
        console.error('Error en /password/verify-otp');
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
