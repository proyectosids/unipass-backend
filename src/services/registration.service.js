import { findBedroomBySexoYNivel } from '../repositories/bedroom.repo.js';

// Reglas de dominio del autoregistro (server-side). Ver docs/security/register-security-contract.md.

// TipoUser AUTORITATIVO desde ULV. type=ALUMNO->ALUMNO, type=EMPLEADO->EMPLEADO.
// Los subtipos elevados (PRECEPTOR/VIGILANCIA/ADMINISTRATIVO) NO se autoasignan en el registro
// (ULV no los distingue de forma fiable): se provisionan de forma controlada. Nunca se toma del body.
export const resolveTipoUser = (persona) => {
    if (persona?.type === 'ALUMNO') return 'ALUMNO';
    if (persona?.type === 'EMPLEADO') return 'EMPLEADO';
    return null; // type desconocido -> el controlador rechaza
};

// Dormitorio server-side: ALUMNO interno -> Bedroom por sexo+nivel; si no, NULL. El body se ignora.
export const resolveDormitorio = async (persona) => {
    if (persona?.type !== 'ALUMNO') return null;
    if (String(persona.residencia || '').toUpperCase() !== 'INTERNO') return null;
    if (!persona.sexo || !persona.nivelEducativo) return null;
    const bedroom = await findBedroomBySexoYNivel(persona.sexo, persona.nivelEducativo);
    return bedroom?.IdBedroom ?? null;
};
