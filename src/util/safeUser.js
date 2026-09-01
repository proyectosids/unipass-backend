// Proyección SEGURA de un usuario de LoginUniPass para respuestas HTTP (BOLA/IDOR R1).
// ALLOWLIST explícita: solo se serializan estos campos. NUNCA incluye secretos —
// Contraseña (hash), TokenCFM ni tokens— aunque el objeto de entrada los traiga. Si la tabla gana
// columnas nuevas, NO se exponen automáticamente (la lista es la única fuente de verdad).
export const SAFE_USER_FIELDS = Object.freeze([
    'IdLogin', 'Matricula', 'Correo', 'Nombre', 'Apellidos', 'TipoUser',
    'Sexo', 'FechaNacimiento', 'Celular', 'StatusActividad', 'Dormitorio',
    'IdCargoDelegado', 'Documentacion'
]);

// Campos que NUNCA deben salir por HTTP (defensa explícita + documentación).
export const SECRET_USER_FIELDS = Object.freeze(['Contraseña', 'TokenCFM']);

// Serializa un registro (o null) a la proyección segura (solo campos de la allowlist presentes).
export const toSafeUser = (row) => {
    if (!row || typeof row !== 'object') return row;
    const out = {};
    for (const k of SAFE_USER_FIELDS) if (k in row) out[k] = row[k];
    return out;
};
