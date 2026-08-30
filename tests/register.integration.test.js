// Autoregistro seguro (OTP -> registrationToken -> alta con datos de ULV). Proveedor OTP y
// ULV MOCKEADOS; DB real (RegistrationToken/LoginUniPass). Cuentas de prueba se limpian.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import sql from 'mssql';
import crypto from 'crypto';
import 'dotenv/config';

vi.mock('../src/services/ulvApiService.js', () => {
    class UlvApiError extends Error { constructor(c) { super(c); this.code = c; } }
    // getPreceptor por defecto: nadie es preceptor (el empleado cae en EMPLEADO).
    return { UlvApiError, getPersonData: vi.fn(), getPreceptor: vi.fn().mockResolvedValue(null) };
});
vi.mock('../src/services/otpProviderService.js', () => {
    class OtpProviderError extends Error { constructor(c) { super(c); this.code = c; } }
    return { OtpProviderError, sendVerificationOtp: vi.fn().mockResolvedValue(true), verifyOtp: vi.fn().mockResolvedValue(true) };
});

import * as ulv from '../src/services/ulvApiService.js';
import * as otpProvider from '../src/services/otpProviderService.js';
import { resetRegistrationRateLimits } from '../src/controllers/register.controller.js';
import app from '../src/app.js';

const hasDb = !!process.env.DB_SERVER;
const d = hasDb ? describe : describe.skip;
const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');

d('Autoregistro seguro (integración)', () => {
    let pool;
    const creados = new Set();     // matrículas con USUARIO creado -> borrar LoginUniPass + token
    const tokensSeed = new Set();  // matrículas con TOKEN sembrado/emitido -> borrar solo token
    const ALUMNO = (mat) => ({ type: 'ALUMNO', matricula: mat, correo: `${mat}@ulv.edu.mx`, nombre: 'REAL', apellidos: 'ULV', sexo: 'M', fechaNacimiento: '2004-01-01', celular: '9610000000', residencia: 'INTERNO', nivelEducativo: 'UNIVERSITARIO' });
    const EMPLEADO = (mat) => ({ type: 'EMPLEADO', matricula: mat, correo: `${mat}@ulv.edu.mx`, nombre: 'EMP', apellidos: 'ULV', sexo: 'F', fechaNacimiento: '1990-01-01', celular: '9610000001', departamento: 'SEGURIDAD INSTITUCIONAL', idDepartamento: 302 });

    beforeAll(async () => {
        pool = await sql.connect({
            user: process.env.DB_USER, password: process.env.DB_PASSWORD, server: process.env.DB_SERVER, database: process.env.DB_DATABASE,
            options: { encrypt: process.env.DB_ENCRYPT === 'true', trustServerCertificate: process.env.DB_TRUST_CERT === 'true' }
        });
    });
    afterAll(async () => {
        // Solo se borra LoginUniPass de cuentas creadas por las pruebas (nunca cuentas reales
        // como 221068). Los tokens de prueba se borran para todas las matrículas involucradas.
        for (const m of creados) {
            await pool.request().input('m', sql.VarChar, m).query('DELETE FROM UNIPASS.LoginUniPass WHERE Matricula=@m');
        }
        for (const m of new Set([...creados, ...tokensSeed])) {
            await pool.request().input('m', sql.VarChar, m).query('DELETE FROM UNIPASS.RegistrationToken WHERE Matricula=@m');
        }
        await pool?.close();
    });
    beforeEach(() => vi.clearAllMocks());

    let seq = 0;
    const matUnica = () => 'RG' + String(++seq).padStart(6, '0'); // <=10 chars, único
    // Emite un registrationToken válido vía verify-otp (persona mockeada).
    const getToken = async (mat, persona) => {
        ulv.getPersonData.mockResolvedValue(persona);
        otpProvider.verifyOtp.mockResolvedValue(true);
        const r = await request(app).post('/register/verify-otp').send({ matricula: mat, otp: '1234' });
        tokensSeed.add(mat);
        return r.body.registrationToken;
    };
    // Inserta un registrationToken directo (para casos borde) con hash conocido.
    const seedToken = async ({ matricula, correo = 'x@ulv.edu.mx', expiraEnMs = 10 * 60 * 1000, usado = false }) => {
        tokensSeed.add(matricula);
        const token = crypto.randomBytes(16).toString('hex');
        await pool.request()
            .input('m', sql.VarChar(10), matricula).input('c', sql.VarChar(80), correo)
            .input('h', sql.NVarChar(128), sha256(token))
            .input('exp', sql.DateTime, new Date(Date.now() + expiraEnMs))
            .input('u', sql.DateTime, usado ? new Date() : null)
            .query('INSERT INTO UNIPASS.RegistrationToken (Matricula,CorreoInstitucional,TokenHash,ExpiraEn,UsadoEn) VALUES (@m,@c,@h,@exp,@u)');
        return token;
    };

    // ---- verify-otp ----
    it('OTP correcto -> registrationToken', async () => {
        const mat = matUnica();
        const t = await getToken(mat, ALUMNO(mat));
        expect(typeof t).toBe('string');
        creados.add(mat);
    });
    it('OTP incorrecto -> 400 INVALID_OTP', async () => {
        const mat = matUnica();
        ulv.getPersonData.mockResolvedValue(ALUMNO(mat));
        otpProvider.verifyOtp.mockResolvedValue(false);
        const r = await request(app).post('/register/verify-otp').send({ matricula: mat, otp: '0000' });
        expect(r.status).toBe(400); expect(r.body.code).toBe('INVALID_OTP');
    });
    it('demasiados intentos -> 429 TOO_MANY_ATTEMPTS', async () => {
        const mat = matUnica();
        ulv.getPersonData.mockResolvedValue(ALUMNO(mat));
        otpProvider.verifyOtp.mockResolvedValue(false);
        let last;
        for (let i = 0; i < 6; i++) last = await request(app).post('/register/verify-otp').send({ matricula: mat, otp: '0000' });
        expect(last.status).toBe(429); expect(last.body.code).toBe('TOO_MANY_ATTEMPTS');
    });

    // ---- register: happy + derivación server-side ----
    it('ALUMNO: alta 201, Dormitorio resuelto server-side, respuesta saneada', async () => {
        const mat = matUnica(); creados.add(mat);
        const t = await getToken(mat, ALUMNO(mat));
        ulv.getPersonData.mockResolvedValue(ALUMNO(mat));
        const r = await request(app).post('/register').send({ Matricula: mat, 'Contraseña': 'AltaSegura123', registrationToken: t });
        expect(r.status).toBe(201);
        expect(r.body.TipoUser).toBe('ALUMNO');
        expect(r.body.Dormitorio).toBe(4); // M + UNIVERSITARIO -> Bedroom 4 (interno)
        expect(r.body).not.toHaveProperty('Contraseña');
        expect(r.body).not.toHaveProperty('TokenCFM');
    });

    // Caso A: ULV=ALUMNO, cliente manda ADMINISTRATIVO -> crea ALUMNO
    it('Caso A: cliente TipoUser=ADMINISTRATIVO ignorado -> ALUMNO', async () => {
        const mat = matUnica(); creados.add(mat);
        const t = await getToken(mat, ALUMNO(mat));
        ulv.getPersonData.mockResolvedValue(ALUMNO(mat));
        const r = await request(app).post('/register').send({ Matricula: mat, 'Contraseña': 'AltaSegura123', registrationToken: t, TipoUser: 'ADMINISTRATIVO' });
        expect(r.status).toBe(201); expect(r.body.TipoUser).toBe('ALUMNO');
        const row = (await pool.request().input('m', sql.VarChar, mat).query('SELECT TipoUser FROM UNIPASS.LoginUniPass WHERE Matricula=@m')).recordset[0];
        expect(row.TipoUser).toBe('ALUMNO');
    });
    // Caso B: ULV=EMPLEADO, cliente manda VIGILANCIA -> EMPLEADO
    it('Caso B: cliente TipoUser=VIGILANCIA ignorado -> EMPLEADO', async () => {
        const mat = matUnica(); creados.add(mat);
        const t = await getToken(mat, EMPLEADO(mat));
        ulv.getPersonData.mockResolvedValue(EMPLEADO(mat));
        const r = await request(app).post('/register').send({ Matricula: mat, 'Contraseña': 'AltaSegura123', registrationToken: t, TipoUser: 'VIGILANCIA' });
        expect(r.status).toBe(201); expect(r.body.TipoUser).toBe('EMPLEADO');
    });
    // Caso C: cliente Dormitorio=99 -> se ignora, se resuelve server-side
    it('Caso C: cliente Dormitorio ignorado -> resuelto server-side', async () => {
        const mat = matUnica(); creados.add(mat);
        const t = await getToken(mat, ALUMNO(mat));
        ulv.getPersonData.mockResolvedValue(ALUMNO(mat));
        const r = await request(app).post('/register').send({ Matricula: mat, 'Contraseña': 'AltaSegura123', registrationToken: t, Dormitorio: 99 });
        expect(r.status).toBe(201); expect(r.body.Dormitorio).toBe(4);
    });
    // Caso D: cliente Nombre/Correo ajenos -> se usan los de ULV
    it('Caso D: Nombre/Correo del cliente ignorados -> se usan los de ULV', async () => {
        const mat = matUnica(); creados.add(mat);
        const t = await getToken(mat, ALUMNO(mat));
        ulv.getPersonData.mockResolvedValue(ALUMNO(mat));
        const r = await request(app).post('/register').send({ Matricula: mat, 'Contraseña': 'AltaSegura123', registrationToken: t, Nombre: 'HACKER', Correo: 'otro@evil.com' });
        expect(r.status).toBe(201);
        expect(r.body.Nombre).toBe('REAL'); expect(r.body.Correo).toBe(`${mat}@ulv.edu.mx`);
    });

    // EMPLEADO normal (no coordinador/preceptor/vigilancia) -> EMPLEADO
    it('EMPLEADO normal (ni preceptor ni vigilancia) -> EMPLEADO', async () => {
        const mat = matUnica(); creados.add(mat);
        ulv.getPreceptor.mockResolvedValue(null); // no es preceptor de su depto
        const t = await getToken(mat, EMPLEADO(mat));
        ulv.getPersonData.mockResolvedValue(EMPLEADO(mat));
        const r = await request(app).post('/register').send({ Matricula: mat, 'Contraseña': 'AltaSegura123', registrationToken: t });
        expect(r.status).toBe(201); expect(r.body.TipoUser).toBe('EMPLEADO');
        expect(r.body.Dormitorio).toBeNull();
    });
    // ULV confirma que el empleado es el preceptor de su depto -> PRECEPTOR
    it('EMPLEADO que es preceptor de su depto -> PRECEPTOR', async () => {
        const mat = matUnica(); creados.add(mat);
        const t = await getToken(mat, EMPLEADO(mat));
        ulv.getPersonData.mockResolvedValue(EMPLEADO(mat));
        ulv.getPreceptor.mockResolvedValue({ 'ID JEFE': mat }); // su matrícula = jefe del depto
        const r = await request(app).post('/register').send({ Matricula: mat, 'Contraseña': 'AltaSegura123', registrationToken: t });
        expect(r.status).toBe(201); expect(r.body.TipoUser).toBe('PRECEPTOR');
    });
    // Correo institucional cambia entre OTP y registro -> rechazado (binding matrícula+correo)
    it('correo distinto entre OTP y registro -> 409 IDENTITY_MISMATCH', async () => {
        const mat = matUnica();
        const t = await getToken(mat, ALUMNO(mat)); // token ligado a `${mat}@ulv.edu.mx`
        ulv.getPersonData.mockResolvedValue({ ...ALUMNO(mat), correo: `cambiado@ulv.edu.mx` });
        const r = await request(app).post('/register').send({ Matricula: mat, 'Contraseña': 'AltaSegura123', registrationToken: t });
        expect(r.status).toBe(409); expect(r.body.code).toBe('IDENTITY_MISMATCH');
        // no debe haberse creado la cuenta
        const row = (await pool.request().input('m', sql.VarChar, mat).query('SELECT 1 FROM UNIPASS.LoginUniPass WHERE Matricula=@m')).recordset[0];
        expect(row).toBeUndefined();
    });

    // ---- register/otp: anti-spam ----
    it('spam /register/otp -> 429 sin revelar existencia', async () => {
        resetRegistrationRateLimits();
        const mat = matUnica();
        ulv.getPersonData.mockResolvedValue(null); // matrícula inexistente: aun así debe limitar
        let last;
        for (let i = 0; i < 6; i++) last = await request(app).post('/register/otp').send({ matricula: mat });
        expect(last.status).toBe(429); expect(last.body.code).toBe('TOO_MANY_ATTEMPTS');
        expect(String(last.body.message)).not.toMatch(/exist|registrad|encontr/i);
    });

    // ---- register: rechazos de token ----
    it('sin registrationToken -> 400 MISSING_FIELDS', async () => {
        const r = await request(app).post('/register').send({ Matricula: 'X', 'Contraseña': 'AltaSegura123' });
        expect(r.status).toBe(400); expect(r.body.code).toBe('MISSING_FIELDS');
    });
    it('token inválido -> 400 REGISTRATION_TOKEN_INVALID', async () => {
        ulv.getPersonData.mockResolvedValue(ALUMNO('X'));
        const r = await request(app).post('/register').send({ Matricula: 'X', 'Contraseña': 'AltaSegura123', registrationToken: 'no-existe' });
        expect(r.status).toBe(400); expect(r.body.code).toBe('REGISTRATION_TOKEN_INVALID');
    });
    it('token expirado -> 400 REGISTRATION_TOKEN_EXPIRED', async () => {
        const mat = matUnica();
        const t = await seedToken({ matricula: mat, expiraEnMs: -60000 });
        const r = await request(app).post('/register').send({ Matricula: mat, 'Contraseña': 'AltaSegura123', registrationToken: t });
        expect(r.status).toBe(400); expect(r.body.code).toBe('REGISTRATION_TOKEN_EXPIRED');
    });
    it('token ya usado -> 400 REGISTRATION_TOKEN_USED', async () => {
        const mat = matUnica();
        const t = await seedToken({ matricula: mat, usado: true });
        const r = await request(app).post('/register').send({ Matricula: mat, 'Contraseña': 'AltaSegura123', registrationToken: t });
        expect(r.status).toBe(400); expect(r.body.code).toBe('REGISTRATION_TOKEN_USED');
    });
    it('token de matrícula A usado para B -> 400 REGISTRATION_TOKEN_MISMATCH', async () => {
        const t = await seedToken({ matricula: 'AAA111' });
        const r = await request(app).post('/register').send({ Matricula: 'BBB222', 'Contraseña': 'AltaSegura123', registrationToken: t });
        expect(r.status).toBe(400); expect(r.body.code).toBe('REGISTRATION_TOKEN_MISMATCH');
    });
    it('reuso del token tras alta exitosa -> 400 REGISTRATION_TOKEN_USED', async () => {
        const mat = matUnica(); creados.add(mat);
        const t = await getToken(mat, ALUMNO(mat));
        ulv.getPersonData.mockResolvedValue(ALUMNO(mat));
        const r1 = await request(app).post('/register').send({ Matricula: mat, 'Contraseña': 'AltaSegura123', registrationToken: t });
        expect(r1.status).toBe(201);
        const r2 = await request(app).post('/register').send({ Matricula: mat, 'Contraseña': 'AltaSegura123', registrationToken: t });
        expect(r2.status).toBe(400); expect(r2.body.code).toBe('REGISTRATION_TOKEN_USED');
    });

    // ---- register: política y unicidad ----
    it('contraseña débil -> 400 WEAK_PASSWORD', async () => {
        const mat = matUnica();
        const t = await getToken(mat, ALUMNO(mat));
        const r = await request(app).post('/register').send({ Matricula: mat, 'Contraseña': 'corta', registrationToken: t });
        expect(r.status).toBe(400); expect(r.body.code).toBe('WEAK_PASSWORD');
    });
    it('cuenta ya registrada (matrícula existente) -> 409 USER_ALREADY_EXISTS', async () => {
        // matrícula 221068 (IdLogin 1) ya existe.
        const t = await seedToken({ matricula: '221068' });
        const r = await request(app).post('/register').send({ Matricula: '221068', 'Contraseña': 'AltaSegura123', registrationToken: t });
        expect(r.status).toBe(409); expect(r.body.code).toBe('USER_ALREADY_EXISTS');
    });
});
