// Task 7.4A - Abstracción de API-ULV (fuente institucional de la cadena de autorización).
// Centraliza las llamadas HTTP; base URL desde env (ULV_API_URL). NO hardcodear hosts.
// Errores de transporte -> UlvApiError con code normalizado. "No encontrado"
// (200+null o 500 por dato inválido) -> null, y el llamador decide el code de dominio.

const BASE = () => process.env.ULV_API_URL;
const TIMEOUT = () => parseInt(process.env.ULV_API_TIMEOUT_MS || '8000', 10);

export class UlvApiError extends Error {
    constructor(code) { super(code); this.code = code; }
}

const getJson = async (path) => {
    const base = BASE();
    if (!base) throw new UlvApiError('ULV_API_UNAVAILABLE');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT());
    let res;
    try {
        res = await fetch(`${base}${path}`, { signal: controller.signal });
    } catch (err) {
        throw new UlvApiError(err.name === 'AbortError' ? 'ULV_API_TIMEOUT' : 'ULV_API_UNAVAILABLE');
    } finally {
        clearTimeout(timer);
    }
    // API-ULV usa 500 para "dato no válido" y 200+null para "no encontrado":
    // ambos se tratan como null (recurso ausente), no como caída del servicio.
    if (!res.ok) return null;
    return res.json().catch(() => null);
};

// Task 7.1.B: correo institucional AUTORITATIVO por matrícula (para recuperación).
// Fuente correcta (LoginUniPass.Correo puede estar stale/erróneo, sobre todo en empleados).
// Devuelve el email o null (no encontrado). Lanza UlvApiError en caída de transporte.
// Maneja las formas del proveedor: Data.student[] (CORREO_INSTITUCIONAL) / data.employee[]
// (EMAIl_INSTITUCIONAL, con el typo del proveedor).
export const getInstitutionalEmail = async (matricula) => {
    const raw = await getJson(`/api/datos/${encodeURIComponent(matricula)}`);
    if (!raw) return null;
    const D = raw.Data || raw.data || {};
    const s = (D.student || [])[0];
    const e = (D.employee || [])[0];
    const email = (s && s.CORREO_INSTITUCIONAL)
        || (e && (e.EMAIl_INSTITUCIONAL || e.EMAIL_INSTITUCIONAL || e.CORREO_INSTITUCIONAL))
        || null;
    return email ? String(email).trim() : null;
};

// Task registro: datos institucionales NORMALIZADOS de una persona (alumno o empleado)
// para el autoregistro. type=ALUMNO usa Data.student; type=EMPLEADO usa data.employee (con
// nombres de campo distintos). Devuelve null si no existe. Lanza UlvApiError si cae el transporte.
export const getPersonData = async (matricula) => {
    const raw = await getJson(`/api/datos/${encodeURIComponent(matricula)}`);
    if (!raw) return null;
    const D = raw.Data || raw.data || {};
    const type = D.type || null;
    if (type === 'ALUMNO') {
        const s = (D.student || [])[0];
        if (!s) return null;
        return {
            type: 'ALUMNO', matricula: String(s.MATRICULA ?? matricula),
            correo: s.CORREO_INSTITUCIONAL || null,
            nombre: s.NOMBRE || '', apellidos: s.APELLIDOS || '',
            sexo: s.SEXO || null, fechaNacimiento: s.FECHA_NACIMIENTO || null,
            celular: s.CELULAR || s.TEL_FIJO || null,
            residencia: s.RESIDENCIA || null, nivelEducativo: s.NIVEL_EDUCATIVO || null
        };
    }
    if (type === 'EMPLEADO') {
        const e = (D.employee || [])[0];
        if (!e) return null;
        return {
            type: 'EMPLEADO', matricula: String(e.MATRICULA ?? matricula),
            correo: e.EMAIl_INSTITUCIONAL || e.EMAIL_INSTITUCIONAL || e.CORREO_INSTITUCIONAL || null,
            nombre: e.NOMBRES || e.NOMBRE || '', apellidos: e.APELLIDOS || '',
            sexo: e.SEXO || null, fechaNacimiento: e.FECHA_NACIMIENTO || null,
            celular: e.CELULAR || null,
            departamento: e.DEPARTAMENTO || null, idDepartamento: e.ID_DEPARATAMENTO ?? null
        };
    }
    return null;
};

// GET /api/datos/:matricula -> { type, work[] } (work: [{ "ID DEPTO", "DEPARTAMENTO", "ID JEFE", ... }])
export const getStudentData = async (matricula) => {
    const data = await getJson(`/api/datos/${encodeURIComponent(matricula)}`);
    if (!data || !data.Data) throw new UlvApiError('STUDENT_NOT_FOUND');
    return { type: data.Data.type, work: data.Data.work || [] };
};

// GET /api/datos/prece/:identificador -> { "ID JEFE": <matrícula preceptor>, ... } | null
export const getPreceptor = (identificador) => getJson(`/api/datos/prece/${encodeURIComponent(identificador)}`);

// GET /api/datos/JefeDepto/:idDepto -> { EmpMatricula, ... } | null  (jefe VIGENTE del depto)
export const getDepartmentHead = (idDepto) => getJson(`/api/datos/JefeDepto/${encodeURIComponent(idDepto)}`);

// GET /api/datos/getjefe/:matricula -> { EmpMatricula } | null  (valida que sea jefe de depto)
export const validateDepartmentHead = (matricula) => getJson(`/api/datos/getjefe/${encodeURIComponent(matricula)}`);

// GET /api/datos/coordinador/:matricula -> { empMatricula, IdDepartamento } | null
// OJO: este es el COORDINADOR DE FACULTAD/CARRERA del alumno (dato institucional de
// API-ULV), destinado al flujo de FIN DE CURSO (Tipo 4). NO es el "coordinador de
// dormitorios" (ese es una cuenta ADMINISTRATIVO interna de UniPass, resuelta por el
// switch AUTORIZADOR_SALIDAS / findCoordinadorActivo, para salidas Especial(2)/A Casa(3)).
// Infra lista; Tipo 4 aun sin implementar (PENDING_FLOW_ANALYSIS_TYPE_4).
export const getStudentCoordinator = (matricula) => getJson(`/api/datos/coordinador/${encodeURIComponent(matricula)}`);
