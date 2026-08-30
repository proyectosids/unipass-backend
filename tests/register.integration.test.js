// P0 hardening de POST /register. DB real (requireCapability consulta capabilities y
// el alta exitosa inserta una fila -> se limpia). Tokens generados en el test.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import sql from 'mssql';
import 'dotenv/config';
import app from '../src/app.js';
import { generateAccessToken } from '../src/util/tokens.js';

const hasDb = !!process.env.DB_SERVER;
const d = hasDb ? describe : describe.skip;

d('P0 POST /register (integración)', () => {
    let pool, tAdmin, tAlumno, tPreceptor, tVigilancia, tSupervisor;
    const matriculaNueva = 'RGT' + String(Date.now()).slice(-6); // única, <=10 chars

    beforeAll(async () => {
        pool = await sql.connect({
            user: process.env.DB_USER, password: process.env.DB_PASSWORD, server: process.env.DB_SERVER, database: process.env.DB_DATABASE,
            options: { encrypt: process.env.DB_ENCRYPT === 'true', trustServerCertificate: process.env.DB_TRUST_CERT === 'true' }
        });
        const tok = async (q) => {
            const u = (await pool.request().query(q)).recordset[0];
            return u ? generateAccessToken(u) : null;
        };
        tAdmin = await tok("SELECT TOP 1 * FROM UNIPASS.LoginUniPass WHERE TipoUser='ADMINISTRATIVO'");
        tAlumno = await tok("SELECT TOP 1 * FROM UNIPASS.LoginUniPass WHERE TipoUser='ALUMNO'");
        tPreceptor = await tok("SELECT TOP 1 * FROM UNIPASS.LoginUniPass WHERE TipoUser='PRECEPTOR'");
        tVigilancia = await tok("SELECT TOP 1 * FROM UNIPASS.LoginUniPass WHERE TipoUser='VIGILANCIA'");
        // SUPERVISOR = cuenta con CheckerGrant Capability='SUPERVISOR' vigente.
        tSupervisor = await tok("SELECT TOP 1 L.* FROM UNIPASS.LoginUniPass L JOIN UNIPASS.CheckerGrant g ON g.IdLogin=L.IdLogin WHERE g.Capability='SUPERVISOR' AND g.Activo=1");
    });

    afterAll(async () => {
        await pool.request().input('m', sql.VarChar, matriculaNueva).query('DELETE FROM UNIPASS.LoginUniPass WHERE Matricula=@m');
        await pool?.close();
    });

    const body = (over = {}) => ({
        Matricula: matriculaNueva, 'Contraseña': 'AltaSegura123', Correo: 'nuevo@ulv.edu.mx',
        Nombre: 'Test', Apellidos: 'Alta', TipoUser: 'ALUMNO', Sexo: 'M',
        FechaNacimiento: '2004-01-01', Celular: '9610000000', Dormitorio: 4, ...over
    });
    const post = (token, b) => request(app).post('/register').set('Authorization', `Bearer ${token}`).send(b);

    it('ALUMNO -> 403', async () => expect((await post(tAlumno, body())).status).toBe(403));
    it('PRECEPTOR -> 403', async () => expect((await post(tPreceptor, body())).status).toBe(403));
    it('VIGILANCIA -> 403', async () => expect((await post(tVigilancia, body())).status).toBe(403));
    it('SUPERVISOR -> 403 (no es ADMIN)', async () => {
        expect(tSupervisor).toBeTruthy();
        expect((await post(tSupervisor, body())).status).toBe(403);
    });

    it('ADMIN + TipoUser ADMINISTRATIVO -> 403 TIPOUSER_NOT_ALLOWED (no se pueden acuñar admins)', async () => {
        const res = await post(tAdmin, body({ TipoUser: 'ADMINISTRATIVO' }));
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('TIPOUSER_NOT_ALLOWED');
    });
    it('ADMIN + TipoUser DEPARTAMENTO -> 400 DEPARTAMENTO_RETIRED', async () => {
        const res = await post(tAdmin, body({ TipoUser: 'DEPARTAMENTO' }));
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('DEPARTAMENTO_RETIRED');
    });

    it('ADMIN + TipoUser permitido (ALUMNO) -> 201 y respuesta SIN datos sensibles', async () => {
        const res = await post(tAdmin, body({ TipoUser: 'ALUMNO' }));
        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('IdLogin');
        // saneo: sin hash, sin TokenCFM, sin tokens
        expect(res.body).not.toHaveProperty('Contraseña');
        expect(res.body).not.toHaveProperty('TokenCFM');
        expect(res.body).not.toHaveProperty('accessToken');
        expect(res.body).not.toHaveProperty('refreshToken');
    });

    it('ESCALADA CERRADA: anónimo -> register ADMINISTRATIVO -> 401 y NO crea la cuenta', async () => {
        const mat = 'ANON' + String(Date.now()).slice(-5);
        const res = await request(app).post('/register').send(body({ Matricula: mat, TipoUser: 'ADMINISTRATIVO' }));
        expect(res.status).toBe(401);
        const creada = (await pool.request().input('m', sql.VarChar, mat).query('SELECT IdLogin FROM UNIPASS.LoginUniPass WHERE Matricula=@m')).recordset;
        expect(creada).toHaveLength(0); // no existe -> no hay login posible -> no hay ADMIN
    });
});
