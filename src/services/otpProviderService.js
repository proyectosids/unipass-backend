// Task 7.1.B - Abstracción server-side del proveedor OTP externo (recuperación de
// contraseña). Centraliza TODAS las llamadas HTTP al proveedor. Secretos SOLO desde env
// (OTP_URL, OTP_EMAIL, OTP_PASSWORD); nunca se loguean completos ni se devuelven a Flutter.
// Errores de transporte normalizados: OtpProviderError { OTP_PROVIDER_UNAVAILABLE | OTP_PROVIDER_TIMEOUT }.
//
// Contrato del proveedor: docs/otp-service-contract.md.

export class OtpProviderError extends Error {
    constructor(code) { super(code); this.code = code; }
}

const cfg = () => ({
    url: process.env.OTP_URL,
    email: process.env.OTP_EMAIL,
    password: process.env.OTP_PASSWORD,
    timeout: parseInt(process.env.OTP_TIMEOUT_MS || '8000', 10)
});

// Cache del x-access-token del proveedor (vive SOLO en backend).
let cachedToken = null;

const postJson = async (path, body, { token } = {}) => {
    const { url, timeout } = cfg();
    if (!url) throw new OtpProviderError('OTP_PROVIDER_UNAVAILABLE');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
        const res = await fetch(`${url}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(token ? { 'x-access-token': token } : {}) },
            body: JSON.stringify(body),
            signal: controller.signal
        });
        let json = null;
        try { json = await res.json(); } catch { /* body no-JSON */ }
        return { status: res.status, json };
    } catch (err) {
        throw new OtpProviderError(err.name === 'AbortError' ? 'OTP_PROVIDER_TIMEOUT' : 'OTP_PROVIDER_UNAVAILABLE');
    } finally {
        clearTimeout(timer);
    }
};

// Paso 1: token de servicio del proveedor. Se cachea; con force=true se renueva.
export const authenticate = async (force = false) => {
    const { email, password } = cfg();
    if (!email || !password) throw new OtpProviderError('OTP_PROVIDER_UNAVAILABLE'); // credenciales ausentes
    if (cachedToken && !force) return cachedToken;
    const { status, json } = await postJson('/api/v1/user/login', { email, password });
    if (status !== 200 || !json?.token) throw new OtpProviderError('OTP_PROVIDER_UNAVAILABLE');
    cachedToken = json.token;
    return cachedToken;
};

// Ejecuta una llamada autenticada; si el proveedor responde 401 (token expirado),
// renueva el token UNA vez y reintenta.
const withAuth = async (fn) => {
    let token = await authenticate();
    let res = await fn(token);
    if (res.status === 401) {
        token = await authenticate(true);
        res = await fn(token);
    }
    return res;
};

// Paso 4: enviar OTP de RECUPERACIÓN. POST /api/v1/forgot_password_app/ (x-access-token).
export const sendRecoveryOtp = async (email) => {
    const res = await withAuth((token) => postJson('/api/v1/forgot_password_app/', { email }, { token }));
    if (res.status !== 200) throw new OtpProviderError('OTP_PROVIDER_UNAVAILABLE');
    return true;
};

// Verificación server-side del OTP. Contrato: POST /api/v1/email_verification/verifyOTP
// (sin x-access-token). 200 => válido; no-200 => inválido (no lanza).
// ⚠️ RIESGO (docs/otp-service-contract.md): este endpoint está documentado para el OTP de
// ALTA DE CUENTA; falta confirmar en el smoke que valide OTPs de RECUPERACIÓN. Si no, hay
// que reportarlo (no adoptar /forgot_password_app/reset sin autorización — ver §7 del prompt).
export const verifyOtp = async (email, otp) => {
    const res = await postJson('/api/v1/email_verification/verifyOTP', { email, otp });
    return res.status === 200;
};

// Solo para tests: limpia el cache del token.
export const _clearTokenCache = () => { cachedToken = null; };
