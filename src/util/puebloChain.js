// Task 7.4A - Resolución de la cadena de autorización de Salida Pueblo (Tipo 1).
// Función PURA (deps inyectadas) → testeable sin BD ni HTTP.
//
// Regla aprobada:  Jefe de trabajo (orden 1) → Preceptor (orden 2).
//   - Jefe VIGENTE = JefeDepto(work.ID DEPTO).EmpMatricula. work.ID JEFE = solo cross-check.
//   - Preceptor = prece(Bedroom.Identificador)."ID JEFE".
//   - Dedupe por MATRÍCULA institucional normalizada: si jefe == preceptor → 1 solo eslabón.
//   - Cada matrícula institucional debe tener cuenta UniPass activa → si no, AUTHORIZER_NOT_REGISTERED.

export class ChainError extends Error {
    constructor(code) { super(code); this.code = code; }
}

const norm = (v) => (v === null || v === undefined ? null : String(v).trim());

export async function resolvePuebloChain(deps, { matricula, identificador }) {
    const { getStudentData, getDepartmentHead, getPreceptor, resolveLocalUser, onMismatch } = deps;

    // 1) Jefe de trabajo (vigente) desde el departamento de trabajo del alumno.
    const student = await getStudentData(matricula); // puede lanzar UlvApiError (STUDENT_NOT_FOUND / ULV_API_*)
    const work = student?.work || [];
    const idDepto = work.length ? work[0]['ID DEPTO'] : null;
    if (idDepto === null || idDepto === undefined) throw new ChainError('STUDENT_WORK_NOT_FOUND');

    const head = await getDepartmentHead(idDepto);
    const jefeMatricula = head ? norm(head.EmpMatricula) : null;
    if (!jefeMatricula) throw new ChainError('DEPARTMENT_HEAD_NOT_FOUND');

    const workJefe = norm(work[0]['ID JEFE']);
    if (workJefe && workJefe !== jefeMatricula && typeof onMismatch === 'function') {
        onMismatch({ matricula: norm(matricula), idDepto, workIdJefe: workJefe, jefeVigente: jefeMatricula });
    }

    // 2) Preceptor del dormitorio.
    const prece = await getPreceptor(identificador);
    const preceptorMatricula = prece ? norm(prece['ID JEFE']) : null;
    if (!preceptorMatricula) throw new ChainError('PRECEPTOR_NOT_FOUND');

    // 3) Orden Jefe→Preceptor + dedupe por matrícula.
    const base = jefeMatricula === preceptorMatricula
        ? [{ matricula: jefeMatricula, rol: 'Jefe de trabajo', noDepto: Number(idDepto) }]
        : [
            { matricula: jefeMatricula, rol: 'Jefe de trabajo', noDepto: Number(idDepto) },
            { matricula: preceptorMatricula, rol: 'Preceptor', noDepto: Number(identificador) }
        ];

    // 4) Conversión matrícula institucional → usuario UniPass (activo). Sin cuenta → error, sin fallback.
    const authorizers = [];
    let orden = 1;
    for (const item of base) {
        const user = await resolveLocalUser(item.matricula);
        if (!user) throw new ChainError('AUTHORIZER_NOT_REGISTERED');
        authorizers.push({
            orden: orden++,
            matricula: item.matricula,
            idEmpleado: Number(item.matricula),
            idLogin: user.IdLogin,
            noDepto: Number.isFinite(item.noDepto) ? item.noDepto : null,
            rol: item.rol
        });
    }
    if (!authorizers.length) throw new ChainError('AUTHORIZATION_CHAIN_INCOMPLETE');
    return authorizers;
}
