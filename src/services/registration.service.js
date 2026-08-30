import { findBedroomBySexoYNivel } from '../repositories/bedroom.repo.js';
import * as ulv from './ulvApiService.js';

// Reglas de dominio del autoregistro (server-side). Ver docs/security/register-security-contract.md.
// Todo lo institucional se deriva de ULV; el body NUNCA es autoritativo.

// Normaliza un correo para comparaciones estables (trim + minúsculas).
export const normalizeEmail = (e) => String(e ?? '').trim().toLowerCase();

// ¿El empleado es el PRECEPTOR de su departamento? /api/datos/prece/:noDepto devuelve
// { "ID JEFE": <matrícula del preceptor> }. Es preceptor si esa matrícula es la suya.
const esPreceptor = async (persona) => {
    if (!persona?.idDepartamento) return false;
    const prece = await ulv.getPreceptor(persona.idDepartamento); // UlvApiError si cae transporte
    const jefe = prece && (prece['ID JEFE'] ?? prece.ID_JEFE ?? prece.idJefe);
    return jefe != null && String(jefe).trim() === String(persona.matricula).trim();
};

// ¿El empleado es VIGILANCIA? Se confirma con /api/datos/vigilancia/:idEmpleado (idEmpleado == su
// matrícula): ULV devuelve el depto de seguridad con EmpMatricula SOLO si la persona es el
// JEFE/RESPONSABLE. Es vigilancia si EmpMatricula coincide con su matrícula. Pertenecer a
// 'SEGURIDAD INSTITUCIONAL' NO basta. Un fallo de transporte propaga UlvApiError (fail-closed:
// nunca eleva en silencio). Ver register-security-contract.md § VIGILANCIA.
const esVigilancia = async (persona) => {
    if (!persona?.matricula) return false;
    const v = await ulv.getJefeVigilancia(persona.matricula); // UlvApiError si cae transporte
    const emp = v && (v.EmpMatricula ?? v.empMatricula);
    return emp != null && String(emp).trim() === String(persona.matricula).trim();
};

// TipoUser AUTORITATIVO server-side desde ULV. Flutter no decide este valor.
//   ALUMNO   -> ALUMNO
//   EMPLEADO -> se resuelve su función institucional con endpoints específicos de ULV.
//               Precedencia: VIGILANCIA -> PRECEPTOR -> EMPLEADO.
//               (Si en el futuro ULV distinguiera solapamientos vigilancia/preceptor, esta
//                precedencia es la regla; se documenta en register-security-contract.md.)
// ADMINISTRATIVO (coordinador de dormitorio) NO se auto-asigna en el registro: no es un dato de
// ULV (es cuenta interna resuelta por findCoordinadorActivo) y concede la capability ADMIN vía el
// puente ADMINISTRATIVO->ADMIN, por lo que se provisiona de forma controlada/manual.
export const resolveTipoUser = async (persona) => {
    if (persona?.type === 'ALUMNO') return 'ALUMNO';
    if (persona?.type !== 'EMPLEADO') return null;
    if (await esVigilancia(persona)) return 'VIGILANCIA';
    if (await esPreceptor(persona)) return 'PRECEPTOR';
    return 'EMPLEADO';
};

// Dormitorio server-side: ALUMNO interno -> Bedroom por sexo+nivel; si no, NULL. El body se ignora.
export const resolveDormitorio = async (persona) => {
    if (persona?.type !== 'ALUMNO') return null;
    if (String(persona.residencia || '').toUpperCase() !== 'INTERNO') return null;
    if (!persona.sexo || !persona.nivelEducativo) return null;
    const bedroom = await findBedroomBySexoYNivel(persona.sexo, persona.nivelEducativo);
    return bedroom?.IdBedroom ?? null;
};
