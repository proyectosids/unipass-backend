// Task 7.3 D1-A - Contención crítica de escrituras documentales. Requiere DB. No destructivo (cuentas
// y Doctos desechables). notifyDocumentRejection/socket MOCKEADOS para aseverar el push post-commit.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import sql from 'mssql';
import 'dotenv/config';

vi.mock('../src/util/notifications.js', () => ({ notifyDocumentRejection: vi.fn().mockResolvedValue({ success: true }) }));
vi.mock('../src/util/socketHelpers.js', () => ({ emitToUser: vi.fn(), emitToEmpleado: vi.fn() }));

import { notifyDocumentRejection } from '../src/util/notifications.js';
import app from '../src/app.js';
import { generateAccessToken } from '../src/util/tokens.js';
import { hashData } from '../src/util/hashData.js';

const hasDb = !!process.env.DB_SERVER;
const d = hasDb ? describe : describe.skip;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

d('Task 7.3 D1-A - rechazo documental seguro (integración)', () => {
    let pool;
    let alumnoA = {}, alumnoB = {}, preA = {}, preB = {}, empleado = {};
    let tPreA, tPreB, tAlumnoA, tEmpleado;
    const DORM_A = 4, DORM_B = 3;
    const cuentas = new Set(), doctos = new Set();

    const insertAccount = async ({ matricula, tipo, dorm = null, token = null }) => {
        const hash = await hashData('x');
        const r = await pool.request()
            .input('m', sql.VarChar(10), matricula).input('c', sql.VarChar(80), `${matricula}@test.local`)
            .input('p', sql.VarChar(sql.MAX), hash).input('n', sql.VarChar(120), 'T').input('a', sql.VarChar(120), 'D1A')
            .input('t', sql.VarChar(20), tipo).input('s', sql.VarChar(15), 'M')
            .input('f', sql.DateTime, new Date('2000-01-01')).input('cel', sql.VarChar(15), '9610000000')
            .input('d', sql.Int, dorm).input('tok', sql.VarChar(sql.MAX), token)
            .query(`INSERT INTO UNIPASS.LoginUniPass (Matricula,Contraseña,Correo,Nombre,Apellidos,TipoUser,Sexo,FechaNacimiento,Celular,StatusActividad,Dormitorio,TokenCFM)
                    OUTPUT INSERTED.IdLogin AS IdLogin VALUES (@m,@p,@c,@n,@a,@t,@s,@f,@cel,1,@d,@tok)`);
        const row = { IdLogin: r.recordset[0].IdLogin, Matricula: matricula, TipoUser: tipo, Dormitorio: dorm };
        cuentas.add(row.IdLogin);
        return row;
    };
    const crearDoc = async ({ idLogin, idDocumento = 1, status = 'Pendiente' }) => {
        const r = await pool.request().input('idd', sql.Int, idDocumento).input('idl', sql.Int, idLogin).input('st', sql.VarChar, status)
            .input('arch', sql.VarChar, '/uploads/x.pdf')
            .query(`INSERT INTO UNIPASS.Doctos (IdDocumento, IdLogin, Archivo, StatusDoctos, StatusRevision)
                    OUTPUT INSERTED.IdDoctos AS IdDoctos VALUES (@idd,@idl,@arch,'Adjunto',@st)`);
        const id = r.recordset[0].IdDoctos; doctos.add(id); return id;
    };
    const statusDoc = async (idDoctos) => (await pool.request().input('id', sql.Int, idDoctos).query('SELECT StatusRevision, RechazadoPor FROM UNIPASS.Doctos WHERE IdDoctos=@id')).recordset[0];

    beforeAll(async () => {
        pool = await sql.connect({
            user: process.env.DB_USER, password: process.env.DB_PASSWORD, server: process.env.DB_SERVER, database: process.env.DB_DATABASE,
            options: { encrypt: process.env.DB_ENCRYPT === 'true', trustServerCertificate: process.env.DB_TRUST_CERT === 'true' }
        });
        const b = Number(String(Date.now()).slice(-7));
        alumnoA = await insertAccount({ matricula: String(b), tipo: 'ALUMNO', dorm: DORM_A, token: 'fcm-a' });
        alumnoB = await insertAccount({ matricula: String(b + 1), tipo: 'ALUMNO', dorm: DORM_B });
        preA = await insertAccount({ matricula: String(b + 2), tipo: 'PRECEPTOR', dorm: DORM_A });
        preB = await insertAccount({ matricula: String(b + 3), tipo: 'PRECEPTOR', dorm: DORM_B });
        empleado = await insertAccount({ matricula: String(b + 4), tipo: 'EMPLEADO', dorm: DORM_A });
        tPreA = generateAccessToken(preA); tPreB = generateAccessToken(preB);
        tAlumnoA = generateAccessToken(alumnoA); tEmpleado = generateAccessToken(empleado);
    });
    afterAll(async () => {
        for (const id of doctos) {
            await pool.request().input('id', sql.NVarChar(40), String(id)).query("DELETE FROM UNIPASS.AuditLog WHERE Recurso='Doctos' AND RecursoId=@id");
            await pool.request().input('id', sql.Int, id).query('DELETE FROM UNIPASS.Doctos WHERE IdDoctos=@id');
        }
        for (const id of cuentas) await pool.request().input('id', sql.Int, id).query('DELETE FROM UNIPASS.LoginUniPass WHERE IdLogin=@id');
        await pool?.close();
    });

    const reject = (idDoctos, body, token) => {
        const r = request(app).put(`/documents/${idDoctos}/reject`);
        if (token) r.set('Authorization', `Bearer ${token}`);
        return r.send(body);
    };

    // statusRevision retirado
    it('PUT /statusRevision/:Id retirado -> 404 (con y sin token)', async () => {
        expect((await request(app).put(`/statusRevision/${alumnoA.IdLogin}`).send({ IdDocumento: 1 })).status).toBe(404);
        expect((await request(app).put(`/statusRevision/${alumnoA.IdLogin}`).set('Authorization', `Bearer ${tPreA}`).send({ IdDocumento: 1 })).status).toBe(404);
    });

    // nuevo reject: gates
    it('sin token -> 401', async () => {
        const id = await crearDoc({ idLogin: alumnoA.IdLogin });
        expect((await reject(id, { motivo: 'X' }, null)).status).toBe(401);
    });
    it('ALUMNO -> 403 FORBIDDEN_DOCUMENT_REVIEWER', async () => {
        const id = await crearDoc({ idLogin: alumnoA.IdLogin });
        const r = await reject(id, { motivo: 'X' }, tAlumnoA);
        expect(r.status).toBe(403); expect(r.body.code).toBe('FORBIDDEN_DOCUMENT_REVIEWER');
    });
    it('EMPLEADO -> 403 (revisor solo PRECEPTOR)', async () => {
        const id = await crearDoc({ idLogin: alumnoA.IdLogin });
        expect((await reject(id, { motivo: 'X' }, tEmpleado)).status).toBe(403);
    });
    it('PRECEPTOR de otro dormitorio -> 403 FORBIDDEN_DOCUMENT_SCOPE', async () => {
        const id = await crearDoc({ idLogin: alumnoA.IdLogin }); // alumno dorm A
        const r = await reject(id, { motivo: 'X' }, tPreB); // preceptor dorm B
        expect(r.status).toBe(403); expect(r.body.code).toBe('FORBIDDEN_DOCUMENT_SCOPE');
        expect((await statusDoc(id)).StatusRevision).toBe('Pendiente'); // sin cambio
    });
    it('PRECEPTOR mismo dorm + Pendiente -> 200 Rechazado; RechazadoPor = matrícula del token (no del body)', async () => {
        const id = await crearDoc({ idLogin: alumnoA.IdLogin });
        const r = await reject(id, { motivo: 'DOCUMENTO_ILEGIBLE', comentario: 'c', MatriculaPreceptor: '999999', IdLogin: alumnoB.IdLogin }, tPreA);
        expect(r.status).toBe(200); expect(r.body.StatusRevision).toBe('Rechazado');
        const row = await statusDoc(id);
        expect(row.StatusRevision).toBe('Rechazado');
        expect(String(row.RechazadoPor)).toBe(String(preA.Matricula)); // actor del token, NO el 999999 forjado
    });
    it('documento inexistente -> 404 DOCUMENT_NOT_FOUND', async () => {
        const r = await reject(999999999, { motivo: 'X' }, tPreA);
        expect(r.status).toBe(404); expect(r.body.code).toBe('DOCUMENT_NOT_FOUND');
    });
    it('Rechazado -> Rechazado -> 409 INVALID_DOCUMENT_TRANSITION', async () => {
        const id = await crearDoc({ idLogin: alumnoA.IdLogin, status: 'Rechazado' });
        const r = await reject(id, { motivo: 'X' }, tPreA);
        expect(r.status).toBe(409); expect(r.body.code).toBe('INVALID_DOCUMENT_TRANSITION');
    });
    it('Aprobado -> Rechazado -> 409', async () => {
        const id = await crearDoc({ idLogin: alumnoA.IdLogin, status: 'Aprobado' });
        expect((await reject(id, { motivo: 'X' }, tPreA)).status).toBe(409);
    });
    it('AuditLog DOCUMENT_REJECT con actor = token real', async () => {
        const id = await crearDoc({ idLogin: alumnoA.IdLogin });
        await reject(id, { motivo: 'X' }, tPreA);
        const a = (await pool.request().input('id', sql.NVarChar(40), String(id)).query("SELECT TOP 1 ActorIdLogin, ActorMatricula, Accion FROM UNIPASS.AuditLog WHERE Recurso='Doctos' AND RecursoId=@id ORDER BY Id DESC")).recordset[0];
        expect(a.ActorIdLogin).toBe(preA.IdLogin);
        expect(String(a.ActorMatricula)).toBe(String(preA.Matricula));
        expect(a.Accion).toBe('DOCUMENT_REJECT');
    });
    it('rechazo válido dispara FCM/socket post-commit (best-effort)', async () => {
        notifyDocumentRejection.mockClear();
        const id = await crearDoc({ idLogin: alumnoA.IdLogin });
        await reject(id, { motivo: 'X' }, tPreA);
        for (let i = 0; i < 20 && notifyDocumentRejection.mock.calls.length === 0; i++) await wait(25);
        expect(notifyDocumentRejection).toHaveBeenCalled();
    });

    // ---- RETIRO DEFINITIVO de bridges legacy (D1-C2) -> 404 (con y sin Bearer) ----
    it('PUT /doctosMul/reject/:Id retirado -> 404 sin token y con PRECEPTOR; no cambia el documento', async () => {
        const id = await crearDoc({ idLogin: alumnoA.IdLogin, idDocumento: 5 });
        expect((await request(app).put(`/doctosMul/reject/${alumnoA.IdLogin}`).send({ IdDocumento: 5, Motivo: 'X', MatriculaPreceptor: '999999' })).status).toBe(404);
        expect((await request(app).put(`/doctosMul/reject/${alumnoA.IdLogin}`).set('Authorization', `Bearer ${tPreA}`).send({ IdDocumento: 5, Motivo: 'X' })).status).toBe(404);
        expect((await statusDoc(id)).StatusRevision).toBe('Pendiente'); // intacto
    });
    it('PUT /Documentacion/:Matricula retirado -> 404 (con y sin token); víctima intacta', async () => {
        const antes = (await pool.request().input('id', sql.Int, alumnoB.IdLogin).query('SELECT Documentacion FROM UNIPASS.LoginUniPass WHERE IdLogin=@id')).recordset[0].Documentacion;
        expect((await request(app).put(`/Documentacion/${alumnoB.Matricula}`).send({ StatusDoc: 1 })).status).toBe(404);
        expect((await request(app).put(`/Documentacion/${alumnoB.Matricula}`).set('Authorization', `Bearer ${tAlumnoA}`).send({ StatusDoc: 1 })).status).toBe(404);
        const despues = (await pool.request().input('id', sql.Int, alumnoB.IdLogin).query('SELECT Documentacion FROM UNIPASS.LoginUniPass WHERE IdLogin=@id')).recordset[0].Documentacion;
        expect(despues).toBe(antes);
    });
});
