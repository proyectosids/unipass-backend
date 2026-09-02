// Task 7.3 D2-A - Contención BOLA/IDOR de LECTURAS documentales + contratos server-authoritative.
// Requiere DB. No destructivo (cuentas/Doctos/CheckerGrant desechables @test.local).
// Modelo de dormitorios: A=4 (UNIVERSITARIO,M), B=3 (NIVEL MEDIO,M). Cross-dorm: se asevera que NO se
// filtran DATOS del otro dorm (no solo el status HTTP).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import sql from 'mssql';
import 'dotenv/config';

import app from '../src/app.js';
import { generateAccessToken } from '../src/util/tokens.js';
import { hashData } from '../src/util/hashData.js';
import { createOrReactivateGrant } from '../src/repositories/checkerGrant.repo.js';

const hasDb = !!process.env.DB_SERVER;
const d = hasDb ? describe : describe.skip;

// Ninguna respuesta documental/personal debe reexponer credenciales (regresión R1).
const SENSITIVE = ['Contraseña', 'Contrasena', 'TokenCFM', 'Password'];
const assertNoSensitive = (obj) => {
    const rows = Array.isArray(obj) ? obj : [obj];
    for (const row of rows) {
        if (!row || typeof row !== 'object') continue;
        for (const k of SENSITIVE) expect(Object.prototype.hasOwnProperty.call(row, k)).toBe(false);
    }
};

d('Task 7.3 D2-A - lecturas documentales seguras (integración)', () => {
    let pool;
    let alumnoA = {}, alumnoB = {}, preA = {}, preB = {}, empleado = {}, checkerDormA = {}, checkerCaseta = {};
    let tAlumnoA, tAlumnoB, tPreA, tPreB, tEmpleado, tCheckerDormA, tCheckerCaseta;
    const DORM_A = 4, DORM_B = 3;
    const cuentas = new Set(), doctos = new Set();

    const insertAccount = async ({ matricula, tipo, dorm = null }) => {
        const hash = await hashData('x');
        const r = await pool.request()
            .input('m', sql.VarChar(10), matricula).input('c', sql.VarChar(80), `${matricula}@test.local`)
            .input('p', sql.VarChar(sql.MAX), hash).input('n', sql.VarChar(120), 'T').input('a', sql.VarChar(120), `D2A${matricula}`)
            .input('t', sql.VarChar(20), tipo).input('s', sql.VarChar(15), 'M')
            .input('f', sql.DateTime, new Date('2000-01-01')).input('cel', sql.VarChar(15), '9610000000')
            .input('d', sql.Int, dorm).input('tok', sql.VarChar(sql.MAX), 'fcm-x')
            .query(`INSERT INTO UNIPASS.LoginUniPass (Matricula,Contraseña,Correo,Nombre,Apellidos,TipoUser,Sexo,FechaNacimiento,Celular,StatusActividad,Dormitorio,TokenCFM)
                    OUTPUT INSERTED.IdLogin AS IdLogin VALUES (@m,@p,@c,@n,@a,@t,@s,@f,@cel,1,@d,@tok)`);
        const row = { IdLogin: r.recordset[0].IdLogin, Matricula: matricula, Nombre: 'T', Apellidos: `D2A${matricula}`, TipoUser: tipo, Dormitorio: dorm };
        cuentas.add(row.IdLogin);
        return row;
    };
    const crearDoc = async ({ idLogin, idDocumento = 1, status = 'Pendiente' }) => {
        const r = await pool.request().input('idd', sql.Int, idDocumento).input('idl', sql.Int, idLogin).input('st', sql.VarChar, status)
            .input('arch', sql.VarChar, `/uploads/doc${idDocumento}.pdf`)
            .query(`INSERT INTO UNIPASS.Doctos (IdDocumento, IdLogin, Archivo, StatusDoctos, StatusRevision)
                    OUTPUT INSERTED.IdDoctos AS IdDoctos VALUES (@idd,@idl,@arch,'Adjunto',@st)`);
        const id = r.recordset[0].IdDoctos; doctos.add(id); return id;
    };

    beforeAll(async () => {
        pool = await sql.connect({
            user: process.env.DB_USER, password: process.env.DB_PASSWORD, server: process.env.DB_SERVER, database: process.env.DB_DATABASE,
            options: { encrypt: process.env.DB_ENCRYPT === 'true', trustServerCertificate: process.env.DB_TRUST_CERT === 'true' }
        });
        const b = Number(String(Date.now()).slice(-7));
        alumnoA = await insertAccount({ matricula: String(b), tipo: 'ALUMNO', dorm: DORM_A });
        alumnoB = await insertAccount({ matricula: String(b + 1), tipo: 'ALUMNO', dorm: DORM_B });
        preA = await insertAccount({ matricula: String(b + 2), tipo: 'PRECEPTOR', dorm: DORM_A });
        preB = await insertAccount({ matricula: String(b + 3), tipo: 'PRECEPTOR', dorm: DORM_B });
        empleado = await insertAccount({ matricula: String(b + 4), tipo: 'EMPLEADO', dorm: DORM_A });
        checkerDormA = await insertAccount({ matricula: String(b + 5), tipo: 'VIGILANCIA', dorm: null });
        checkerCaseta = await insertAccount({ matricula: String(b + 6), tipo: 'VIGILANCIA', dorm: null });

        // Grants CHECKER server-side: uno de Dormitorio (dorm A) y uno de Caseta (global). Capability por DEFAULT='CHECKER'.
        await createOrReactivateGrant({ idLogin: checkerDormA.IdLogin, tipo: 'Dormitorio', idDormitorio: DORM_A, scope: 'AMBOS', vigencia: 'PERMANENTE', asignadoPor: preA.IdLogin });
        await createOrReactivateGrant({ idLogin: checkerCaseta.IdLogin, tipo: 'Caseta', idDormitorio: null, scope: 'AMBOS', vigencia: 'PERMANENTE', asignadoPor: preA.IdLogin });

        // Documentos: expediente de alumnoA (dorm A) y alumnoB (dorm B) + foto de perfil (IdDocumento=6) de ambos.
        await crearDoc({ idLogin: alumnoA.IdLogin, idDocumento: 1 });
        await crearDoc({ idLogin: alumnoA.IdLogin, idDocumento: 6 }); // foto perfil A
        await crearDoc({ idLogin: alumnoB.IdLogin, idDocumento: 1 });
        await crearDoc({ idLogin: alumnoB.IdLogin, idDocumento: 6 }); // foto perfil B

        tAlumnoA = generateAccessToken(alumnoA); tAlumnoB = generateAccessToken(alumnoB);
        tPreA = generateAccessToken(preA); tPreB = generateAccessToken(preB);
        tEmpleado = generateAccessToken(empleado);
        tCheckerDormA = generateAccessToken(checkerDormA); tCheckerCaseta = generateAccessToken(checkerCaseta);
    });

    afterAll(async () => {
        for (const id of doctos) await pool.request().input('id', sql.Int, id).query('DELETE FROM UNIPASS.Doctos WHERE IdDoctos=@id');
        for (const id of cuentas) await pool.request().input('id', sql.Int, id).query('DELETE FROM UNIPASS.CheckerGrant WHERE IdLogin=@id OR AsignadoPor=@id');
        for (const id of cuentas) await pool.request().input('id', sql.Int, id).query('DELETE FROM UNIPASS.LoginUniPass WHERE IdLogin=@id');
        await pool?.close();
    });

    const g = (path, token) => {
        const r = request(app).get(path);
        if (token) r.set('Authorization', `Bearer ${token}`);
        return r;
    };

    // ===== §15 SELF: GET /me/documents =====
    describe('GET /me/documents (SELF)', () => {
        it('sin token -> 401', async () => expect((await g('/me/documents')).status).toBe(401));
        it('alumnoA -> 200 solo SUS documentos, sin credenciales', async () => {
            const r = await g('/me/documents', tAlumnoA);
            expect(r.status).toBe(200);
            expect(Array.isArray(r.body)).toBe(true);
            expect(r.body.every((doc) => Number(doc.IdLogin) === Number(alumnoA.IdLogin))).toBe(true);
            assertNoSensitive(r.body);
        });
    });

    // NOTA: los bridges GET legacy (/doctos/:Id, /doctosProfile/:id, /getExpediente, /getArchivos) fueron
    // RETIRADOS en D2-C. Su retiro (404) se prueba en documents-read-d2c.integration.test.js.

    // ===== §16 GET /documents/review/students (PRECEPTOR) =====
    describe('GET /documents/review/students', () => {
        it('sin token -> 401', async () => expect((await g('/documents/review/students')).status).toBe(401));
        it('ALUMNO -> 403 FORBIDDEN_DOCUMENT_REVIEWER', async () => {
            const r = await g('/documents/review/students', tAlumnoA);
            expect(r.status).toBe(403); expect(r.body.code).toBe('FORBIDDEN_DOCUMENT_REVIEWER');
        });
        it('EMPLEADO -> 403 (revisor solo PRECEPTOR)', async () => {
            expect((await g('/documents/review/students', tEmpleado)).status).toBe(403);
        });
        it('preA -> 200: incluye a alumnoA (dorm A) y NO a alumnoB (dorm B); respuesta mínima sin credenciales', async () => {
            const r = await g('/documents/review/students', tPreA);
            expect(r.status).toBe(200);
            const ids = r.body.map((x) => Number(x.IdLogin));
            expect(ids).toContain(alumnoA.IdLogin);
            expect(ids).not.toContain(alumnoB.IdLogin); // cross-dorm: sin fuga de datos
            assertNoSensitive(r.body);
            for (const x of r.body) expect(Object.keys(x).sort()).toEqual(['Apellidos', 'IdLogin', 'Matricula', 'Nombre']);
        });
        it('preB -> 200: incluye a alumnoB y NO a alumnoA', async () => {
            const r = await g('/documents/review/students', tPreB);
            const ids = r.body.map((x) => Number(x.IdLogin));
            expect(ids).toContain(alumnoB.IdLogin);
            expect(ids).not.toContain(alumnoA.IdLogin);
        });
    });

    // ===== §17 GET /documents/review/students/:idLogin/documents (PRECEPTOR) =====
    describe('GET /documents/review/students/:idLogin/documents', () => {
        it('sin token -> 401', async () => expect((await g(`/documents/review/students/${alumnoA.IdLogin}/documents`)).status).toBe(401));
        it('ALUMNO -> 403 FORBIDDEN_DOCUMENT_REVIEWER', async () => {
            const r = await g(`/documents/review/students/${alumnoA.IdLogin}/documents`, tAlumnoA);
            expect(r.status).toBe(403); expect(r.body.code).toBe('FORBIDDEN_DOCUMENT_REVIEWER');
        });
        it('preA lee docs de alumnoA (mismo dorm) -> 200 sin credenciales', async () => {
            const r = await g(`/documents/review/students/${alumnoA.IdLogin}/documents`, tPreA);
            expect(r.status).toBe(200);
            expect(r.body.every((doc) => Number(doc.IdLogin) === Number(alumnoA.IdLogin))).toBe(true);
            assertNoSensitive(r.body);
        });
        it('preA intenta docs de alumnoB (otro dorm) -> 403 FORBIDDEN_DOCUMENT_SCOPE y NO filtra docs', async () => {
            const r = await g(`/documents/review/students/${alumnoB.IdLogin}/documents`, tPreA);
            expect(r.status).toBe(403); expect(r.body.code).toBe('FORBIDDEN_DOCUMENT_SCOPE');
            expect(Array.isArray(r.body)).toBe(false);
        });
        it('preA sobre un target no-ALUMNO (preB) -> 404 DOCUMENT_NOT_FOUND', async () => {
            const r = await g(`/documents/review/students/${preB.IdLogin}/documents`, tPreA);
            expect(r.status).toBe(404); expect(r.body.code).toBe('DOCUMENT_NOT_FOUND');
        });
    });

    // ===== §18 Foto de perfil: GET /users/:idLogin/profile-photo =====
    describe('GET /users/:idLogin/profile-photo', () => {
        it('sin token -> 401', async () => expect((await g(`/users/${alumnoA.IdLogin}/profile-photo`)).status).toBe(401));
        it('SELF -> 200 (IdDocumento=6)', async () => {
            const r = await g(`/users/${alumnoA.IdLogin}/profile-photo`, tAlumnoA);
            expect(r.status).toBe(200); expect(r.body.IdDocumento).toBe(6);
            assertNoSensitive(r.body);
        });
        it('PRECEPTOR mismo dorm -> 200; otro dorm -> 403', async () => {
            expect((await g(`/users/${alumnoA.IdLogin}/profile-photo`, tPreA)).status).toBe(200);
            const r = await g(`/users/${alumnoA.IdLogin}/profile-photo`, tPreB);
            expect(r.status).toBe(403); expect(r.body.code).toBe('FORBIDDEN_DOCUMENT_SCOPE');
        });
        it('CHECKER con grant Dormitorio del dorm A: ve alumnoA (200), NO alumnoB (403)', async () => {
            expect((await g(`/users/${alumnoA.IdLogin}/profile-photo`, tCheckerDormA)).status).toBe(200);
            expect((await g(`/users/${alumnoB.IdLogin}/profile-photo`, tCheckerDormA)).status).toBe(403);
        });
        it('CHECKER con grant Caseta (global): ve alumnoA y alumnoB (200)', async () => {
            expect((await g(`/users/${alumnoA.IdLogin}/profile-photo`, tCheckerCaseta)).status).toBe(200);
            expect((await g(`/users/${alumnoB.IdLogin}/profile-photo`, tCheckerCaseta)).status).toBe(200);
        });
        it('ALUMNO ajeno -> 403 (no self, no reviewer, no checker)', async () => {
            const r = await g(`/users/${alumnoA.IdLogin}/profile-photo`, tAlumnoB);
            expect(r.status).toBe(403); expect(r.body.code).toBe('FORBIDDEN_DOCUMENT_SCOPE');
        });
    });

    // El retiro (404) de /doctosProfile/:id, /getExpediente/:IdDormi, /getArchivos/... y /doctos
    // se prueba en documents-read-d2c.integration.test.js (D2-C).
});
