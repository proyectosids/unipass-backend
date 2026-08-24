// Task 7.2 - regresión de ownership (integración, requiere DB). Cubre casos que la UI
// no puede generar. No destructivo: los 403 se bloquean ANTES de mutar y los 404 usan
// ids inexistentes; se generan tokens en el test (no se comparten por chat).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import sql from 'mssql';
import 'dotenv/config';
import app from '../src/app.js';
import { generateAccessToken } from '../src/util/tokens.js';

const hasDb = !!process.env.DB_SERVER;
const d = hasDb ? describe : describe.skip;

d('Task 7.2 ownership (integración)', () => {
    let pool, tokenA, tokenB, permisoDeA, doctoDeA;
    const ID_INEXISTENTE = 99999999;

    beforeAll(async () => {
        pool = await sql.connect({
            user: process.env.DB_USER, password: process.env.DB_PASSWORD,
            server: process.env.DB_SERVER, database: process.env.DB_DATABASE,
            options: { encrypt: process.env.DB_ENCRYPT === 'true', trustServerCertificate: process.env.DB_TRUST_CERT === 'true' }
        });
        const getUser = async (id) => (await pool.request().input('id', sql.Int, id)
            .query('SELECT IdLogin, Matricula, Nombre, Apellidos, TipoUser, Dormitorio FROM UNIPASS.LoginUniPass WHERE IdLogin=@id')).recordset[0];
        tokenA = generateAccessToken(await getUser(1));      // dueño
        tokenB = generateAccessToken(await getUser(2064));   // otro usuario
        permisoDeA = (await pool.request().query('SELECT TOP 1 IdPermission FROM UNIPASS.Permission WHERE IdUser=1 ORDER BY IdPermission DESC')).recordset[0]?.IdPermission;
        doctoDeA = (await pool.request().query('SELECT TOP 1 IdDoctos FROM UNIPASS.Doctos WHERE IdLogin=1 ORDER BY IdDoctos DESC')).recordset[0]?.IdDoctos;
    });

    afterAll(async () => { await pool?.close(); });

    it('PUT /permission/:Id de permiso ajeno -> 403 (bloqueado antes de cancelar)', async () => {
        expect(permisoDeA).toBeDefined();
        const res = await request(app).put(`/permission/${permisoDeA}`).set('Authorization', `Bearer ${tokenB}`).send({});
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('FORBIDDEN_OWNERSHIP');
    });

    it('PUT /permission/:Id inexistente -> 404', async () => {
        const res = await request(app).put(`/permission/${ID_INEXISTENTE}`).set('Authorization', `Bearer ${tokenA}`).send({});
        expect(res.status).toBe(404);
        expect(res.body.code).toBe('PERMISSION_NOT_FOUND');
    });

    it('DELETE /doctosMul con IdDoctos ajeno -> 403 (bloqueado antes de borrar)', async () => {
        expect(doctoDeA).toBeDefined();
        const res = await request(app).delete('/doctosMul/1').set('Authorization', `Bearer ${tokenB}`).send({ IdDoctos: doctoDeA });
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('FORBIDDEN_OWNERSHIP');
    });

    it('DELETE /doctosMul con documento inexistente -> 404', async () => {
        const res = await request(app).delete('/doctosMul/1').set('Authorization', `Bearer ${tokenA}`).send({ IdDoctos: ID_INEXISTENTE });
        expect(res.status).toBe(404);
        expect(res.body.code).toBe('DOC_NOT_FOUND');
    });

    // Task 7.1: no destructivo (falla en la verificación de 'actual', antes de actualizar).
    it('PUT /me/password con actual incorrecta -> 403 PASSWORD_MISMATCH', async () => {
        const res = await request(app).put('/me/password').set('Authorization', `Bearer ${tokenA}`)
            .send({ actual: 'contraseña-que-no-es', nueva: 'nuevaSegura123' });
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('PASSWORD_MISMATCH');
    });

    it('PUT /me/password sin campos -> 400 MISSING_FIELDS', async () => {
        const res = await request(app).put('/me/password').set('Authorization', `Bearer ${tokenA}`).send({});
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('MISSING_FIELDS');
    });
});
