import { insertAuditLog } from '../repositories/audit.repo.js';

// Auditoría de acciones administrativas sensibles. Best-effort: un fallo al auditar NO
// tumba la operación (se loguea). NUNCA persiste secretos: se filtran defensivamente.
const CAMPOS_PROHIBIDOS = new Set([
    'contraseña', 'contrasena', 'password', 'newpassword', 'hash',
    'accesstoken', 'refreshtoken', 'token', 'tokencfm', 'otp', 'resettoken', 'x-access-token'
]);

const sanitize = (obj) => {
    if (obj == null || typeof obj !== 'object') return obj;
    const out = Array.isArray(obj) ? [] : {};
    for (const [k, v] of Object.entries(obj)) {
        if (CAMPOS_PROHIBIDOS.has(String(k).toLowerCase())) continue; // se omite el secreto
        out[k] = (v && typeof v === 'object') ? sanitize(v) : v;
    }
    return out;
};
const toJson = (v) => (v == null ? null : JSON.stringify(sanitize(v)));

// Registra una acción. `req` opcional para derivar actor/ip/endpoint del token (no del body).
export const logAudit = async ({ req, actor, capability, permission, accion, recurso, recursoId, resultado = 'SUCCESS', antes, despues, contexto }) => {
    try {
        const u = actor || req?.user || {};
        await insertAuditLog({
            actorIdLogin: u.id ?? null,
            actorMatricula: u.matricula ?? null,
            capability, permission, accion, recurso, recursoId, resultado,
            datosAntes: toJson(antes),
            datosDespues: toJson(despues),
            ip: req?.ip || req?.headers?.['x-forwarded-for'] || null,
            endpoint: req?.originalUrl || null,
            metodo: req?.method || null,
            contexto: contexto ?? null
        });
    } catch (err) {
        console.error('[Audit] No se pudo registrar la accion (operacion no afectada):', err.message);
    }
};

export const _sanitizeForTest = sanitize;
