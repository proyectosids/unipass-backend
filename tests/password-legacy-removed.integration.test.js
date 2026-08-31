// P0 - Retiro de PUT /password/:Correo (cambio por correo arbitrario) + regresión de los flujos
// seguros. Requiere DB. NO destructivo sobre cuentas reales: crea DOS cuentas desechables (actor y
// víctima) y las elimina en afterAll. Confirma vía hash en BD que la contraseña objetivo NO cambia.
// No se loguea ninguna contraseña/hash/OTP/resetToken.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import sql from 'mssql';
import crypto from 'crypto';
import 'dotenv/config';
import app from '../src/app.js';
import { generateAccessToken } from '../src/util/tokens.js';
import { hashData, VerifyHashData } from '../src/util/hashData.js';

const hasDb = !!process.env.DB_SERVER;
const d = hasDb ? describe : describe.skip;

d('P0 PUT /password/:Correo retirado + flujos seguros (integración)', () => {
    let pool, tokenActor;
    const PASS_ACTOR = 'ActorSeguro123';
    const PASS_VICTIM = 'VictimSeguro123';
    let actor = {}, victim = {};
    let actorPass = PASS_ACTOR; // se actualiza tras un cambio exitoso

    const insertAccount = async ({ matricula, correo, pass, tipo = 'ALUMNO' }) => {
        const hash = await hashData(pass);
        const r = await pool.request()
            .input('m', sql.VarChar(10), matricula).input('c', sql.VarChar(80), correo)
            .input('p', sql.VarChar(sql.MAX), hash)
            .input('n', sql.VarChar(120), 'TEST').input('a', sql.VarChar(120), 'P0')
            .input('t', sql.VarChar(20), tipo).input('s', sql.VarChar(15), 'M')
            .input('f', sql.DateTime, new Date('2000-01-01')).input('cel', sql.VarChar(15), '9610000000')
            .query(`INSERT INTO UNIPASS.LoginUniPass (Matricula,Contraseña,Correo,Nombre,Apellidos,TipoUser,Sexo,FechaNacimiento,Celular,StatusActividad)
                    OUTPUT INSERTED.IdLogin AS IdLogin
                    VALUES (@m,@p,@c,@n,@a,@t,@s,@f,@cel,1)`);
        return { IdLogin: r.recordset[0].IdLogin, Matricula: matricula, Correo: correo, Nombre: 'TEST', Apellidos: 'P0', TipoUser: tipo, Dormitorio: null };
    };
    const hashOf = async (idLogin) => (await pool.request().input('id', sql.Int, idLogin)
        .query('SELECT Contraseña AS h FROM UNIPASS.LoginUniPass WHERE IdLogin=@id')).recordset[0]?.h;

    beforeAll(async () => {
        pool = await sql.connect({
            user: process.env.DB_USER, password: process.env.DB_PASSWORD, server: process.env.DB_SERVER, database: process.env.DB_DATABASE,
            options: { encrypt: process.env.DB_ENCRYPT === 'true', trustServerCertificate: process.env.DB_TRUST_CERT === 'true' }
        });
        const uniq = String(Date.now()).slice(-7);
        actor = await insertAccount({ matricula: 'PA' + uniq, correo: `pa${uniq}@test.local`, pass: PASS_ACTOR });
        victim = await insertAccount({ matricula: 'PV' + uniq, correo: `pv${uniq}@test.local`, pass: PASS_VICTIM });
        tokenActor = generateAccessToken(actor);
    });
    afterAll(async () => {
        for (const id of [actor.IdLogin, victim.IdLogin]) {
            if (!id) continue;
            await pool.request().input('id', sql.Int, id).query('DELETE FROM UNIPASS.PasswordReset WHERE IdLogin=@id');
            await pool.request().input('id', sql.Int, id).query('DELETE FROM UNIPASS.LoginUniPass WHERE IdLogin=@id');
        }
        await pool?.close();
    });

    // ---- endpoint legacy RETIRADO (ruta inexistente -> 404, nunca cambia contraseña) ----
    it('PUT /password/:Correo anónimo -> 404 y la contraseña de la víctima queda intacta', async () => {
        const before = await hashOf(victim.IdLogin);
        const res = await request(app).put(`/password/${encodeURIComponent(victim.Correo)}`).send({ NewPassword: 'Hackeada123' });
        expect(res.status).toBe(404);
        const after = await hashOf(victim.IdLogin);
        expect(after).toBe(before);
        expect(await VerifyHashData(PASS_VICTIM, after)).toBe(true); // sigue siendo la original
    });
    it('PUT /password/:Correo autenticado -> 404 (ruta retirada, no reemplazada por gating)', async () => {
        const before = await hashOf(victim.IdLogin);
        const res = await request(app).put(`/password/${encodeURIComponent(victim.Correo)}`)
            .set('Authorization', `Bearer ${tokenActor}`).send({ NewPassword: 'Hackeada123' });
        expect(res.status).toBe(404);
        expect(await hashOf(victim.IdLogin)).toBe(before);
    });
    it('PUT /password/:Correo con correo ajeno + body manipulado -> 404, víctima intacta', async () => {
        const before = await hashOf(victim.IdLogin);
        const res = await request(app).put(`/password/${encodeURIComponent(victim.Correo)}`)
            .set('Authorization', `Bearer ${tokenActor}`)
            .send({ NewPassword: 'Hackeada123', IdLogin: victim.IdLogin, Correo: victim.Correo });
        expect(res.status).toBe(404);
        expect(await hashOf(victim.IdLogin)).toBe(before);
    });

    // ---- cambio autenticado PUT /me/password ----
    it('PUT /me/password sin Bearer -> 401', async () => {
        const res = await request(app).put('/me/password').send({ actual: actorPass, nueva: 'NuevaActor123' });
        expect(res.status).toBe(401);
    });
    it('PUT /me/password contraseña débil -> 400 WEAK_PASSWORD', async () => {
        const res = await request(app).put('/me/password').set('Authorization', `Bearer ${tokenActor}`).send({ actual: actorPass, nueva: 'corta' });
        expect(res.status).toBe(400); expect(res.body.code).toBe('WEAK_PASSWORD');
    });
    it('PUT /me/password actual incorrecta -> 403 PASSWORD_MISMATCH', async () => {
        const res = await request(app).put('/me/password').set('Authorization', `Bearer ${tokenActor}`).send({ actual: 'no-es-la-actual', nueva: 'OtraValida123' });
        expect(res.status).toBe(403); expect(res.body.code).toBe('PASSWORD_MISMATCH');
    });
    it('PUT /me/password cambia SOLO la propia (ignora Correo/IdLogin del body); víctima intacta; anterior deja de servir', async () => {
        const victimBefore = await hashOf(victim.IdLogin);
        const nueva = 'NuevaActor123';
        const res = await request(app).put('/me/password').set('Authorization', `Bearer ${tokenActor}`)
            .send({ actual: actorPass, nueva, Correo: victim.Correo, IdLogin: victim.IdLogin });
        expect(res.status).toBe(200);
        // la víctima seleccionada por el body NO cambió
        expect(await hashOf(victim.IdLogin)).toBe(victimBefore);
        // la cuenta propia: nueva funciona, anterior ya no
        const actorHash = await hashOf(actor.IdLogin);
        expect(await VerifyHashData(nueva, actorHash)).toBe(true);
        expect(await VerifyHashData(actorPass, actorHash)).toBe(false);
        // la respuesta no filtra hash de contraseña
        expect(JSON.stringify(res.body || {})).not.toMatch(/\$2[aby]\$/);
        actorPass = nueva;
    });

    // ---- recuperación: aislamiento por identidad (resetToken ligado a IdLogin) ----
    it('recuperación: resetToken de una identidad solo cambia ESA cuenta (no se puede apuntar a otra)', async () => {
        const token = crypto.randomBytes(16).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        await pool.request().input('id', sql.Int, actor.IdLogin).input('h', sql.NVarChar(128), tokenHash)
            .input('exp', sql.DateTime, new Date(Date.now() + 600000))
            .query('INSERT INTO UNIPASS.PasswordReset (IdLogin, ResetTokenHash, ExpiraEn) VALUES (@id,@h,@exp)');
        const victimBefore = await hashOf(victim.IdLogin);
        const nueva = 'ResetActor123';
        const res = await request(app).post('/password/reset').send({ resetToken: token, nueva });
        expect(res.status).toBe(200);
        expect(await hashOf(victim.IdLogin)).toBe(victimBefore); // víctima intacta
        expect(await VerifyHashData(nueva, await hashOf(actor.IdLogin))).toBe(true);
        actorPass = nueva;
    });
});
