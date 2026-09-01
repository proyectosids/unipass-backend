// Task 7.4B (Commit B) - Creación server-side de la cadena para Tipos 2/3 (+ bloqueo Tipo 4, retiro
// de POST /authorize y fallback de Orden histórico). Requiere DB. El resolver del autorizador se
// MOCKEA para controlar el resultado; la creación (Permission + Authorize) usa DB real. No destructivo:
// cuentas y permisos desechables se limpian en afterAll.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import sql from 'mssql';
import 'dotenv/config';

vi.mock('../src/services/authorizerResolver.service.js', () => ({ resolverAutorizadorSalida: vi.fn() }));
vi.mock('../src/util/socketHelpers.js', () => ({ emitToUser: vi.fn(), emitToEmpleado: vi.fn() }));
vi.mock('../src/services/notificationService.js', () => ({ sendToEmployee: vi.fn().mockResolvedValue({ success: true }) }));

import { resolverAutorizadorSalida } from '../src/services/authorizerResolver.service.js';
import app from '../src/app.js';
import { generateAccessToken } from '../src/util/tokens.js';
import { hashData } from '../src/util/hashData.js';
import { resolveAuthorizeLinkTx } from '../src/repositories/authorize.repo.js';

const hasDb = !!process.env.DB_SERVER;
const d = hasDb ? describe : describe.skip;

d('Task 7.4B Commit B - creación de cadena server-side (integración)', () => {
    let pool, tokenAlumno, tokenAutor, alumno = {}, autor = {}, autor2 = {};
    const permisos = new Set();
    const cuentas = new Set();
    const cuerpo = { FechaSolicitada: '2026-09-01T10:00:00', FechaSalida: '2026-09-02T09:00:00', FechaRegreso: '2026-09-02T18:00:00', Motivo: 'Test 7.4B/B' };

    const insertAccount = async ({ matricula, tipo }) => {
        const hash = await hashData('NoImporta123');
        const r = await pool.request()
            .input('m', sql.VarChar(10), matricula).input('c', sql.VarChar(80), `u${matricula}@test.local`)
            .input('p', sql.VarChar(sql.MAX), hash).input('n', sql.VarChar(120), 'TEST').input('a', sql.VarChar(120), '74BB')
            .input('t', sql.VarChar(20), tipo).input('s', sql.VarChar(15), 'M')
            .input('f', sql.DateTime, new Date('2000-01-01')).input('cel', sql.VarChar(15), '9610000000')
            .query(`INSERT INTO UNIPASS.LoginUniPass (Matricula,Contraseña,Correo,Nombre,Apellidos,TipoUser,Sexo,FechaNacimiento,Celular,StatusActividad)
                    OUTPUT INSERTED.IdLogin AS IdLogin VALUES (@m,@p,@c,@n,@a,@t,@s,@f,@cel,1)`);
        const row = { IdLogin: r.recordset[0].IdLogin, Matricula: matricula, Nombre: 'TEST', Apellidos: '74BB', TipoUser: tipo, Dormitorio: null };
        cuentas.add(row.IdLogin);
        return row;
    };
    const trackNuevos = async (fn) => {
        const antes = (await pool.request().query("SELECT ISNULL(MAX(IdPermission),0) m FROM UNIPASS.Permission")).recordset[0].m;
        const res = await fn();
        const nuevos = (await pool.request().input('a', sql.Int, antes).query('SELECT IdPermission FROM UNIPASS.Permission WHERE IdPermission>@a')).recordset;
        for (const r of nuevos) permisos.add(r.IdPermission);
        return res;
    };
    const authRows = async (idP) => (await pool.request().input('id', sql.Int, idP)
        .query('SELECT IdEmpleado, NoDepto, StatusAuthorize, Orden FROM UNIPASS.Authorize WHERE IdPermission=@id ORDER BY IdAuthorize')).recordset;
    const post = (body) => request(app).post('/permission').set('Authorization', `Bearer ${tokenAlumno}`).send(body);

    beforeAll(async () => {
        pool = await sql.connect({
            user: process.env.DB_USER, password: process.env.DB_PASSWORD, server: process.env.DB_SERVER, database: process.env.DB_DATABASE,
            options: { encrypt: process.env.DB_ENCRYPT === 'true', trustServerCertificate: process.env.DB_TRUST_CERT === 'true' }
        });
        const base = Number(String(Date.now()).slice(-7));
        alumno = await insertAccount({ matricula: String(base), tipo: 'ALUMNO' });
        autor = await insertAccount({ matricula: String(base + 1), tipo: 'PRECEPTOR' });
        autor2 = await insertAccount({ matricula: String(base + 2), tipo: 'PRECEPTOR' });
        // 7.3 D1-A.2: el gate documental de POST /permission exige documentación completa. Dorm 4
        // (UNIVERSITARIO, M) -> requeridos [1,5,7]; se siembran como Pendiente.
        await pool.request().input('id', sql.Int, alumno.IdLogin).query('UPDATE UNIPASS.LoginUniPass SET Dormitorio=4 WHERE IdLogin=@id');
        for (const idDoc of [1, 5, 7]) {
            await pool.request().input('d', sql.Int, idDoc).input('l', sql.Int, alumno.IdLogin)
                .query("INSERT INTO UNIPASS.Doctos (IdDocumento, Archivo, StatusDoctos, IdLogin, StatusRevision) VALUES (@d,'/uploads/x.pdf','Adjunto',@l,'Pendiente')");
        }
        tokenAlumno = generateAccessToken(alumno);
        tokenAutor = generateAccessToken(autor); // PRECEPTOR (no ALUMNO)
    });
    afterAll(async () => {
        for (const id of permisos) {
            await pool.request().input('id', sql.NVarChar(40), String(id)).query("DELETE FROM UNIPASS.AuditLog WHERE Recurso='Permission' AND RecursoId=@id");
            await pool.request().input('id', sql.Int, id).query('DELETE FROM UNIPASS.CheckPoints WHERE IdPermission=@id'); // C1: aprobar crea checks
            await pool.request().input('id', sql.Int, id).query('DELETE FROM UNIPASS.Authorize WHERE IdPermission=@id');
            await pool.request().input('id', sql.Int, id).query('DELETE FROM UNIPASS.IdempotencyRequest WHERE IdPermission=@id');
            await pool.request().input('id', sql.Int, id).query('DELETE FROM UNIPASS.Permission WHERE IdPermission=@id');
        }
        for (const id of cuentas) await pool.request().input('id', sql.Int, id).query('DELETE FROM UNIPASS.Doctos WHERE IdLogin=@id');
        for (const id of cuentas) await pool.request().input('id', sql.Int, id).query('DELETE FROM UNIPASS.LoginUniPass WHERE IdLogin=@id');
        await pool?.close();
    });
    beforeEach(() => {
        vi.clearAllMocks();
        // Por defecto: autorizador válido (cuenta activa autor) modo PRECEPTOR.
        resolverAutorizadorSalida.mockResolvedValue({ idEmpleado: Number(autor.Matricula), noDepto: 5, modo: 'PRECEPTOR' });
    });

    const countPerm = async () => (await pool.request().input('u', sql.Int, alumno.IdLogin).query('SELECT COUNT(*) n FROM UNIPASS.Permission WHERE IdUser=@u')).recordset[0].n;

    // Gate de tipo de usuario: solo ALUMNO crea salidas
    it('EMPLEADO/PRECEPTOR no puede crear salida -> 403 FORBIDDEN_USER_TYPE (body TipoUser ignorado)', async () => {
        const res = await request(app).post('/permission').set('Authorization', `Bearer ${tokenAutor}`)
            .send({ ...cuerpo, IdTipoSalida: 2, TipoUser: 'ALUMNO' });
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('FORBIDDEN_USER_TYPE');
        const n = (await pool.request().input('u', sql.Int, autor.IdLogin).query('SELECT COUNT(*) n FROM UNIPASS.Permission WHERE IdUser=@u')).recordset[0].n;
        expect(n).toBe(0); // no creó nada para el no-alumno
    });

    // Tipo 2
    it('Tipo 2: crea Permission + 1 Authorize server-side (Orden 1, Pendiente); IdUser del token', async () => {
        const res = await trackNuevos(() => post({ ...cuerpo, IdTipoSalida: 2 }));
        expect(res.status).toBe(201);
        expect(res.body.StatusPermission).toBe('Pendiente');
        const rows = await authRows(res.body.Id);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ IdEmpleado: Number(autor.Matricula), StatusAuthorize: 'Pendiente', Orden: 1 });
        const owner = (await pool.request().input('id', sql.Int, res.body.Id).query('SELECT IdUser FROM UNIPASS.Permission WHERE IdPermission=@id')).recordset[0].IdUser;
        expect(owner).toBe(alumno.IdLogin);
    });

    it('Tipo 2: body manipulado (IdEmpleado/NoDepto/StatusAuthorize/StatusPermission) IGNORADO', async () => {
        const res = await trackNuevos(() => post({ ...cuerpo, IdTipoSalida: 2, IdEmpleado: Number(autor2.Matricula), NoDepto: 999, StatusAuthorize: 'Aprobada', StatusPermission: 'Aprobada', IdUser: 999999 }));
        expect(res.status).toBe(201);
        expect(res.body.StatusPermission).toBe('Pendiente');
        const rows = await authRows(res.body.Id);
        expect(rows[0].IdEmpleado).toBe(Number(autor.Matricula)); // el del resolver, no el del body
        expect(rows[0].StatusAuthorize).toBe('Pendiente');
    });

    // Tipo 3
    it('Tipo 3: misma creación server-side (autorizador del resolver, Pendiente, Orden 1)', async () => {
        const res = await trackNuevos(() => post({ ...cuerpo, IdTipoSalida: 3 }));
        expect(res.status).toBe(201);
        const rows = await authRows(res.body.Id);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ IdEmpleado: Number(autor.Matricula), StatusAuthorize: 'Pendiente', Orden: 1 });
    });

    // No huérfano si el autorizador no tiene cuenta / no resoluble
    it('autorizador sin cuenta activa -> 409 AUTHORIZER_NOT_REGISTERED y 0 Permission', async () => {
        resolverAutorizadorSalida.mockResolvedValue({ idEmpleado: 888888888, noDepto: 5, modo: 'PRECEPTOR' });
        const antes = await countPerm();
        const res = await trackNuevos(() => post({ ...cuerpo, IdTipoSalida: 2 }));
        expect(res.status).toBe(409); expect(res.body.code).toBe('AUTHORIZER_NOT_REGISTERED');
        expect(await countPerm()).toBe(antes);
    });
    it('resolver no puede determinar autorizador -> 409 y 0 Permission (sin huérfano)', async () => {
        resolverAutorizadorSalida.mockResolvedValue({ error: 'PRECEPTOR_NOT_FOUND' });
        const antes = await countPerm();
        const res = await trackNuevos(() => post({ ...cuerpo, IdTipoSalida: 2 }));
        expect(res.status).toBe(409); expect(res.body.code).toBe('PRECEPTOR_NOT_FOUND');
        expect(await countPerm()).toBe(antes);
    });

    // Tipo 4 bloqueado
    it('Tipo 4 -> 501 SALIDA_TIPO_NO_DISPONIBLE y 0 Permission', async () => {
        const antes = await countPerm();
        const res = await trackNuevos(() => post({ ...cuerpo, IdTipoSalida: 4 }));
        expect(res.status).toBe(501); expect(res.body.code).toBe('SALIDA_TIPO_NO_DISPONIBLE');
        expect(await countPerm()).toBe(antes);
    });
    it('IdTipoSalida inválido -> 400 SALIDA_TIPO_INVALIDA', async () => {
        const res = await trackNuevos(() => post({ ...cuerpo, IdTipoSalida: 99 }));
        expect(res.status).toBe(400); expect(res.body.code).toBe('SALIDA_TIPO_INVALIDA');
    });

    // POST /authorize retirado
    it('POST /authorize retirado -> 404', async () => {
        const res = await request(app).post('/authorize').set('Authorization', `Bearer ${tokenAlumno}`)
            .send({ IdEmpleado: Number(autor.Matricula), NoDepto: 1, IdPermission: 1, StatusAuthorize: 'Aprobada' });
        expect(res.status).toBe(404);
    });

    // Fallback de Orden histórico (Orden=1,1): la resolución usa IdAuthorize ascendente
    it('cadena histórica Orden=1,1 -> orden efectivo por IdAuthorize (2º no aprueba antes del 1º)', async () => {
        // Permission + 2 Authorize con Orden 1,1 (como las cadenas antiguas mal pobladas).
        const p = await pool.request()
            .input('fs', sql.DateTime, new Date()).input('sp', sql.VarChar, 'Pendiente')
            .input('fsal', sql.DateTime, new Date(Date.now() + 86400000)).input('freg', sql.DateTime, new Date(Date.now() + 172800000))
            .input('mot', sql.VarChar, 'hist').input('idu', sql.Int, alumno.IdLogin).input('its', sql.Int, 2)
            .query(`INSERT INTO UNIPASS.Permission (FechaSolicitada,StatusPermission,FechaSalida,FechaRegreso,Motivo,IdUser,IdTipoSalida,Observaciones)
                    OUTPUT INSERTED.IdPermission AS IdPermission VALUES (@fs,@sp,@fsal,@freg,@mot,@idu,@its,'Ninguna')`);
        const idPermission = p.recordset[0].IdPermission; permisos.add(idPermission);
        for (const emp of [autor.Matricula, autor2.Matricula]) {
            await pool.request().input('e', sql.Int, Number(emp)).input('nd', sql.Int, 1).input('ip', sql.Int, idPermission)
                .query(`INSERT INTO UNIPASS.Authorize (IdEmpleado,NoDepto,IdPermission,StatusAuthorize,Orden) VALUES (@e,@nd,@ip,'Pendiente',1)`); // Orden 1,1
        }
        // El 2º insertado (autor2, IdAuthorize mayor) NO puede aprobar antes que el 1º.
        const r1 = await resolveAuthorizeLinkTx({ idPermission, actorMatricula: autor2.Matricula, nuevoStatus: 'Aprobada', audit: { actorIdLogin: autor2.IdLogin, actorMatricula: autor2.Matricula, accion: 'PERMISSION_AUTHORIZE_APPROVE' } });
        expect(r1.error).toBe('ORDER_NOT_READY');
        // El 1º sí puede; luego el 2º.
        const r2 = await resolveAuthorizeLinkTx({ idPermission, actorMatricula: autor.Matricula, nuevoStatus: 'Aprobada', audit: { actorIdLogin: autor.IdLogin, actorMatricula: autor.Matricula, accion: 'PERMISSION_AUTHORIZE_APPROVE' } });
        expect(r2.ok).toBe(true);
        const r3 = await resolveAuthorizeLinkTx({ idPermission, actorMatricula: autor2.Matricula, nuevoStatus: 'Aprobada', audit: { actorIdLogin: autor2.IdLogin, actorMatricula: autor2.Matricula, accion: 'PERMISSION_AUTHORIZE_APPROVE' } });
        expect(r3.ok).toBe(true);
        expect(r3.permDespues).toBe('Aprobada');
    });
});
