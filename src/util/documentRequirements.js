// Task 7.3 D1-A.2 - Regla CANÓNICA de documentos requeridos por alumno (extraída del Flutter D1-B).
// Fuente de verdad server-side. El backend resuelve nivel+sexo desde atributos AUTORITATIVOS de DB
// (Sexo en LoginUniPass; NivelDormitorio en Bedroom via LoginUniPass.Dormitorio), NUNCA del cliente.
//
// Reglamento requerido según (NivelAcademico, Sexo):
//   UNIVERSITARIO + M -> IdDocumento 1        (Bedroom.NivelDormitorio 'UNIVERSITARIO')
//   Bachiller     + M -> IdDocumento 2        (Bedroom.NivelDormitorio 'NIVEL MEDIO' == "Bachiller")
//   UNIVERSITARIO + F -> IdDocumento 3
//   Bachiller     + F -> IdDocumento 4
// Otros valores -> no resoluble (sin fallback).
//
// Además del reglamento, TODO alumno requiere: 5 = Convenio de salidas, 7 = INE del Tutor.
// 6 = Imagen Perfil NO forma parte de la completitud.

// Nivel DB -> clave de matriz. 'NIVEL MEDIO' es el "Bachiller" de la regla de Flutter.
const NIVEL_A_CLAVE = Object.freeze({ 'UNIVERSITARIO': 'UNIVERSITARIO', 'NIVEL MEDIO': 'BACHILLER' });

const REGLAMENTO_POR_NIVEL_SEXO = Object.freeze({
    'UNIVERSITARIO|M': 1, 'BACHILLER|M': 2, 'UNIVERSITARIO|F': 3, 'BACHILLER|F': 4
});

// Documentos comunes requeridos para todos los alumnos (además del reglamento específico).
export const DOCUMENTOS_COMUNES_REQUERIDOS = Object.freeze([5, 7]);

// Resuelve el IdDocumento de reglamento a partir de (nivelDormitorio DB, sexo). null si no resoluble.
export const reglamentoIdDocumento = (nivelDormitorio, sexo) => {
    const claveNivel = NIVEL_A_CLAVE[String(nivelDormitorio ?? '').trim().toUpperCase()];
    const s = String(sexo ?? '').trim().toUpperCase();
    if (!claveNivel || (s !== 'M' && s !== 'F')) return null;
    return REGLAMENTO_POR_NIVEL_SEXO[`${claveNivel}|${s}`] ?? null;
};

// Conjunto requerido de un alumno: [reglamentoEspecifico, 5, 7]. null si el reglamento no es resoluble.
export const resolveRequiredDocumentIds = ({ nivelDormitorio, sexo }) => {
    const reglamento = reglamentoIdDocumento(nivelDormitorio, sexo);
    if (!reglamento) return null;
    return [reglamento, ...DOCUMENTOS_COMUNES_REQUERIDOS];
};
