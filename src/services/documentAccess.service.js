// Task 7.3 - Política ÚNICA de lectura documental (metadata y binario), server-authoritative.
// Reutilizada por la foto de perfil (D2-A) y por la entrega de archivos (D2-B2) para evitar dos políticas
// divergentes. La autoridad NUNCA proviene del cliente: dorm/scope/grant se resuelven en el servidor.
import { findUserById } from '../repositories/user.repo.js';
import { findActiveGrantByTipo } from '../repositories/checkerGrant.repo.js';

// IdDocumento de la FOTO DE PERFIL. Único tipo con política ampliada (admite CHECKER); el resto (reglamentos
// 1-4, convenio 5, INE Tutor 7) son privados y NO admiten CHECKER ni otros roles operativos.
export const PROFILE_PHOTO_DOC = 6;

// ¿Puede `actorId` leer `document` ({ IdLogin: dueño, IdDocumento })?
//  - SELF: el dueño lee cualquier documento propio (incluida la foto).
//  - PRECEPTOR del MISMO dormitorio: lee cualquier documento del alumno (privados y foto).
//  - CHECKER con grant vigente (Dormitorio del dorm, o Caseta global): SOLO la foto (IdDocumento=6).
//  - Cualquier otro (ALUMNO ajeno, EMPLEADO, VIGILANCIA sin grant, PRECEPTOR de otro dorm): denegado.
export const authorizeDocumentRead = async (actorId, document) => {
    const ownerId = Number(document.IdLogin);
    const idDocumento = Number(document.IdDocumento);

    if (ownerId === Number(actorId)) return true; // SELF (cualquier tipo de documento)

    const owner = await findUserById(ownerId);
    if (!owner || owner.TipoUser !== 'ALUMNO') return false; // solo documentos de alumnos son revisables

    const actor = await findUserById(actorId);
    if (!actor) return false;

    // PRECEPTOR del mismo dormitorio: acceso completo a los documentos del alumno.
    if (actor.TipoUser === 'PRECEPTOR') {
        return actor.Dormitorio != null && Number(actor.Dormitorio) === Number(owner.Dormitorio);
    }

    // A partir de aquí SOLO la foto de perfil admite CHECKER; los documentos privados no.
    if (idDocumento !== PROFILE_PHOTO_DOC) return false;

    // CHECKER: grant vigente Dormitorio (del dorm del alumno) o Caseta (global). Capability por DEFAULT='CHECKER'.
    const gDorm = owner.Dormitorio != null ? await findActiveGrantByTipo(actorId, 'Dormitorio', owner.Dormitorio) : null;
    if (gDorm && gDorm.Capability === 'CHECKER') return true;
    const gCaseta = await findActiveGrantByTipo(actorId, 'Caseta');
    if (gCaseta && gCaseta.Capability === 'CHECKER') return true;

    return false;
};
