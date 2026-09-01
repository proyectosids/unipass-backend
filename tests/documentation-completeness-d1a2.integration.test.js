// Task 7.3 D1-A.2 - Documentacion server-computed: matriz de requeridos (unit), evaluación de
// completitud, independencia de la columna (cache), recálculo por mutación y gate de POST /permission.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import sql from 'mssql';
import 'dotenv/config';
import app from '../src/app.js';
import { generateAccessToken } from '../src/util/tokens.js';
import { hashData } from '../src/util/hashData.js';
import { resolveRequiredDocumentIds } from '../src/util/documentRequirements.js';
import { evaluateDocumentation } from '../src/repositories/doctos.repo.js';

// ---- Unit: matriz de requeridos (siempre) ----
describe('resolveRequiredDocumentIds (matriz canónica D1-A.2)', () => {
    it('UNIVERSITARIO/M -> [1,5,7]', () => expect(resolveRequiredDocumentIds({ nivelDormitorio: 'UNIVERSITARIO', sexo: 'M' })).toEqual([1, 5, 7]));
    it('NIVEL MEDIO/M (Bachiller) -> [2,5,7]', () => expect(resolveRequiredDocumentIds({ nivelDormitorio: 'NIVEL MEDIO', sexo: 'M' })).toEqual([2, 5, 7]));
    it('UNIVERSITARIO/F -> [3,5,7]', () => expect(resolveRequiredDocumentIds({ nivelDormitorio: 'UNIVERSITARIO', sexo: 'F' })).toEqual([3, 5, 7]));
    it('NIVEL MEDIO/F -> [4,5,7]', () => expect(resolveRequiredDocumentIds({ nivelDormitorio: 'NIVEL MEDIO', sexo: 'F' })).toEqual([4, 5, 7]));
    it('nivel inválido -> null (unresolved)', () => expect(resolveRequiredDocumentIds({ nivelDormitorio: 'AMBOS', sexo: 'M' })).toBeNull());
    it('sexo inválido -> null (unresolved)', () => expect(resolveRequiredDocumentIds({ nivelDormitorio: 'UNIVERSITARIO', sexo: 'N' })).toBeNull());
});

const hasDb = !!process.env.DB_SERVER;
const d = hasDb ? describe : describe.skip;

d('Task 7.3 D1-A.2 (integración)', () => {
    let pool, alumno = {}, preA = {}, tAlumno, tPreA;
    const cuentas = new Set();

    const insertAccount = async ({ matricula, tipo, dorm, sexo = 'M' }) => {
        const hash = await hashData('x');
        const r = await pool.request()
            .input('m', sql.VarChar(10), matricula).input('c', sql.VarChar(80), `${matricula}@test.local`)
            .input('p', sql.VarChar(sql.MAX), hash).input('n', sql.VarChar(120), 'T').input('a', sql.VarChar(120), 'D1A2')
            .input('t', sql.VarChar(20), tipo).input('s', sql.VarChar(15), sexo)
            .input('f', sql.DateTime, new Date('2000-01-01')).input('cel', sql.VarChar(15), '9610000000').input('d', sql.Int, dorm)
            .query(`INSERT INTO UNIPASS.LoginUniPass (Matricula,Contraseña,Correo,Nombre,Apellidos,TipoUser,Sexo,FechaNacimiento,Celular,StatusActividad,Dormitorio)
                    OUTPUT INSERTED.IdLogin AS IdLogin VALUES (@m,@p,@c,@n,@a,@t,@s,@f,@cel,1,@d)`);
        const row = { IdLogin: r.recordset[0].IdLogin, Matricula: matricula, TipoUser: tipo, Dormitorio: dorm };
        cuentas.add(row.IdLogin);
        return row;
    };
    // Reemplaza los Doctos del alumno por la lista dada. Devuelve mapa idDoc->IdDoctos.
    const setDocs = async (lista) => {
        await pool.request().input('id', sql.Int, alumno.IdLogin).query('DELETE FROM UNIPASS.Doctos WHERE IdLogin=@id');
        const map = {};
        for (const { doc, status = 'Pendiente' } of lista) {
            const r = await pool.request().input('d', sql.Int, doc).input('l', sql.Int, alumno.IdLogin).input('st', sql.VarChar, status)
                .query("INSERT INTO UNIPASS.Doctos (IdDocumento,Archivo,StatusDoctos,IdLogin,StatusRevision) OUTPUT INSERTED.IdDoctos AS IdDoctos VALUES (@d,'/uploads/x.pdf','Adjunto',@l,@st)");
            map[doc] = r.recordset[0].IdDoctos;
        }
        return map;
    };
    const setDocumentacionCache = (v) => pool.request().input('id', sql.Int, alumno.IdLogin).input('v', sql.Int, v).query('UPDATE UNIPASS.LoginUniPass SET Documentacion=@v WHERE IdLogin=@id');
    const getDocumentacion = async () => (await pool.request().input('id', sql.Int, alumno.IdLogin).query('SELECT Documentacion FROM UNIPASS.LoginUniPass WHERE IdLogin=@id')).recordset[0].Documentacion;
    const countPerm = async () => (await pool.request().input('u', sql.Int, alumno.IdLogin).query('SELECT COUNT(*) n FROM UNIPASS.Permission WHERE IdUser=@u')).recordset[0].n;

    beforeAll(async () => {
        pool = await sql.connect({
            user: process.env.DB_USER, password: process.env.DB_PASSWORD, server: process.env.DB_SERVER, database: process.env.DB_DATABASE,
            options: { encrypt: process.env.DB_ENCRYPT === 'true', trustServerCertificate: process.env.DB_TRUST_CERT === 'true' }
        });
        const b = Number(String(Date.now()).slice(-7));
        alumno = await insertAccount({ matricula: String(b), tipo: 'ALUMNO', dorm: 4, sexo: 'M' }); // UNIVERSITARIO/M -> [1,5,7]
        preA = await insertAccount({ matricula: String(b + 1), tipo: 'PRECEPTOR', dorm: 4 });
        tAlumno = generateAccessToken(alumno); tPreA = generateAccessToken(preA);
    });
    afterAll(async () => {
        for (const id of cuentas) {
            await pool.request().input('id', sql.NVarChar(40), String(id)).query("DELETE FROM UNIPASS.AuditLog WHERE ActorIdLogin=@id OR (Recurso='Permission' AND RecursoId=@id)");
            await pool.request().input('id', sql.Int, id).query('DELETE FROM UNIPASS.Doctos WHERE IdLogin=@id');
        }
        // limpiar permisos creados por el alumno (gate-pass test)
        const perms = (await pool.request().input('u', sql.Int, alumno.IdLogin).query('SELECT IdPermission FROM UNIPASS.Permission WHERE IdUser=@u')).recordset;
        for (const p of perms) {
            await pool.request().input('id', sql.Int, p.IdPermission).query('DELETE FROM UNIPASS.CheckPoints WHERE IdPermission=@id');
            await pool.request().input('id', sql.Int, p.IdPermission).query('DELETE FROM UNIPASS.Authorize WHERE IdPermission=@id');
            await pool.request().input('id', sql.Int, p.IdPermission).query('DELETE FROM UNIPASS.Permission WHERE IdPermission=@id');
        }
        for (const id of cuentas) await pool.request().input('id', sql.Int, id).query('DELETE FROM UNIPASS.LoginUniPass WHERE IdLogin=@id');
        await pool?.close();
    });

    const evalAlumno = () => evaluateDocumentation(alumno.IdLogin);

    // ---- completitud (§19) ----
    it('tres correctos Pendiente -> complete', async () => { await setDocs([{ doc: 1 }, { doc: 5 }, { doc: 7 }]); expect((await evalAlumno()).complete).toBe(true); });
    it('mezcla Aprobado/Pendiente -> complete', async () => { await setDocs([{ doc: 1, status: 'Aprobado' }, { doc: 5 }, { doc: 7 }]); expect((await evalAlumno()).complete).toBe(true); });
    it('falta uno -> incomplete', async () => { await setDocs([{ doc: 1 }, { doc: 5 }]); const e = await evalAlumno(); expect(e.complete).toBe(false); expect(e.missing).toContain(7); });
    it('uno Rechazado -> incomplete', async () => { await setDocs([{ doc: 1 }, { doc: 5, status: 'Rechazado' }, { doc: 7 }]); const e = await evalAlumno(); expect(e.complete).toBe(false); expect(e.rejected).toContain(5); });
    it('reglamento equivocado (3 en vez de 1) +5+7 -> incomplete', async () => { await setDocs([{ doc: 3 }, { doc: 5 }, { doc: 7 }]); const e = await evalAlumno(); expect(e.complete).toBe(false); expect(e.missing).toContain(1); });
    it('documento 6 (perfil) no sustituye requerido', async () => { await setDocs([{ doc: 1 }, { doc: 5 }, { doc: 6 }]); expect((await evalAlumno()).complete).toBe(false); });
    it('documentos extra no afectan', async () => { await setDocs([{ doc: 1 }, { doc: 5 }, { doc: 7 }, { doc: 2 }, { doc: 6 }]); expect((await evalAlumno()).complete).toBe(true); });

    // la columna NO es autoridad (§19.14/15)
    it('Documentacion=1 stale pero falta requerido -> evaluate=false', async () => { await setDocs([{ doc: 1 }, { doc: 5 }]); await setDocumentacionCache(1); expect((await evalAlumno()).complete).toBe(false); });
    it('Documentacion=0 stale pero cumple -> evaluate=true', async () => { await setDocs([{ doc: 1 }, { doc: 5 }, { doc: 7 }]); await setDocumentacionCache(0); expect((await evalAlumno()).complete).toBe(true); });

    // ---- mutación recalcula la cache (§20) ----
    it('reject de requerido -> Documentacion 0 (atómico)', async () => {
        const map = await setDocs([{ doc: 1 }, { doc: 5 }, { doc: 7 }]); await setDocumentacionCache(1);
        const r = await request(app).put(`/documents/${map[5]}/reject`).set('Authorization', `Bearer ${tPreA}`).send({ motivo: 'X' });
        expect(r.status).toBe(200);
        expect(await getDocumentacion()).toBe(0);
    });
    it('delete de requerido -> Documentacion 0', async () => {
        const map = await setDocs([{ doc: 1 }, { doc: 5 }, { doc: 7 }]); await setDocumentacionCache(1);
        const r = await request(app).delete('/doctosMul/1').set('Authorization', `Bearer ${tAlumno}`).send({ IdDoctos: map[7] });
        expect(r.status).toBe(200);
        expect(await getDocumentacion()).toBe(0);
    });
    it('upload del último requerido (POST /doctosMul) -> Documentacion 1', async () => {
        await setDocs([{ doc: 1 }, { doc: 5 }]); await setDocumentacionCache(0);
        const r = await request(app).post('/doctosMul').set('Authorization', `Bearer ${tAlumno}`)
            .field('IdDocumento', 7).attach('Archivo', Buffer.from('%PDF-1.4 test'), 'x.pdf');
        expect(r.status).toBe(200);
        expect(await getDocumentacion()).toBe(1);
    });

    // ---- gate POST /permission (§21) ----
    it('documentación incompleta -> 409 DOCUMENTATION_INCOMPLETE, sin crear Permission', async () => {
        await setDocs([{ doc: 1 }, { doc: 5 }]); // falta 7
        const antes = await countPerm();
        const r = await request(app).post('/permission').set('Authorization', `Bearer ${tAlumno}`)
            .send({ FechaSolicitada: '2026-09-01T10:00:00', FechaSalida: '2026-09-02T09:00:00', FechaRegreso: '2026-09-02T18:00:00', Motivo: 'X', IdTipoSalida: 2 });
        expect(r.status).toBe(409); expect(r.body.code).toBe('DOCUMENTATION_INCOMPLETE');
        expect(await countPerm()).toBe(antes);
    });
    it('requerido Rechazado -> bloquea', async () => {
        await setDocs([{ doc: 1 }, { doc: 5, status: 'Rechazado' }, { doc: 7 }]);
        const r = await request(app).post('/permission').set('Authorization', `Bearer ${tAlumno}`)
            .send({ FechaSolicitada: '2026-09-01T10:00:00', FechaSalida: '2026-09-02T09:00:00', FechaRegreso: '2026-09-02T18:00:00', Motivo: 'X', IdTipoSalida: 2 });
        expect(r.status).toBe(409); expect(r.body.code).toBe('DOCUMENTATION_INCOMPLETE');
    });
    it('reglamento equivocado -> bloquea', async () => {
        await setDocs([{ doc: 3 }, { doc: 5 }, { doc: 7 }]); // necesita 1
        const r = await request(app).post('/permission').set('Authorization', `Bearer ${tAlumno}`)
            .send({ FechaSolicitada: '2026-09-01T10:00:00', FechaSalida: '2026-09-02T09:00:00', FechaRegreso: '2026-09-02T18:00:00', Motivo: 'X', IdTipoSalida: 2 });
        expect(r.status).toBe(409); expect(r.body.code).toBe('DOCUMENTATION_INCOMPLETE');
    });
    it('completo (aunque Documentacion=0 stale) -> PASA el gate (no 409 DOCUMENTATION_INCOMPLETE)', async () => {
        await setDocs([{ doc: 1 }, { doc: 5 }, { doc: 7 }]); await setDocumentacionCache(0);
        const r = await request(app).post('/permission').set('Authorization', `Bearer ${tAlumno}`)
            .send({ FechaSolicitada: '2026-09-01T10:00:00', FechaSalida: '2026-09-02T09:00:00', FechaRegreso: '2026-09-02T18:00:00', Motivo: 'X', IdTipoSalida: 2 });
        expect(r.body.code).not.toBe('DOCUMENTATION_INCOMPLETE'); // el gate no bloqueó (la columna stale no manda)
    });
});
