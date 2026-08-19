// Task 7.1.B - Política de contraseña AUTORITATIVA del backend (única fuente de verdad),
// compartida por PUT /me/password y POST /password/reset.
// Regla vigente: mínimo 8 caracteres, al menos 1 letra, al menos 1 número.
// (No se exige aún mayúscula ni símbolo; endurecer es un cambio coordinado con Flutter.)
// Devuelve { ok:true } o { ok:false, code:'WEAK_PASSWORD', message }.
export const validatePassword = (pw) => {
    const s = String(pw ?? '');
    if (s.length < 8) {
        return { ok: false, code: 'WEAK_PASSWORD', message: 'La contraseña debe tener al menos 8 caracteres' };
    }
    if (!/[A-Za-z]/.test(s)) {
        return { ok: false, code: 'WEAK_PASSWORD', message: 'La contraseña debe incluir al menos una letra' };
    }
    if (!/[0-9]/.test(s)) {
        return { ok: false, code: 'WEAK_PASSWORD', message: 'La contraseña debe incluir al menos un número' };
    }
    return { ok: true };
};
