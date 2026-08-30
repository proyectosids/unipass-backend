// Modelo de autorización (FASE C) — catálogo de permisos, scopes y mapping capability->permisos.
// Fuente de verdad ESTATICA (enum fijo del código). Ver docs/security/authorization-model.md.

// Permisos concretos (VIEW/MANAGE por módulo). NO se agregan APPROVE/REJECT aún (7.4B).
export const PERMISSIONS = Object.freeze({
    USERS_VIEW: 'USERS_VIEW', USERS_MANAGE: 'USERS_MANAGE',
    PERMISSIONS_VIEW: 'PERMISSIONS_VIEW', PERMISSIONS_MANAGE: 'PERMISSIONS_MANAGE',
    DOCUMENTS_VIEW: 'DOCUMENTS_VIEW', DOCUMENTS_MANAGE: 'DOCUMENTS_MANAGE',
    CHECKS_VIEW: 'CHECKS_VIEW', CHECKS_MANAGE: 'CHECKS_MANAGE',
    DASHBOARD_VIEW: 'DASHBOARD_VIEW',
    REPORTS_VIEW: 'REPORTS_VIEW',
    CAPABILITIES_VIEW: 'CAPABILITIES_VIEW', CAPABILITIES_MANAGE: 'CAPABILITIES_MANAGE',
    AUDIT_VIEW: 'AUDIT_VIEW',
    CONFIG_VIEW: 'CONFIG_VIEW', CONFIG_MANAGE: 'CONFIG_MANAGE'
});

export const SCOPES = Object.freeze({ SELF: 'SELF', DORMITORIO: 'DORMITORIO', GLOBAL: 'GLOBAL' });

export const CAPABILITIES = Object.freeze(['CHECKER', 'SUPERVISOR', 'ADMIN', 'SUPERADMIN']);

const P = PERMISSIONS;
const ALL_PERMISSIONS = Object.values(PERMISSIONS);

// Capability -> conjunto de permisos.
export const CAPABILITY_PERMISSIONS = Object.freeze({
    // Solo lectura; NUNCA MANAGE.
    SUPERVISOR: [P.USERS_VIEW, P.PERMISSIONS_VIEW, P.DOCUMENTS_VIEW, P.CHECKS_VIEW, P.DASHBOARD_VIEW, P.REPORTS_VIEW],
    // Checador: acotado por su scope (Tipo/dorm del grant).
    CHECKER: [P.CHECKS_VIEW, P.CHECKS_MANAGE],
    // Administración operativa. NO incluye CAPABILITIES_MANAGE / AUDIT_VIEW / CONFIG_MANAGE (SUPERADMIN-only).
    ADMIN: [
        P.USERS_VIEW, P.USERS_MANAGE, P.PERMISSIONS_VIEW, P.PERMISSIONS_MANAGE,
        P.DOCUMENTS_VIEW, P.DOCUMENTS_MANAGE, P.CHECKS_VIEW, P.CHECKS_MANAGE,
        P.DASHBOARD_VIEW, P.REPORTS_VIEW, P.CAPABILITIES_VIEW
    ],
    // Todos los permisos del sistema.
    SUPERADMIN: ALL_PERMISSIONS
});

// Une los permisos de un conjunto de capabilities -> Set<permiso>.
export const resolvePermissions = (capabilities) => {
    const out = new Set();
    for (const cap of capabilities) {
        for (const perm of (CAPABILITY_PERMISSIONS[cap] || [])) out.add(perm);
    }
    return out;
};
