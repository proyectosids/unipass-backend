import { findTokenFCMByMatricula } from '../repositories/user.repo.js';

// Task 7.4A - Push FCM server-side. Encapsula el envío al servicio Firebase existente
// (POST {FIREBASE_NOTIFICATION_URL}/send { token, title, body }). El token se resuelve
// EN EL BACKEND desde la matrícula (no se confía en un token enviado por Flutter).
//
// Best-effort por diseño: NUNCA lanza por falta de token o fallo de red; devuelve un
// objeto-resultado. La ausencia de token NO es AUTHORIZER_NOT_REGISTERED (problema distinto):
// la Permission/Authorize ya creadas siguen válidas.

const URL_BASE = () => process.env.FIREBASE_NOTIFICATION_URL;
const TIMEOUT = () => parseInt(process.env.FIREBASE_NOTIFICATION_TIMEOUT_MS || '5000', 10);

export const sendToEmployee = async ({ matricula, title, body }) => {
    const base = URL_BASE();
    if (!base) {
        console.warn('[Notif] FIREBASE_NOTIFICATION_URL no configurada; se omite push');
        return { skipped: 'NOT_CONFIGURED' };
    }

    // Token del dispositivo del empleado, resuelto server-side (incluye cobertura/suplencia).
    let token = null;
    try {
        const rows = await findTokenFCMByMatricula(matricula);
        token = rows?.[0]?.TokenCFM || null;
    } catch (err) {
        console.error(`[Notif] Error resolviendo TokenCFM de ${matricula}:`, err.message);
    }
    if (!token) {
        console.warn(`[Notif] Empleado ${matricula} sin TokenCFM registrado; se omite push (Permission sigue válida)`);
        return { skipped: 'NO_TOKEN' };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT());
    try {
        const res = await fetch(`${base}/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, title, body }),
            signal: controller.signal
        });
        if (!res.ok) {
            console.error(`[Notif] Push fallo (status ${res.status}) para ${matricula}`);
            return { success: false, status: res.status };
        }
        return { success: true };
    } catch (err) {
        console.error(`[Notif] Excepción enviando push a ${matricula}:`, err.message);
        return { success: false, error: err.message };
    } finally {
        clearTimeout(timer);
    }
};
