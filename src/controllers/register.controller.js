import crypto from 'crypto';
import { hashData } from '../util/hashData.js';
import { validatePassword } from '../util/passwordPolicy.js';
import { findUserByMatricula } from '../repositories/user.repo.js';
import {
    createRegistrationToken,
    findRegistrationByTokenHash,
    consumeTokenAndCreateUserTx
} from '../repositories/registrationToken.repo.js';
import { resolveTipoUser, resolveDormitorio } from '../services/registration.service.js';
import * as ulv from '../services/ulvApiService.js';
import { UlvApiError } from '../services/ulvApiService.js';
import * as otpProvider from '../services/otpProviderService.js';
import { OtpProviderError } from '../services/otpProviderService.js';

// Autoregistro PUBLICO y SEGURO. La identidad se prueba con OTP al correo institucional
// (server-side) -> registrationToken -> alta con datos derivados de ULV. Ver
// docs/security/register-security-contract.md. Flutter solo aporta matrícula, OTP y contraseña.

const RESET_TTL_MS = 10 * 60 * 1000; // 10 min
const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');
const httpDeInfra = (code) => (String(code).endsWith('TIMEOUT') ? 504 : 502);
const esErrorDeInfra = (e) => e instanceof OtpProviderError || e instanceof UlvApiError;

// Rate-limit simple en memoria por matrícula para verify-otp (delegado además al proveedor).
const intentos = new Map(); // matricula -> { count, resetAt }
const MAX_INTENTOS = 5, VENTANA_MS = 10 * 60 * 1000;
const bump = (mat) => {
    const now = Date.now();
    const e = intentos.get(mat);
    if (!e || e.resetAt < now) { intentos.set(mat, { count: 1, resetAt: now + VENTANA_MS }); return 1; }
    e.count += 1; return e.count;
};
const reset = (mat) => intentos.delete(mat);

// POST /register/otp { matricula } -> 200 genérico. Solo envía OTP si la matrícula existe en
// ULV, tiene correo institucional y NO está ya registrada (anti-enumeración: misma respuesta).
export const requestRegistrationOtp = async (req, res) => {
    try {
        const matricula = String(req.body?.matricula ?? '').trim();
        if (!matricula) return res.status(400).json({ message: 'matricula es obligatoria', code: 'MISSING_FIELDS' });

        const persona = await ulv.getPersonData(matricula); // UlvApiError si cae
        const yaExiste = await findUserByMatricula(matricula);
        if (persona && persona.correo && !yaExiste) {
            await otpProvider.sendVerificationOtp(persona.correo); // OtpProviderError si cae
        }
        return res.json({ message: 'Si la matricula es valida, se envio un codigo a tu correo institucional.' });
    } catch (error) {
        if (esErrorDeInfra(error)) return res.status(httpDeInfra(error.code)).json({ message: 'Servicio no disponible', code: error.code });
        console.error('Error en /register/otp:', error);
        return res.status(500).json({ message: 'Error solicitando OTP', code: 'SERVER_ERROR' });
    }
};

// POST /register/verify-otp { matricula, otp } -> valida OTP server-side -> registrationToken.
export const verifyRegistrationOtp = async (req, res) => {
    try {
        const matricula = String(req.body?.matricula ?? '').trim();
        const otp = String(req.body?.otp ?? '').trim();
        if (!matricula || !otp) return res.status(400).json({ message: 'matricula y otp son obligatorios', code: 'MISSING_FIELDS' });

        if (bump(matricula) > MAX_INTENTOS) {
            return res.status(429).json({ message: 'Demasiados intentos, intenta mas tarde', code: 'TOO_MANY_ATTEMPTS' });
        }

        let persona;
        try {
            persona = await ulv.getPersonData(matricula);
        } catch (error) {
            if (esErrorDeInfra(error)) return res.status(httpDeInfra(error.code)).json({ message: 'Servicio no disponible', code: error.code });
            throw error;
        }
        if (!persona || !persona.correo) {
            return res.status(400).json({ message: 'OTP invalido o expirado', code: 'INVALID_OTP' });
        }

        let valido = false;
        try {
            valido = await otpProvider.verifyOtp(persona.correo, otp);
        } catch (error) {
            if (esErrorDeInfra(error)) return res.status(httpDeInfra(error.code)).json({ message: 'Servicio no disponible', code: error.code });
            throw error;
        }
        if (!valido) return res.status(400).json({ message: 'OTP invalido o expirado', code: 'INVALID_OTP' });

        reset(matricula);
        const registrationToken = crypto.randomBytes(32).toString('hex');
        await createRegistrationToken({
            matricula, correo: persona.correo, tokenHash: sha256(registrationToken),
            expiraEn: new Date(Date.now() + RESET_TTL_MS)
        });
        return res.json({ registrationToken });
    } catch (error) {
        console.error('Error en /register/verify-otp:', error);
        return res.status(500).json({ message: 'Error verificando el codigo', code: 'SERVER_ERROR' });
    }
};

// POST /register { Matricula, Contraseña, registrationToken } -> alta con datos de ULV.
export const newUser = async (req, res) => {
    try {
        const { Matricula, Contraseña, registrationToken } = req.body || {};
        const matricula = String(Matricula ?? '').trim();
        if (!matricula || !Contraseña || !registrationToken) {
            return res.status(400).json({ message: 'Matricula, Contraseña y registrationToken son obligatorios', code: 'MISSING_FIELDS' });
        }

        // 1) registrationToken válido, no usado, no expirado, de esta matrícula.
        const rec = await findRegistrationByTokenHash(sha256(registrationToken));
        if (!rec) return res.status(400).json({ message: 'Token de registro invalido', code: 'REGISTRATION_TOKEN_INVALID' });
        if (rec.UsadoEn) return res.status(400).json({ message: 'Token de registro ya utilizado', code: 'REGISTRATION_TOKEN_USED' });
        if (new Date(rec.ExpiraEn) < new Date()) return res.status(400).json({ message: 'Token de registro expirado', code: 'REGISTRATION_TOKEN_EXPIRED' });
        if (String(rec.Matricula) !== matricula) return res.status(400).json({ message: 'Token de registro no corresponde a la matricula', code: 'REGISTRATION_TOKEN_MISMATCH' });

        // 2) Política de contraseña.
        const pol = validatePassword(Contraseña);
        if (!pol.ok) return res.status(400).json({ message: pol.message, code: 'WEAK_PASSWORD' });

        // 3) Unicidad.
        if (await findUserByMatricula(matricula)) {
            return res.status(409).json({ message: 'La cuenta ya esta registrada', code: 'USER_ALREADY_EXISTS' });
        }

        // 4) Datos institucionales AUTORITATIVOS desde ULV (nunca del body).
        let persona;
        try {
            persona = await ulv.getPersonData(matricula);
        } catch (error) {
            if (esErrorDeInfra(error)) return res.status(httpDeInfra(error.code)).json({ message: 'Servicio no disponible', code: error.code });
            throw error;
        }
        const tipoUser = resolveTipoUser(persona);
        if (!persona || !persona.correo || !tipoUser) {
            return res.status(409).json({ message: 'No se pudo validar la identidad institucional', code: 'STUDENT_NOT_FOUND' });
        }
        const dormitorio = await resolveDormitorio(persona);

        // 5) Alta transaccional (consume token + inserta). NUNCA otorga capabilities.
        const hashedPassword = await hashData(Contraseña);
        const result = await consumeTokenAndCreateUserTx({
            tokenId: rec.Id,
            user: {
                matricula, hashedPassword, correo: persona.correo,
                nombre: persona.nombre, apellidos: persona.apellidos, tipoUser,
                sexo: persona.sexo || '', fechaNacimiento: persona.fechaNacimiento ? new Date(persona.fechaNacimiento) : new Date(0),
                celular: persona.celular || '', dormitorio
            }
        });
        if (result.conflict === 'USED') {
            return res.status(400).json({ message: 'Token de registro ya utilizado', code: 'REGISTRATION_TOKEN_USED' });
        }

        // 6) Respuesta saneada: sin hash, sin TokenCFM, sin tokens.
        return res.status(201).json({
            IdLogin: result.idLogin, Matricula: matricula, Correo: persona.correo,
            Nombre: persona.nombre, Apellidos: persona.apellidos, TipoUser: tipoUser,
            Sexo: persona.sexo, FechaNacimiento: persona.fechaNacimiento, Celular: persona.celular,
            StatusActividad: 1, Dormitorio: dormitorio
        });
    } catch (error) {
        console.error('Error en /register:', error);
        return res.status(500).json({ message: 'Error al registrar', code: 'SERVER_ERROR' });
    }
};
