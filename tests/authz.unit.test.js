// FASE C - unit tests del modelo de autorización (sin BD): mapping capability->permisos
// y cobertura de scope.
import { describe, it, expect } from 'vitest';
import { PERMISSIONS, resolvePermissions, CAPABILITY_PERMISSIONS } from '../src/security/permissions.js';
import { scopeCovers } from '../src/services/capability.service.js';

describe('resolvePermissions (capability -> permisos)', () => {
    it('SUPERVISOR: solo VIEW, ningún MANAGE', () => {
        const p = resolvePermissions(['SUPERVISOR']);
        expect(p.has(PERMISSIONS.DASHBOARD_VIEW)).toBe(true);
        expect(p.has(PERMISSIONS.REPORTS_VIEW)).toBe(true);
        expect([...p].some((x) => x.endsWith('_MANAGE'))).toBe(false);
    });
    it('ADMIN: incluye MANAGE operativos pero NO SUPERADMIN-only', () => {
        const p = resolvePermissions(['ADMIN']);
        expect(p.has(PERMISSIONS.USERS_MANAGE)).toBe(true);
        expect(p.has(PERMISSIONS.PERMISSIONS_MANAGE)).toBe(true);
        expect(p.has(PERMISSIONS.CAPABILITIES_VIEW)).toBe(true);
        // SUPERADMIN-only:
        expect(p.has(PERMISSIONS.CAPABILITIES_MANAGE)).toBe(false);
        expect(p.has(PERMISSIONS.AUDIT_VIEW)).toBe(false);
        expect(p.has(PERMISSIONS.CONFIG_MANAGE)).toBe(false);
    });
    it('SUPERADMIN: TODOS los permisos', () => {
        const p = resolvePermissions(['SUPERADMIN']);
        for (const perm of Object.values(PERMISSIONS)) expect(p.has(perm)).toBe(true);
    });
    it('CHECKER: solo CHECKS_VIEW/MANAGE', () => {
        expect([...resolvePermissions(['CHECKER'])].sort()).toEqual(['CHECKS_MANAGE', 'CHECKS_VIEW']);
    });
    it('unión de varias capabilities', () => {
        const p = resolvePermissions(['SUPERVISOR', 'CHECKER']);
        expect(p.has(PERMISSIONS.CHECKS_MANAGE)).toBe(true);
        expect(p.has(PERMISSIONS.DASHBOARD_VIEW)).toBe(true);
    });
});

describe('scopeCovers (SELF / DORMITORIO / GLOBAL)', () => {
    const user = { id: 10 };
    it('GLOBAL cubre cualquier recurso', () => {
        expect(scopeCovers([{ type: 'GLOBAL' }], { type: 'GLOBAL' }, user)).toBe(true);
        expect(scopeCovers([{ type: 'GLOBAL' }], { type: 'DORMITORIO', id: 4 }, user)).toBe(true);
    });
    it('DORMITORIO cubre su mismo dorm, no otro', () => {
        expect(scopeCovers([{ type: 'DORMITORIO', id: 4 }], { type: 'DORMITORIO', id: 4 }, user)).toBe(true);
        expect(scopeCovers([{ type: 'DORMITORIO', id: 4 }], { type: 'DORMITORIO', id: 3 }, user)).toBe(false);
    });
    it('DORMITORIO NO cubre recurso GLOBAL (permiso ok pero scope insuficiente)', () => {
        expect(scopeCovers([{ type: 'DORMITORIO', id: 4 }], { type: 'GLOBAL' }, user)).toBe(false);
    });
    it('SELF cubre solo al propio actor', () => {
        expect(scopeCovers([{ type: 'SELF' }], { type: 'SELF', ownerId: 10 }, user)).toBe(true);
        expect(scopeCovers([{ type: 'SELF' }], { type: 'SELF', ownerId: 11 }, user)).toBe(false);
    });
});
