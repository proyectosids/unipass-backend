// FASE C - integración del nuevo modelo (piloto /admin/*), scope, manipulación, compat y
// auditoría. DB real; los grants de prueba (SUPERADMIN/scope) se crean y se limpian.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import sql from 'mssql';
import 'dotenv/config';
import app from '../src/app.js';
import { generateAccessToken } from '../src/util/tokens.js';
import { requirePermission } from '../src/Middleware/requirePermission.js';
import { PERMISSIONS } from '../src/security/permissions.js';
import { logAudit } from '../src/services/audit.service.js';

const hasDb = !!process.env.DB_SERVER;
const d = hasDb ? describe : describe.skip;

// Shape del usuario tal como queda en req.user (del token): id/tipo, no IdLogin/TipoUser.
const eff = (row) => ({ id: row.IdLogin, matricula: row.Matricula, tipo: row.TipoUser, dormitorio: row.Dormitorio });

// invoca un middleware con req/res simulados; resuelve { status, body, passed }
const runMw = (mw, row) => new Promise((resolve) => {
    const req = { user: eff(row) };
    const res = { status(c) { this._c = c; return this; }, json(b) { resolve({ status: this._c, body: b, passed: false }); } };
    mw(req, res, () => resolve({ status: 200, body: null, passed: true }));
});

d('FASE C autorización (piloto /admin/* + modelo)', () => {
    let pool, tAdmin, tSupervisor, tAlumno, tEmpleado, adminUser, supervisorUser, superadminUser, empleadoUser;
    const grantsCreados = [];

    const insertGrant = async (idLogin, capability, scopeType, scopeId = null) => {
        const r = await pool.request()
            .input('i', sql.Int, idLogin).input('c', sql.NVarChar(20), capability)
            .input('st', sql.NVarChar(12), scopeType).input('sid', sql.Int, scopeId)
            .query('INSERT INTO UNIPASS.CapabilityGrant (IdLogin,Capability,ScopeType,ScopeId,GrantedBy) OUTPUT INSERTED.IdGrant VALUES (@i,@c,@st,@sid,@i)');
        const id = r.recordset[0].IdGrant; grantsCreados.push(id); return id;
    };

    beforeAll(async () => {
        pool = await sql.connect({
            user: process.env.DB_USER, password: process.env.DB_PASSWORD, server: process.env.DB_SERVER, database: process.env.DB_DATABASE,
            options: { encrypt: process.env.DB_ENCRYPT === 'true', trustServerCertificate: process.env.DB_TRUST_CERT === 'true' }
        });
        const row = async (id) => (await pool.request().input('id', sql.Int, id).query('SELECT * FROM UNIPASS.LoginUniPass WHERE IdLogin=@id')).recordset[0];
        adminUser = await row(2061);       // ADMINISTRATIVO -> ADMIN (puente)
        supervisorUser = await row(6);     // SUPERVISOR (CapabilityGrant)
        const alumno = await row(20);      // sin capability
        empleadoUser = await row(7);       // EMPLEADO sin grant (para scope)
        tAdmin = generateAccessToken(adminUser);
        tSupervisor = generateAccessToken(supervisorUser);
        tAlumno = generateAccessToken(alumno);
        tEmpleado = generateAccessToken(empleadoUser);
        // SUPERADMIN temporal (se limpia): grant sobre el empleado 8.
        superadminUser = await row(8);
        await insertGrant(8, 'SUPERADMIN', 'GLOBAL', null);
    });

    afterAll(async () => {
        for (const id of grantsCreados) await pool.request().input('id', sql.Int, id).query('DELETE FROM UNIPASS.CapabilityGrant WHERE IdGrant=@id');
        await pool.request().query("DELETE FROM UNIPASS.AuditLog WHERE Accion LIKE 'TEST_%'");
        await pool?.close();
    });

    const dash = (t) => request(app).get('/admin/dashboard').set('Authorization', `Bearer ${t}`);

    // --- piloto /admin/dashboard: permiso + scope ---
    it('sin token -> 401', async () => expect((await request(app).get('/admin/dashboard')).status).toBe(401));
    it('SUPERVISOR (VIEW global) -> 200', async () => expect((await dash(tSupervisor)).status).toBe(200));
    it('ADMIN (bridge) -> 200', async () => expect((await dash(tAdmin)).status).toBe(200));
    it('SUPERADMIN -> 200', async () => expect((await dash(generateAccessToken(superadminUser))).status).toBe(200));
    it('usuario sin capability -> 403', async () => {
        const r = await dash(tAlumno);
        expect(r.status).toBe(403);
        expect(r.body.code).toBe('FORBIDDEN_PERMISSION');
    });

    // --- manipulación desde cliente no escala ---
    it('body con role/capability/scope/IdDormitorio/IdEmpleado NO escala (sigue 403)', async () => {
        const r = await request(app).get('/admin/dashboard').set('Authorization', `Bearer ${tAlumno}`)
            .query({ role: 'SUPERADMIN', capability: 'ADMIN', scope: 'GLOBAL', IdDormitorio: 5, IdEmpleado: 264 });
        expect(r.status).toBe(403);
    });

    // --- scope: permiso correcto + scope incorrecto -> 403; scope correcto -> 200 ---
    it('ADMIN con scope DORMITORIO -> 403 en /admin (requiere GLOBAL); con GLOBAL -> 200', async () => {
        const gid = await insertGrant(empleadoUser.IdLogin, 'ADMIN', 'DORMITORIO', 4);
        const r1 = await dash(tEmpleado);
        expect(r1.status).toBe(403);
        expect(r1.body.code).toBe('FORBIDDEN_SCOPE'); // permiso DASHBOARD_VIEW ok, scope insuficiente
        // cambiar el grant a GLOBAL -> ahora sí
        await pool.request().input('id', sql.Int, gid).query("UPDATE UNIPASS.CapabilityGrant SET ScopeType='GLOBAL', ScopeId=NULL WHERE IdGrant=@id");
        expect((await dash(tEmpleado)).status).toBe(200);
    });

    // --- MANAGE / SUPERADMIN-only vía requirePermission directo ---
    it('SUPERVISOR: USERS_MANAGE -> 403 (solo VIEW)', async () => {
        const r = await runMw(requirePermission(PERMISSIONS.USERS_MANAGE), supervisorUser);
        expect(r.passed).toBe(false); expect(r.status).toBe(403);
    });
    it('ADMIN: operación permitida (USERS_MANAGE) -> pasa; SUPERADMIN-only (CONFIG_MANAGE) -> 403', async () => {
        expect((await runMw(requirePermission(PERMISSIONS.USERS_MANAGE), adminUser)).passed).toBe(true);
        expect((await runMw(requirePermission(PERMISSIONS.CONFIG_MANAGE), adminUser)).passed).toBe(false);
    });
    it('SUPERADMIN: VIEW y MANAGE globales + SUPERADMIN-only -> pasa todo', async () => {
        expect((await runMw(requirePermission(PERMISSIONS.DASHBOARD_VIEW), superadminUser)).passed).toBe(true);
        expect((await runMw(requirePermission(PERMISSIONS.USERS_MANAGE), superadminUser)).passed).toBe(true);
        expect((await runMw(requirePermission(PERMISSIONS.CONFIG_MANAGE), superadminUser)).passed).toBe(true);
    });

    // --- compatibilidad: capabilities[] sin cambios + permissions[] aditivo ---
    it('getCapabilities: capabilities[] intacto (CHECKER) + permissions[] aditivo', async () => {
        const tChecker = generateAccessToken(await (async () => (await pool.request().input('id', sql.Int, 1).query('SELECT * FROM UNIPASS.LoginUniPass WHERE IdLogin=1')).recordset[0])());
        const r = await request(app).get('/getCapabilities').set('Authorization', `Bearer ${tChecker}`);
        expect(r.status).toBe(200);
        expect(Array.isArray(r.body.capabilities)).toBe(true);
        expect(r.body.capabilities.some((c) => c.type === 'CHECKER')).toBe(true); // forma legacy intacta
        expect(Array.isArray(r.body.permissions)).toBe(true);
        expect(r.body.permissions).toContain('CHECKS_MANAGE'); // aditivo, resuelto del nuevo modelo
    });

    // --- auditoría: registra sin secretos ---
    it('logAudit persiste la acción y NO guarda secretos', async () => {
        await logAudit({
            actor: { id: 2061, matricula: '264' }, capability: 'SUPERADMIN', permission: 'USERS_MANAGE',
            accion: 'TEST_AUDIT', recurso: 'User', recursoId: 999, resultado: 'SUCCESS',
            antes: { TipoUser: 'ALUMNO', Contraseña: 'SECRETO', TokenCFM: 'fcm-x' },
            despues: { TipoUser: 'EMPLEADO' }
        });
        const row = (await pool.request().query("SELECT TOP 1 * FROM UNIPASS.AuditLog WHERE Accion='TEST_AUDIT' ORDER BY Id DESC")).recordset[0];
        expect(row).toBeTruthy();
        expect(row.ActorIdLogin).toBe(2061);
        expect(row.DatosAntes).not.toContain('SECRETO');   // hash/contraseña filtrada
        expect(row.DatosAntes).not.toContain('fcm-x');      // TokenCFM filtrado
        expect(row.DatosAntes).toContain('ALUMNO');         // dato no sensible conservado
    });
});
