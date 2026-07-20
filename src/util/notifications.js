// Push FCM delegado a un microservicio externo (POST {PUSH_API_URL}/send). Si FCM
// reporta token invalido/no registrado, se limpia TokenCFM del usuario en BD.
// Sin PUSH_API_URL configurada, el envio se omite con warning (no truena).
import { clearTokenFCMByMatricula } from '../repositories/user.repo.js';

const PUSH_API_URL = process.env.PUSH_API_URL;
const PUSH_TIMEOUT_MS = parseInt(process.env.PUSH_TIMEOUT_MS || '5000', 10);

const INVALID_TOKEN_CODES = new Set([
    'messaging/registration-token-not-registered',
    'messaging/invalid-registration-token'
]);

const sendPush = async ({ token, title, body, data }) => {
    if (!PUSH_API_URL) {
        console.warn('[FCM] PUSH_API_URL no configurada, se omite envio');
        return { skipped: true };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PUSH_TIMEOUT_MS);

    try {
        const res = await fetch(`${PUSH_API_URL}/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, title, body, data }),
            signal: controller.signal
        });

        const json = await res.json().catch(() => ({}));

        if (!res.ok) {
            return { success: false, status: res.status, code: json.code, error: json.error };
        }

        return { success: true, messageId: json.messageId };
    } finally {
        clearTimeout(timer);
    }
};

export const notifyDocumentRejection = async ({ tokenFCM, tipoDocumento, motivo, matricula }) => {
    if (!tokenFCM) {
        console.warn(`[FCM] No se notifico: TokenFCM ausente para matricula=${matricula}`);
        return { skipped: true };
    }

    try {
        const result = await sendPush({
            token: tokenFCM,
            title: 'Documento rechazado',
            body: `Tu ${tipoDocumento} fue rechazado: ${motivo}`,
            data: {
                tipo: 'documento_rechazado',
                documento: String(tipoDocumento ?? ''),
                matricula: String(matricula ?? '')
            }
        });

        if (result.success) {
            console.log(`[FCM] Push enviado a matricula=${matricula} messageId=${result.messageId}`);
            return result;
        }

        if (result.code && INVALID_TOKEN_CODES.has(result.code)) {
            console.warn(`[FCM] Token invalido para matricula=${matricula} (${result.code}), limpiando TokenCFM`);
            try {
                await clearTokenFCMByMatricula(matricula);
            } catch (cleanupError) {
                console.error(`[FCM] Error limpiando TokenCFM de ${matricula}:`, cleanupError.message);
            }
        } else {
            console.error(`[FCM] Push fallo para matricula=${matricula}: ${result.error || result.status}`);
        }

        return result;
    } catch (err) {
        console.error(`[FCM] Excepcion notificando a matricula=${matricula}:`, err.message);
        return { success: false, error: err.message };
    }
};
