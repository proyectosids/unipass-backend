// Task 7.3 D2-C - Cierre final: retiro de bridges GET legacy + eliminación de la exposición estática de
// public/uploads (DIRECT_FILE_ACCESS_BYPASS). Requiere DB. Prueba RETIRO (404), no 401/403, y que
// GET /files/:idDoctos sigue sirviendo binarios (todos los formatos/tipos) SIN depender de express.static.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import sql from 'mssql';
import fs from 'node:fs';
import path from 'node:path';
import 'dotenv/config';

import app from '../src/app.js';
import { generateAccessToken } from '../src/util/tokens.js';
import { hashData } from '../src/util/hashData.js';
import { createOrReactivateGrant } from '../src/repositories/checkerGrant.repo.js';
import { UPLOAD_ROOT } from '../src/util/secureFilePath.js';

const hasDb = !!process.env.DB_SERVER;
const d = hasDb ? describe : describe.skip;

const getBin = (p, token) => {
    const r = request(app).get(p).buffer(true).parse((res, cb) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    if (token) r.set('Authorization', `Bearer ${token}`);
    return r;
};

d('Task 7.3 D2-C - retiro legacy + cierre del bypass estático (integración)', () => {
    let pool;
    let alumnoA = {}, alumnoB = {}, preA = {}, preB = {}, empleado = {}, checkerDormA = {};
    let tAlumnoA, tPreA, tPreB, tEmpleado, tCheckerDormA;
    const DORM_A = 4, DORM_B = 3;
    const cuentas = new Set(), doctos = new Set(), archivos = new Set();
    const id = {}; const fn = {};

    const insertAccount = async ({ matricula, tipo, dorm = null }) => {
        const hash = await hashData('x');
        const r = await pool.request()
            .input('m', sql.VarChar(10), matricula).input('c', sql.VarChar(80), `${matricula}@test.local`)
            .input('p', sql.VarChar(sql.MAX), hash).input('n', sql.VarChar(120), 'T').input('a', sql.VarChar(120), `D2C${matricula}`)
            .input('t', sql.VarChar(20), tipo).input('s', sql.VarChar(15), 'M')
            .input('f', sql.DateTime, new Date('2000-01-01')).input('cel', sql.VarChar(15), '9610000000')
            .input('d', sql.Int, dorm).input('tok', sql.VarChar(sql.MAX), 'fcm-x')
            .query(`INSERT INTO UNIPASS.LoginUniPass (Matricula,Contraseña,Correo,Nombre,Apellidos,TipoUser,Sexo,FechaNacimiento,Celular,StatusActividad,Dormitorio,TokenCFM)
                    OUTPUT INSERTED.IdLogin AS IdLogin VALUES (@m,@p,@c,@n,@a,@t,@s,@f,@cel,1,@d,@tok)`);
        const row = { IdLogin: r.recordset[0].IdLogin, Matricula: matricula, TipoUser: tipo, Dormitorio: dorm };
        cuentas.add(row.IdLogin);
        return row;
    };
    const crearDocConArchivo = async ({ idLogin, idDocumento, ext, bytes }) => {
        const filename = `d2c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
        fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
        fs.writeFileSync(path.join(UPLOAD_ROOT, filename), bytes);
        archivos.add(path.join(UPLOAD_ROOT, filename));
        const r = await pool.request().input('idd', sql.Int, idDocumento).input('idl', sql.Int, idLogin)
            .input('arch', sql.VarChar, `/uploads/${filename}`)
            .query(`INSERT INTO UNIPASS.Doctos (IdDocumento, IdLogin, Archivo, StatusDoctos, StatusRevision)
                    OUTPUT INSERTED.IdDoctos AS IdDoctos VALUES (@idd,@idl,@arch,'Adjunto','Pendiente')`);
        const idDoctos = r.recordset[0].IdDoctos; doctos.add(idDoctos);
        return { idDoctos, filename };
    };

    const PDF = Buffer.from('%PDF-1.4\nD2C\n%%EOF');
    const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9]);
    const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

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
        await createOrReactivateGrant({ idLogin: checkerDormA.IdLogin, tipo: 'Dormitorio', idDormitorio: DORM_A, scope: 'AMBOS', vigencia: 'PERMANENTE', asignadoPor: preA.IdLogin });

        // Cobertura de FORMATOS (pdf/png/jpg/jpeg) y TIPOS (1-7) de alumnoA:
        ({ idDoctos: id.reg1, filename: fn.reg1 } = await crearDocConArchivo({ idLogin: alumnoA.IdLogin, idDocumento: 1, ext: 'pdf', bytes: PDF }));
        ({ idDoctos: id.t2 } = await crearDocConArchivo({ idLogin: alumnoA.IdLogin, idDocumento: 2, ext: 'pdf', bytes: PDF }));
        ({ idDoctos: id.t3 } = await crearDocConArchivo({ idLogin: alumnoA.IdLogin, idDocumento: 3, ext: 'jpg', bytes: JPG }));
        ({ idDoctos: id.t4 } = await crearDocConArchivo({ idLogin: alumnoA.IdLogin, idDocumento: 4, ext: 'jpeg', bytes: JPG }));
        ({ idDoctos: id.conv5 } = await crearDocConArchivo({ idLogin: alumnoA.IdLogin, idDocumento: 5, ext: 'pdf', bytes: PDF }));
        ({ idDoctos: id.foto6 } = await crearDocConArchivo({ idLogin: alumnoA.IdLogin, idDocumento: 6, ext: 'png', bytes: PNG }));
        ({ idDoctos: id.ine7 } = await crearDocConArchivo({ idLogin: alumnoA.IdLogin, idDocumento: 7, ext: 'pdf', bytes: PDF }));

        tAlumnoA = generateAccessToken(alumnoA); tPreA = generateAccessToken(preA);
        tPreB = generateAccessToken(preB); tEmpleado = generateAccessToken(empleado);
        tCheckerDormA = generateAccessToken(checkerDormA);
    });

    afterAll(async () => {
        for (const abs of archivos) { try { fs.unlinkSync(abs); } catch { /* ya no existe */ } }
        for (const x of doctos) await pool.request().input('id', sql.Int, x).query('DELETE FROM UNIPASS.Doctos WHERE IdDoctos=@id');
        for (const x of cuentas) await pool.request().input('id', sql.Int, x).query('DELETE FROM UNIPASS.CheckerGrant WHERE IdLogin=@id OR AsignadoPor=@id');
        for (const x of cuentas) await pool.request().input('id', sql.Int, x).query('DELETE FROM UNIPASS.LoginUniPass WHERE IdLogin=@id');
        await pool?.close();
    });

    // ===== §3 + §20 DIRECT_FILE_ACCESS_BYPASS cerrado =====
    describe('DIRECT_FILE_ACCESS_BYPASS cerrado', () => {
        it('GET /uploads/<filename> SIN token -> 404 (ya no hay static)', async () => {
            const r = await getBin(`/uploads/${fn.reg1}`);
            expect(r.status).toBe(404);
        });
        it('GET /uploads/<filename> CON Bearer -> 404 (Bearer no convierte /uploads en endpoint)', async () => {
            const r = await getBin(`/uploads/${fn.reg1}`, tAlumnoA);
            expect(r.status).toBe(404);
        });
        it('el MISMO archivo sí es accesible por /files/:idDoctos con Bearer autorizado -> 200', async () => {
            expect((await getBin(`/files/${id.reg1}`, tAlumnoA)).status).toBe(200);
        });
        it('/files/:idDoctos sin autorización -> 401/403 (no 200)', async () => {
            expect((await getBin(`/files/${id.reg1}`)).status).toBe(401);           // sin token
            expect((await getBin(`/files/${id.reg1}`, tPreB)).status).toBe(403);     // preceptor otro dorm
        });
    });

    // ===== §12 bridges GET legacy RETIRADOS -> 404 (con y sin token) =====
    describe('bridges GET legacy retirados (404)', () => {
        const casos = [
            () => `/doctos/${alumnoA.IdLogin}`,
            () => `/doctosProfile/${alumnoA.IdLogin}?IdDocumento=6`,
            () => `/getExpediente/${DORM_A}`,
            () => `/getArchivos/${DORM_A}`,
            () => '/doctos'
        ];
        for (const c of casos) {
            it(`${c()} -> 404 sin token y con token`, async () => {
                expect((await getBin(c())).status).toBe(404);
                expect((await getBin(c(), tAlumnoA)).status).toBe(404);
            });
        }
    });

    // ===== §4 /files sigue funcionando tras quitar static =====
    describe('GET /files/:idDoctos tras retirar static', () => {
        it('sin token -> 401', async () => expect((await getBin(`/files/${id.reg1}`)).status).toBe(401));
        it('SELF -> 200', async () => expect((await getBin(`/files/${id.reg1}`, tAlumnoA)).status).toBe(200));
        it('PRECEPTOR mismo dorm -> 200 (privado y foto)', async () => {
            expect((await getBin(`/files/${id.ine7}`, tPreA)).status).toBe(200);
            expect((await getBin(`/files/${id.foto6}`, tPreA)).status).toBe(200);
        });
        it('PRECEPTOR otro dorm -> 403', async () => expect((await getBin(`/files/${id.reg1}`, tPreB)).status).toBe(403));
        it('CHECKER: foto(6) -> 200; privados 1-5/7 -> 403', async () => {
            expect((await getBin(`/files/${id.foto6}`, tCheckerDormA)).status).toBe(200);
            for (const k of ['reg1', 't2', 't3', 't4', 'conv5', 'ine7']) {
                expect((await getBin(`/files/${id[k]}`, tCheckerDormA)).status).toBe(403);
            }
        });
        it('EMPLEADO -> 403', async () => expect((await getBin(`/files/${id.ine7}`, tEmpleado)).status).toBe(403));
    });

    // ===== §0 cobertura de FORMATOS y TIPOS (1-7) =====
    describe('cobertura de formatos y tipos por /files', () => {
        it('MIME: pdf/png/jpg/jpeg correctos', async () => {
            expect((await getBin(`/files/${id.reg1}`, tAlumnoA)).headers['content-type']).toContain('application/pdf');
            expect((await getBin(`/files/${id.foto6}`, tAlumnoA)).headers['content-type']).toContain('image/png');
            expect((await getBin(`/files/${id.t3}`, tAlumnoA)).headers['content-type']).toContain('image/jpeg');
            expect((await getBin(`/files/${id.t4}`, tAlumnoA)).headers['content-type']).toContain('image/jpeg');
        });
        it('SELF puede leer los tipos 1-7 (privados y foto) -> 200', async () => {
            for (const k of ['reg1', 't2', 't3', 't4', 'conv5', 'foto6', 'ine7']) {
                expect((await getBin(`/files/${id[k]}`, tAlumnoA)).status).toBe(200);
            }
        });
        it('headers: Cache-Control private,no-store; sin redirect ni Location', async () => {
            const r = await getBin(`/files/${id.reg1}`, tAlumnoA);
            expect(r.headers['cache-control']).toContain('private');
            expect(r.headers['cache-control']).toContain('no-store');
            expect(r.headers['location']).toBeUndefined();
            expect(r.status).toBe(200);
        });
    });
});
