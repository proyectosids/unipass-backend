// BOLA/IDOR R1-A - Contención de usuarios/credenciales/tokens. Unit del safe DTO (siempre) +
// integración (DB): /me SELF, /user/:Id y /userMatricula SELF-only, retiro de /buscarUser /userChecks
// /VerToken, y que ninguna respuesta serialice Contraseña/TokenCFM. No destructivo (cuenta desechable).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import sql from 'mssql';
import 'dotenv/config';
import app from '../src/app.js';
import { generateAccessToken } from '../src/util/tokens.js';
import { hashData } from '../src/util/hashData.js';
import { toSafeUser, SAFE_USER_FIELDS } from '../src/util/safeUser.js';
import { findTokenFCMByMatricula } from '../src/repositories/user.repo.js';

// ---- Unit: safe DTO (siempre corre, sin DB) ----
describe('toSafeUser (safe user projection)', () => {
    const full = {
        IdLogin: 9, Matricula: '123', Correo: 'a@ulv.edu.mx', Nombre: 'A', Apellidos: 'B', TipoUser: 'ALUMNO',
        Sexo: 'M', FechaNacimiento: '2000-01-01', Celular: '9610000000', StatusActividad: 1, Dormitorio: 4,
        IdCargoDelegado: null, Documentacion: 1,
        Contraseña: '$2b$10$hash', TokenCFM: 'fcm-secret-token'
    };
    it('excluye Contraseña y TokenCFM', () => {
        const safe = toSafeUser(full);
        expect(safe).not.toHaveProperty('Contraseña');
        expect(safe).not.toHaveProperty('TokenCFM');
    });
    it('solo incluye campos de la allowlist', () => {
        const safe = toSafeUser(full);
        expect(Object.keys(safe).every((k) => SAFE_USER_FIELDS.includes(k))).toBe(true);
        expect(safe.IdLogin).toBe(9);
    });
    it('no expone columnas nuevas desconocidas', () => {
        const safe = toSafeUser({ ...full, ColumnaNueva: 'secreto' });
        expect(safe).not.toHaveProperty('ColumnaNueva');
    });
});

const hasDb = !!process.env.DB_SERVER;
const d = hasDb ? describe : describe.skip;

d('BOLA/IDOR R1-A (integración)', () => {
    let pool, actor = {}, tokenActor, OTRO_IDLOGIN = 1; // 221068 real (solo para 403, sin lectura)
    const PASS = 'LoginProbe123';

    beforeAll(async () => {
        pool = await sql.connect({
            user: process.env.DB_USER, password: process.env.DB_PASSWORD, server: process.env.DB_SERVER, database: process.env.DB_DATABASE,
            options: { encrypt: process.env.DB_ENCRYPT === 'true', trustServerCertificate: process.env.DB_TRUST_CERT === 'true' }
        });
        const mat = 'R1' + String(Date.now()).slice(-7);
        const hash = await hashData(PASS);
        const r = await pool.request()
            .input('m', sql.VarChar(10), mat).input('c', sql.VarChar(80), `${mat}@test.local`)
            .input('p', sql.VarChar(sql.MAX), hash).input('n', sql.VarChar(120), 'ACTOR').input('a', sql.VarChar(120), 'R1')
            .input('t', sql.VarChar(20), 'ALUMNO').input('s', sql.VarChar(15), 'M')
            .input('f', sql.DateTime, new Date('2000-01-01')).input('cel', sql.VarChar(15), '9610000000')
            .input('tok', sql.VarChar(sql.MAX), 'fcm-secret-de-prueba')
            .query(`INSERT INTO UNIPASS.LoginUniPass (Matricula,Contraseña,Correo,Nombre,Apellidos,TipoUser,Sexo,FechaNacimiento,Celular,StatusActividad,TokenCFM)
                    OUTPUT INSERTED.IdLogin AS IdLogin VALUES (@m,@p,@c,@n,@a,@t,@s,@f,@cel,1,@tok)`);
        actor = { IdLogin: r.recordset[0].IdLogin, Matricula: mat, Nombre: 'ACTOR', Apellidos: 'R1', TipoUser: 'ALUMNO', Dormitorio: null };
        tokenActor = generateAccessToken(actor);
    });
    afterAll(async () => {
        if (actor.IdLogin) {
            await pool.request().input('id', sql.Int, actor.IdLogin).query('DELETE FROM UNIPASS.RefreshToken WHERE IdLogin=@id'); // el test de login crea uno
            await pool.request().input('id', sql.Int, actor.IdLogin).query('DELETE FROM UNIPASS.LoginUniPass WHERE IdLogin=@id');
        }
        await pool?.close();
    });

    const sinSecretos = (body) => {
        expect(body).not.toHaveProperty('Contraseña');
        expect(body).not.toHaveProperty('TokenCFM');
    };

    // ---- /me ----
    it('GET /me sin token -> 401', async () => {
        expect((await request(app).get('/me')).status).toBe(401);
    });
    it('GET /me con token -> devuelve al propio usuario, sin hash/token, solo campos allowlist', async () => {
        const res = await request(app).get('/me').set('Authorization', `Bearer ${tokenActor}`);
        expect(res.status).toBe(200);
        expect(res.body.IdLogin).toBe(actor.IdLogin);
        sinSecretos(res.body);
        expect(Object.keys(res.body).every((k) => SAFE_USER_FIELDS.includes(k))).toBe(true);
    });
    it('GET /me ignora manipulación de query/path (identidad = token)', async () => {
        const res = await request(app).get(`/me?IdLogin=${OTRO_IDLOGIN}`).set('Authorization', `Bearer ${tokenActor}`).send({ IdLogin: OTRO_IDLOGIN });
        expect(res.status).toBe(200);
        expect(res.body.IdLogin).toBe(actor.IdLogin); // no el manipulado
    });

    // ---- legacy /user/:Id (SELF bridge) ----
    it('GET /user/:Id anónimo -> 401', async () => {
        expect((await request(app).get(`/user/${actor.IdLogin}`)).status).toBe(401);
    });
    it('GET /user/:Id de OTRO usuario -> 403 (no BOLA)', async () => {
        const res = await request(app).get(`/user/${OTRO_IDLOGIN}`).set('Authorization', `Bearer ${tokenActor}`);
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('FORBIDDEN_SELF_ONLY');
    });
    it('GET /user/:Id propio -> 200 sin hash/token', async () => {
        const res = await request(app).get(`/user/${actor.IdLogin}`).set('Authorization', `Bearer ${tokenActor}`);
        expect(res.status).toBe(200);
        sinSecretos(res.body);
    });

    // ---- /userMatricula SELF-only ----
    it('GET /userMatricula de OTRA matrícula -> 403', async () => {
        const res = await request(app).get('/userMatricula/221068').set('Authorization', `Bearer ${tokenActor}`);
        expect(res.status).toBe(403);
    });
    it('GET /userMatricula propia -> 200 sin hash/token', async () => {
        const res = await request(app).get(`/userMatricula/${actor.Matricula}`).set('Authorization', `Bearer ${tokenActor}`);
        expect(res.status).toBe(200);
        sinSecretos(res.body);
    });

    // ---- retirados -> 404 ----
    it('GET /buscarUser/:Nombre retirado -> 404 (anónimo)', async () => {
        expect((await request(app).get('/buscarUser/ACTOR')).status).toBe(404);
    });
    it('GET /userChecks/:Email retirado -> 404', async () => {
        expect((await request(app).get('/userChecks/x@ulv.edu.mx')).status).toBe(404);
    });
    it('GET /VerToken/:Matricula retirado -> 404 anónimo y con Bearer (nunca expone TokenCFM)', async () => {
        expect((await request(app).get(`/VerToken/${actor.Matricula}`)).status).toBe(404);
        expect((await request(app).get(`/VerToken/${actor.Matricula}`).set('Authorization', `Bearer ${tokenActor}`)).status).toBe(404);
    });

    // ---- FCM interno intacto ----
    it('resolución FCM interna sigue disponible server-side (findTokenFCMByMatricula)', async () => {
        const rows = await findTokenFCMByMatricula(actor.Matricula);
        expect(Array.isArray(rows)).toBe(true);
        expect(rows[0]?.TokenCFM).toBe('fcm-secret-de-prueba'); // resoluble internamente, nunca por HTTP
    });

    // ---- regresión: login ----
    it('POST /login funciona y NO serializa Contraseña/TokenCFM', async () => {
        const res = await request(app).post('/login').send({ Matricula: actor.Matricula, 'Contraseña': PASS });
        expect(res.status).toBe(200);
        expect(res.body.user.IdLogin).toBe(actor.IdLogin);
        sinSecretos(res.body.user);
        expect(res.body.accessToken).toBeTruthy();
    });
    it('PUT /TokenDispositivo sin token -> 401 (ruta intacta)', async () => {
        expect((await request(app).put(`/TokenDispositivo/${actor.Matricula}`).send({ TokenCFM: 'x' })).status).toBe(401);
    });
});
