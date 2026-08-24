// Task 7.1.B - Integración de recuperación por MATRÍCULA. Proveedor OTP y fuente de email
// (API-ULV) MOCKEADOS; DB real (LoginUniPass, PasswordReset). No destructivo: el hash del
// usuario de prueba se guarda y se restaura.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import sql from 'mssql';
import crypto from 'crypto';
import 'dotenv/config';

vi.mock('../src/services/otpProviderService.js', () => {
    class OtpProviderError extends Error { constructor(c) { super(c); this.code = c; } }
    return {
        OtpProviderError,
        authenticate: vi.fn(),
        sendRecoveryOtp: vi.fn().mockResolvedValue(true),
        verifyOtp: vi.fn().mockResolvedValue(true),
        _clearTokenCache: vi.fn()
    };
});
vi.mock('../src/services/ulvApiService.js', () => {
    class UlvApiError extends Error { constructor(c) { super(c); this.code = c; } }
    return {
        UlvApiError,
        getInstitutionalEmail: vi.fn(),
        getStudentData: vi.fn(), getPreceptor: vi.fn(), getDepartmentHead: vi.fn(),
        validateDepartmentHead: vi.fn(), getStudentCoordinator: vi.fn()
    };
});

import * as otpProvider from '../src/services/otpProviderService.js';
import { OtpProviderError } from '../src/services/otpProviderService.js';
import * as ulv from '../src/services/ulvApiService.js';
import app from '../src/app.js';

const hasDb = !!process.env.DB_SERVER;
const d = hasDb ? describe : describe.skip;
const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');
const EMAIL_INST = 'usuario.prueba@ulv.edu.mx'; // valor que devuelve la fuente institucional (mock)

d('Task 7.1.B recuperación por matrícula (integración)', () => {
    let pool, matricula, idLogin, hashOriginal;
    const MAT_INEXISTENTE = '99999999';

    beforeAll(async () => {
        pool = await sql.connect({
            user: process.env.DB_USER, password: process.env.DB_PASSWORD, server: process.env.DB_SERVER, database: process.env.DB_DATABASE,
            options: { encrypt: process.env.DB_ENCRYPT === 'true', trustServerCertificate: process.env.DB_TRUST_CERT === 'true' }
        });
        const u = (await pool.request().input('id', sql.Int, 1).query('SELECT IdLogin, Matricula, Contraseña FROM UNIPASS.LoginUniPass WHERE IdLogin=@id')).recordset[0];
        idLogin = u.IdLogin; matricula = u.Matricula; hashOriginal = u.Contraseña;
    });

    afterAll(async () => {
        await pool.request().input('id', sql.Int, idLogin).input('h', sql.VarChar, hashOriginal)
            .query('UPDATE UNIPASS.LoginUniPass SET Contraseña=@h WHERE IdLogin=@id');
        await pool.request().input('id', sql.Int, idLogin).query('DELETE FROM UNIPASS.PasswordReset WHERE IdLogin=@id');
        await pool?.close();
    });

    beforeEach(() => { vi.clearAllMocks(); ulv.getInstitutionalEmail.mockResolvedValue(EMAIL_INST); });

    const crearReset = async ({ expiraEnMs = 10 * 60 * 1000, usado = false } = {}) => {
        const token = crypto.randomBytes(16).toString('hex');
        await pool.request()
            .input('id', sql.Int, idLogin).input('h', sql.NVarChar(128), sha256(token))
            .input('exp', sql.DateTime, new Date(Date.now() + expiraEnMs))
            .input('usado', sql.DateTime, usado ? new Date() : null)
            .query('INSERT INTO UNIPASS.PasswordReset (IdLogin, ResetTokenHash, ExpiraEn, UsadoEn) VALUES (@id,@h,@exp,@usado)');
        return token;
    };

    // ===== forgot (por matrícula) =====
    it('forgot matrícula válida -> resuelve email server-side, proveedor recibe ese email, 200 genérico', async () => {
        const res = await request(app).post('/password/forgot').send({ matricula });
        expect(res.status).toBe(200);
        expect(ulv.getInstitutionalEmail).toHaveBeenCalledWith(matricula);
        expect(otpProvider.sendRecoveryOtp).toHaveBeenCalledWith(EMAIL_INST); // proveedor recibe email, no matrícula
        // no revela email en la respuesta
        expect(JSON.stringify(res.body)).not.toContain('@');
    });

    it('forgot matrícula inexistente -> 200 genérico, sin llamar fuente ni proveedor (no enumeración)', async () => {
        const res = await request(app).post('/password/forgot').send({ matricula: MAT_INEXISTENTE });
        expect(res.status).toBe(200);
        expect(ulv.getInstitutionalEmail).not.toHaveBeenCalled();
        expect(otpProvider.sendRecoveryOtp).not.toHaveBeenCalled();
    });

    it('proveedor no disponible -> 502 OTP_PROVIDER_UNAVAILABLE', async () => {
        otpProvider.sendRecoveryOtp.mockRejectedValueOnce(new OtpProviderError('OTP_PROVIDER_UNAVAILABLE'));
        const res = await request(app).post('/password/forgot').send({ matricula });
        expect(res.status).toBe(502);
        expect(res.body.code).toBe('OTP_PROVIDER_UNAVAILABLE');
    });

    it('timeout del proveedor -> 504 OTP_PROVIDER_TIMEOUT', async () => {
        otpProvider.sendRecoveryOtp.mockRejectedValueOnce(new OtpProviderError('OTP_PROVIDER_TIMEOUT'));
        const res = await request(app).post('/password/forgot').send({ matricula });
        expect(res.status).toBe(504);
        expect(res.body.code).toBe('OTP_PROVIDER_TIMEOUT');
    });

    // ===== verify-otp (por matrícula) =====
    it('verify matrícula válida + OTP válido -> proveedor recibe email, resetToken ligado al IdLogin', async () => {
        otpProvider.verifyOtp.mockResolvedValueOnce(true);
        const res = await request(app).post('/password/verify-otp').send({ matricula, otp: '123456' });
        expect(res.status).toBe(200);
        expect(typeof res.body.resetToken).toBe('string');
        expect(otpProvider.verifyOtp).toHaveBeenCalledWith(EMAIL_INST, '123456');
        const row = (await pool.request().input('h', sql.NVarChar(128), sha256(res.body.resetToken))
            .query('SELECT IdLogin FROM UNIPASS.PasswordReset WHERE ResetTokenHash=@h')).recordset[0];
        expect(row.IdLogin).toBe(idLogin); // ligado al IdLogin correcto
    });

    it('verify matrícula válida + OTP inválido -> 400 INVALID_OTP', async () => {
        otpProvider.verifyOtp.mockResolvedValueOnce(false);
        const res = await request(app).post('/password/verify-otp').send({ matricula, otp: '000000' });
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('INVALID_OTP');
    });

    it('verify matrícula inexistente -> 400 INVALID_OTP (indistinguible; sin llamar al proveedor)', async () => {
        const res = await request(app).post('/password/verify-otp').send({ matricula: MAT_INEXISTENTE, otp: '123456' });
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('INVALID_OTP');
        expect(otpProvider.verifyOtp).not.toHaveBeenCalled();
    });

    // ===== reset (sin cambios: resetToken -> IdLogin) =====
    it('resetToken inexistente -> 400 RESET_TOKEN_INVALID', async () => {
        const res = await request(app).post('/password/reset').send({ resetToken: 'no-existe', nueva: 'NuevaPass123' });
        expect(res.status).toBe(400); expect(res.body.code).toBe('RESET_TOKEN_INVALID');
    });

    it('resetToken expirado -> 400 RESET_TOKEN_EXPIRED', async () => {
        const token = await crearReset({ expiraEnMs: -60 * 1000 });
        const res = await request(app).post('/password/reset').send({ resetToken: token, nueva: 'NuevaPass123' });
        expect(res.status).toBe(400); expect(res.body.code).toBe('RESET_TOKEN_EXPIRED');
    });

    it('resetToken ya utilizado -> 400 RESET_TOKEN_USED', async () => {
        const token = await crearReset({ usado: true });
        const res = await request(app).post('/password/reset').send({ resetToken: token, nueva: 'NuevaPass123' });
        expect(res.status).toBe(400); expect(res.body.code).toBe('RESET_TOKEN_USED');
    });

    it('contraseña débil -> 400 WEAK_PASSWORD (token NO se consume)', async () => {
        const token = await crearReset();
        const res = await request(app).post('/password/reset').send({ resetToken: token, nueva: 'corta' });
        expect(res.status).toBe(400); expect(res.body.code).toBe('WEAK_PASSWORD');
        const row = (await pool.request().input('h', sql.NVarChar(128), sha256(token)).query('SELECT UsadoEn FROM UNIPASS.PasswordReset WHERE ResetTokenHash=@h')).recordset[0];
        expect(row.UsadoEn).toBeNull();
    });

    it('reset exitoso -> 200, hash cambia; segundo uso -> 400 RESET_TOKEN_USED', async () => {
        const token = await crearReset();
        const r1 = await request(app).post('/password/reset').send({ resetToken: token, nueva: 'NuevaPass123' });
        expect(r1.status).toBe(200);
        const nuevoHash = (await pool.request().input('id', sql.Int, idLogin).query('SELECT Contraseña FROM UNIPASS.LoginUniPass WHERE IdLogin=@id')).recordset[0].Contraseña;
        expect(nuevoHash).not.toBe(hashOriginal);
        const r2 = await request(app).post('/password/reset').send({ resetToken: token, nueva: 'OtraPass123' });
        expect(r2.status).toBe(400); expect(r2.body.code).toBe('RESET_TOKEN_USED');
    });
});
