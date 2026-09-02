// Task 7.3 D2-B2 - Entrega AUTENTICADA de binarios documentales (GET /files/:idDoctos). Requiere DB.
// No destructivo: cuentas/Doctos/CheckerGrant @test.local + archivos controlados en public/uploads (limpiados).
// Verifica política por IdDocumento (foto=6 vs privados 1-5,7), path safety, headers, y CONTENIDO real.
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

// Descarga cruda (buffer) para poder aseverar bytes/headers de binarios.
const getBin = (path, token) => {
    const r = request(app).get(path).buffer(true).parse((res, cb) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    if (token) r.set('Authorization', `Bearer ${token}`);
    return r;
};

d('Task 7.3 D2-B2 - GET /files/:idDoctos (integración)', () => {
    let pool;
    let alumnoA = {}, alumnoB = {}, preA = {}, preB = {}, empleado = {}, vigilante = {}, checkerDormA = {}, checkerCaseta = {};
    let tAlumnoA, tAlumnoB, tPreA, tPreB, tEmpleado, tVigilante, tCheckerDormA, tCheckerCaseta;
    const DORM_A = 4, DORM_B = 3;
    const cuentas = new Set(), doctos = new Set(), archivos = new Set();
    // IdDoctos por (dueño, tipo)
    const id = {};

    const insertAccount = async ({ matricula, tipo, dorm = null }) => {
        const hash = await hashData('x');
        const r = await pool.request()
            .input('m', sql.VarChar(10), matricula).input('c', sql.VarChar(80), `${matricula}@test.local`)
            .input('p', sql.VarChar(sql.MAX), hash).input('n', sql.VarChar(120), 'T').input('a', sql.VarChar(120), `D2B2${matricula}`)
            .input('t', sql.VarChar(20), tipo).input('s', sql.VarChar(15), 'M')
            .input('f', sql.DateTime, new Date('2000-01-01')).input('cel', sql.VarChar(15), '9610000000')
            .input('d', sql.Int, dorm).input('tok', sql.VarChar(sql.MAX), 'fcm-x')
            .query(`INSERT INTO UNIPASS.LoginUniPass (Matricula,Contraseña,Correo,Nombre,Apellidos,TipoUser,Sexo,FechaNacimiento,Celular,StatusActividad,Dormitorio,TokenCFM)
                    OUTPUT INSERTED.IdLogin AS IdLogin VALUES (@m,@p,@c,@n,@a,@t,@s,@f,@cel,1,@d,@tok)`);
        const row = { IdLogin: r.recordset[0].IdLogin, Matricula: matricula, TipoUser: tipo, Dormitorio: dorm };
        cuentas.add(row.IdLogin);
        return row;
    };
    // Crea un archivo real en public/uploads con bytes conocidos y su fila Doctos. Devuelve { idDoctos, bytes }.
    const crearDocConArchivo = async ({ idLogin, idDocumento, ext, bytes }) => {
        const filename = `d2b2_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const abs = path.join(UPLOAD_ROOT, filename);
        fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
        fs.writeFileSync(abs, bytes);
        archivos.add(abs);
        const r = await pool.request().input('idd', sql.Int, idDocumento).input('idl', sql.Int, idLogin)
            .input('arch', sql.VarChar, `/uploads/${filename}`)
            .query(`INSERT INTO UNIPASS.Doctos (IdDocumento, IdLogin, Archivo, StatusDoctos, StatusRevision)
                    OUTPUT INSERTED.IdDoctos AS IdDoctos VALUES (@idd,@idl,@arch,'Adjunto','Pendiente')`);
        const idDoctos = r.recordset[0].IdDoctos; doctos.add(idDoctos);
        return { idDoctos, bytes };
    };
    // Fila Doctos SIN archivo físico (para el caso metadata-existe / binario-ausente).
    const crearDocSinArchivo = async ({ idLogin, idDocumento }) => {
        const r = await pool.request().input('idd', sql.Int, idDocumento).input('idl', sql.Int, idLogin)
            .input('arch', sql.VarChar, `/uploads/d2b2_missing_${Date.now()}.pdf`)
            .query(`INSERT INTO UNIPASS.Doctos (IdDocumento, IdLogin, Archivo, StatusDoctos, StatusRevision)
                    OUTPUT INSERTED.IdDoctos AS IdDoctos VALUES (@idd,@idl,@arch,'Adjunto','Pendiente')`);
        const idDoctos = r.recordset[0].IdDoctos; doctos.add(idDoctos);
        return idDoctos;
    };

    const PDF = Buffer.from('%PDF-1.4\n1 0 obj D2B2 test pdf\n%%EOF');
    const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
    let bytesReglamentoA;

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
        vigilante = await insertAccount({ matricula: String(b + 5), tipo: 'VIGILANCIA', dorm: null });
        checkerDormA = await insertAccount({ matricula: String(b + 6), tipo: 'VIGILANCIA', dorm: null });
        checkerCaseta = await insertAccount({ matricula: String(b + 7), tipo: 'VIGILANCIA', dorm: null });

        await createOrReactivateGrant({ idLogin: checkerDormA.IdLogin, tipo: 'Dormitorio', idDormitorio: DORM_A, scope: 'AMBOS', vigencia: 'PERMANENTE', asignadoPor: preA.IdLogin });
        await createOrReactivateGrant({ idLogin: checkerCaseta.IdLogin, tipo: 'Caseta', idDormitorio: null, scope: 'AMBOS', vigencia: 'PERMANENTE', asignadoPor: preA.IdLogin });

        // Documentos de alumnoA (dorm A): reglamento(1), convenio(5), INE(7) -> PDF; foto(6) -> PNG.
        const rA = await crearDocConArchivo({ idLogin: alumnoA.IdLogin, idDocumento: 1, ext: 'pdf', bytes: PDF });
        id.A_reglamento = rA.idDoctos; bytesReglamentoA = rA.bytes;
        id.A_convenio = (await crearDocConArchivo({ idLogin: alumnoA.IdLogin, idDocumento: 5, ext: 'pdf', bytes: PDF })).idDoctos;
        id.A_ine = (await crearDocConArchivo({ idLogin: alumnoA.IdLogin, idDocumento: 7, ext: 'pdf', bytes: PDF })).idDoctos;
        id.A_foto = (await crearDocConArchivo({ idLogin: alumnoA.IdLogin, idDocumento: 6, ext: 'png', bytes: PNG })).idDoctos;
        // Documentos de alumnoB (dorm B): foto(6) + INE(7).
        id.B_foto = (await crearDocConArchivo({ idLogin: alumnoB.IdLogin, idDocumento: 6, ext: 'png', bytes: PNG })).idDoctos;
        id.B_ine = (await crearDocConArchivo({ idLogin: alumnoB.IdLogin, idDocumento: 7, ext: 'pdf', bytes: PDF })).idDoctos;
        // Fila con metadata pero sin binario físico.
        id.A_missing = await crearDocSinArchivo({ idLogin: alumnoA.IdLogin, idDocumento: 1 });

        tAlumnoA = generateAccessToken(alumnoA); tAlumnoB = generateAccessToken(alumnoB);
        tPreA = generateAccessToken(preA); tPreB = generateAccessToken(preB);
        tEmpleado = generateAccessToken(empleado); tVigilante = generateAccessToken(vigilante);
        tCheckerDormA = generateAccessToken(checkerDormA); tCheckerCaseta = generateAccessToken(checkerCaseta);
    });

    afterAll(async () => {
        for (const abs of archivos) { try { fs.unlinkSync(abs); } catch { /* ya no existe */ } }
        for (const x of doctos) await pool.request().input('id', sql.Int, x).query('DELETE FROM UNIPASS.Doctos WHERE IdDoctos=@id');
        for (const x of cuentas) await pool.request().input('id', sql.Int, x).query('DELETE FROM UNIPASS.CheckerGrant WHERE IdLogin=@id OR AsignadoPor=@id');
        for (const x of cuentas) await pool.request().input('id', sql.Int, x).query('DELETE FROM UNIPASS.LoginUniPass WHERE IdLogin=@id');
        await pool?.close();
    });

    // ===== §18 auth básico =====
    it('sin token -> 401', async () => expect((await getBin(`/files/${id.A_reglamento}`)).status).toBe(401));
    it('idDoctos inválido -> 400', async () => expect((await getBin('/files/abc', tAlumnoA)).status).toBe(400));
    it('IdDoctos inexistente -> 404 FILE_NOT_FOUND', async () => {
        const r = await getBin('/files/999999999', tAlumnoA);
        expect(r.status).toBe(404); expect(r.body.toString()).toContain('FILE_NOT_FOUND');
    });

    // ===== §19 SELF (con verificación de CONTENIDO) =====
    it('ALUMNO owner: reglamento(1) -> 200 y bytes exactos', async () => {
        const r = await getBin(`/files/${id.A_reglamento}`, tAlumnoA);
        expect(r.status).toBe(200);
        expect(Buffer.compare(r.body, bytesReglamentoA)).toBe(0); // contenido, no solo status
    });
    it('ALUMNO owner: convenio(5), INE(7), foto(6) -> 200', async () => {
        expect((await getBin(`/files/${id.A_convenio}`, tAlumnoA)).status).toBe(200);
        expect((await getBin(`/files/${id.A_ine}`, tAlumnoA)).status).toBe(200);
        expect((await getBin(`/files/${id.A_foto}`, tAlumnoA)).status).toBe(200);
    });
    it('ALUMNO A intenta IdDoctos de B -> 403', async () => {
        const r = await getBin(`/files/${id.B_ine}`, tAlumnoA);
        expect(r.status).toBe(403);
    });

    // ===== §20 PRECEPTOR =====
    it('PRECEPTOR mismo dorm: doc privado (INE) -> 200; foto -> 200', async () => {
        expect((await getBin(`/files/${id.A_ine}`, tPreA)).status).toBe(200);
        expect((await getBin(`/files/${id.A_foto}`, tPreA)).status).toBe(200);
    });
    it('PRECEPTOR otro dorm: doc de A -> 403 (reglamento y foto)', async () => {
        expect((await getBin(`/files/${id.A_reglamento}`, tPreB)).status).toBe(403);
        expect((await getBin(`/files/${id.A_foto}`, tPreB)).status).toBe(403);
    });

    // ===== §21 CHECKER: SOLO foto, nunca documentos privados =====
    it('CHECKER grant Dormitorio A: foto de A -> 200', async () => {
        expect((await getBin(`/files/${id.A_foto}`, tCheckerDormA)).status).toBe(200);
    });
    it('CHECKER grant Dormitorio A: foto de B (fuera de scope) -> 403', async () => {
        expect((await getBin(`/files/${id.B_foto}`, tCheckerDormA)).status).toBe(403);
    });
    it('CHECKER Caseta (global): foto de A y de B -> 200', async () => {
        expect((await getBin(`/files/${id.A_foto}`, tCheckerCaseta)).status).toBe(200);
        expect((await getBin(`/files/${id.B_foto}`, tCheckerCaseta)).status).toBe(200);
    });
    it('CHECKER con grant válido NO puede documentos privados del mismo alumno: INE(7), Convenio(5), Reglamento(1) -> 403', async () => {
        expect((await getBin(`/files/${id.A_ine}`, tCheckerDormA)).status).toBe(403);
        expect((await getBin(`/files/${id.A_convenio}`, tCheckerDormA)).status).toBe(403);
        expect((await getBin(`/files/${id.A_reglamento}`, tCheckerDormA)).status).toBe(403);
        // ni siquiera el checker Caseta (global) abre documentos privados
        expect((await getBin(`/files/${id.A_ine}`, tCheckerCaseta)).status).toBe(403);
    });

    // ===== §22 otros roles =====
    it('EMPLEADO -> documento ajeno -> 403', async () => {
        expect((await getBin(`/files/${id.A_ine}`, tEmpleado)).status).toBe(403);
    });
    it('VIGILANCIA sin CheckerGrant -> foto y documento -> 403', async () => {
        expect((await getBin(`/files/${id.A_foto}`, tVigilante)).status).toBe(403);
        expect((await getBin(`/files/${id.A_ine}`, tVigilante)).status).toBe(403);
    });

    // ===== §24 headers / §13 no redirect / §14 no path =====
    it('PDF -> Content-Type application/pdf; PNG -> image/png', async () => {
        expect((await getBin(`/files/${id.A_ine}`, tAlumnoA)).headers['content-type']).toContain('application/pdf');
        expect((await getBin(`/files/${id.A_foto}`, tAlumnoA)).headers['content-type']).toContain('image/png');
    });
    it('Cache-Control incluye private y no-store; Content-Disposition inline', async () => {
        const r = await getBin(`/files/${id.A_reglamento}`, tAlumnoA);
        expect(r.headers['cache-control']).toContain('private');
        expect(r.headers['cache-control']).toContain('no-store');
        expect(r.headers['content-disposition']).toContain('inline');
    });
    it('no redirige (no 3xx, sin Location) y no filtra path físico', async () => {
        const r = await getBin(`/files/${id.A_reglamento}`, tAlumnoA);
        expect(r.status).toBe(200);
        expect(r.headers['location']).toBeUndefined();
        // el cuerpo son bytes del pdf, nunca un JSON con "/uploads" ni "path"
        expect(r.body.toString('utf8', 0, 8)).toBe('%PDF-1.4');
    });

    // ===== §25 metadata existe pero archivo físico no =====
    it('fila existe + binario ausente -> 404 FILE_NOT_FOUND (sin 500/stack)', async () => {
        const r = await getBin(`/files/${id.A_missing}`, tAlumnoA);
        expect(r.status).toBe(404);
        expect(r.body.toString()).toContain('FILE_NOT_FOUND');
    });
});
