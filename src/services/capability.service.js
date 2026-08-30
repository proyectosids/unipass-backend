import { findActiveGrantsByLogin } from '../repositories/capabilityGrant.repo.js';
import { resolvePermissions, SCOPES } from '../security/permissions.js';

// Servicio de capabilities/permisos/scope. El resto del código usa ESTAS funciones y no
// depende del nombre físico de la tabla (CapabilityGrant). Ver docs/security/authorization-model.md.
//
// Fuente de capabilities de un usuario:
//   1) grants vigentes en CapabilityGrant (CHECKER/SUPERVISOR/ADMIN/SUPERADMIN) con su scope.
//   2) PUENTE TRANSITORIO: TipoUser='ADMINISTRATIVO' -> capability ADMIN, scope GLOBAL.
//      (coordinador de dormitorios; a DESACOPLAR: otorgar ADMIN explícito y retirar este puente).

// Devuelve [{ capability, scopeType, scopeId }] efectivos del usuario.
export const getGrantsForUser = async (user) => {
    const grants = (await findActiveGrantsByLogin(user.id)).map((g) => ({
        capability: g.Capability, scopeType: g.ScopeType, scopeId: g.ScopeId ?? null
    }));
    // Puente transitorio ADMINISTRATIVO -> ADMIN (GLOBAL) si no tiene ya un ADMIN grant.
    if (user.tipo === 'ADMINISTRATIVO' && !grants.some((g) => g.capability === 'ADMIN')) {
        grants.push({ capability: 'ADMIN', scopeType: SCOPES.GLOBAL, scopeId: null });
    }
    return grants;
};

// Set<string> de nombres de capability.
export const getCapabilitiesForUser = async (user) =>
    new Set((await getGrantsForUser(user)).map((g) => g.capability));

export const hasCapability = async (user, capability) =>
    (await getCapabilitiesForUser(user)).has(capability);

// [{ capability, type, id }] — scopes del usuario.
export const getScopesForUser = async (user) =>
    (await getGrantsForUser(user)).map((g) => ({ capability: g.capability, type: g.scopeType, id: g.scopeId }));

// Set<string> de permisos efectivos (unión de los permisos de sus capabilities).
export const getPermissionsForUser = async (user) =>
    resolvePermissions([...(await getCapabilitiesForUser(user))]);

// ¿Alguno de los scopes del actor cubre el recurso?
//   resource = { type:'GLOBAL' } | { type:'DORMITORIO', id } | { type:'SELF', ownerId }
// Reglas: GLOBAL cubre todo; DORMITORIO cubre su mismo IdDormitorio; SELF cubre al propio actor.
export const scopeCovers = (actorScopes, resource, user) => {
    if (actorScopes.some((s) => s.type === SCOPES.GLOBAL)) return true;
    if (!resource) return false;
    if (resource.type === SCOPES.GLOBAL) return false; // requiere GLOBAL y no lo tiene
    if (resource.type === SCOPES.DORMITORIO) {
        return actorScopes.some((s) => s.type === SCOPES.DORMITORIO && Number(s.id) === Number(resource.id));
    }
    if (resource.type === SCOPES.SELF) {
        return Number(resource.ownerId) === Number(user?.id);
    }
    return false;
};
