// Task 7.1.B - Integración de recuperación de contraseña. Proveedor OTP MOCKEADO; DB real
// (PasswordReset). No destructivo: el hash del usuario de prueba se guarda y se restaura.
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

import * as otpProvider from '../src/services/otpProviderService.js';
import { OtpProviderError } from '../src/services/otpProviderService.js';
import app from '../src/app.js';

const hasDb = !!process.env.DB_SERVER;
const d = hasDb ? describe : describe.skip;
const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');

d('Task 7.1.B recuperación de contraseña (integración)', () => {
    let pool, correo, idLogin, hashOriginal;

    beforeAll(async () => {
        pool = await sql.connect({
            user: process.env.DB_USER, password: process.env.DB_PASSWORD, server: process.env.DB_SERVER, database: process.env.DB_DATABASE,
            options: { encrypt: process.env.DB_ENCRYPT === 'true', trustServerCertificate: process.env.DB_TRUST_CERT === 'true' }
        });
        const u = (await pool.request().input('id', sql.Int, 1).query('SELECT IdLogin, Correo, Contraseña FROM LoginUniPass WHERE IdLogin=@id')).recordset[0];
        idLogin = u.IdLogin; correo = u.Correo; hashOriginal = u.Contraseña;
    });

    afterAll(async () => {
        // Restaurar el hash original y limpiar reset tokens de prueba.
        await pool.request().input('id', sql.Int, idLogin).input('h', sql.VarChar, hashOriginal)
            .query('UPDATE LoginUniPass SET Contraseña=@h WHERE IdLogin=@id');
        await pool.request().input('id', sql.Int, idLogin).query('DELETE FROM PasswordReset WHERE IdLogin=@id');
        await pool?.close();
    });

    beforeEach(() => { vi.clearAllMocks(); });

    // Crea un reset token de prueba; devuelve el valor OPACO (plaintext).
    const crearReset = async ({ expiraEnMs = 10 * 60 * 1000, usado = false } = {}) => {
        const token = crypto.randomBytes(16).toString('hex');
        await pool.request()
            .input('id', sql.Int, idLogin).input('h', sql.NVarChar(128), sha256(token))
            .input('exp', sql.DateTime, new Date(Date.now() + expiraEnMs))
            .input('usado', sql.DateTime, usado ? new Date() : null)
            .query('INSERT INTO PasswordReset (IdLogin, ResetTokenHash, ExpiraEn, UsadoEn) VALUES (@id,@h,@exp,@usado)');
        return token;
    };

    // ===== forgot =====
    it('forgot exitoso -> 200 genérico y llama al proveedor', async () => {
        const res = await request(app).post('/password/forgot').send({ email: correo });
        expect(res.status).toBe(200);
        expect(otpProvider.sendRecoveryOtp).toHaveBeenCalledWith(String(correo).trim().toLowerCase());
    });

    it('forgot correo inexistente -> 200 genérico SIN llamar al proveedor (no enumeración)', async () => {
        const res = await request(app).post('/password/forgot').send({ email: 'no-existe-xyz@ulv.edu.mx' });
        expect(res.status).toBe(200);
        expect(otpProvider.sendRecoveryOtp).not.toHaveBeenCalled();
    });

    it('proveedor no disponible -> 502 OTP_PROVIDER_UNAVAILABLE', async () => {
        otpProvider.sendRecoveryOtp.mockRejectedValueOnce(new OtpProviderError('OTP_PROVIDER_UNAVAILABLE'));
        const res = await request(app).post('/password/forgot').send({ email: correo });
        expect(res.status).toBe(502);
        expect(res.body.code).toBe('OTP_PROVIDER_UNAVAILABLE');
    });

    it('timeout del proveedor -> 504 OTP_PROVIDER_TIMEOUT', async () => {
        otpProvider.sendRecoveryOtp.mockRejectedValueOnce(new OtpProviderError('OTP_PROVIDER_TIMEOUT'));
        const res = await request(app).post('/password/forgot').send({ email: correo });
        expect(res.status).toBe(504);
        expect(res.body.code).toBe('OTP_PROVIDER_TIMEOUT');
    });

    // ===== verify-otp =====
    it('OTP incorrecto -> 400 INVALID_OTP', async () => {
        otpProvider.verifyOtp.mockResolvedValueOnce(false);
        const res = await request(app).post('/password/verify-otp').send({ email: correo, otp: '000000' });
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('INVALID_OTP');
    });

    it('OTP válido -> 200 con resetToken y crea registro PasswordReset', async () => {
        otpProvider.verifyOtp.mockResolvedValueOnce(true);
        const res = await request(app).post('/password/verify-otp').send({ email: correo, otp: '123456' });
        expect(res.status).toBe(200);
        expect(typeof res.body.resetToken).toBe('string');
        const row = (await pool.request().input('h', sql.NVarChar(128), sha256(res.body.resetToken))
            .query('SELECT Id FROM PasswordReset WHERE ResetTokenHash=@h')).recordset[0];
        expect(row).toBeTruthy();
    });

    // ===== reset =====
    it('resetToken inexistente -> 400 RESET_TOKEN_INVALID', async () => {
        const res = await request(app).post('/password/reset').send({ resetToken: 'no-existe', nueva: 'NuevaPass123' });
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('RESET_TOKEN_INVALID');
    });

    it('resetToken expirado -> 400 RESET_TOKEN_EXPIRED', async () => {
        const token = await crearReset({ expiraEnMs: -60 * 1000 });
        const res = await request(app).post('/password/reset').send({ resetToken: token, nueva: 'NuevaPass123' });
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('RESET_TOKEN_EXPIRED');
    });

    it('resetToken ya utilizado -> 400 RESET_TOKEN_USED', async () => {
        const token = await crearReset({ usado: true });
        const res = await request(app).post('/password/reset').send({ resetToken: token, nueva: 'NuevaPass123' });
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('RESET_TOKEN_USED');
    });

    it('contraseña débil -> 400 WEAK_PASSWORD (token NO se consume)', async () => {
        const token = await crearReset();
        const res = await request(app).post('/password/reset').send({ resetToken: token, nueva: 'corta' });
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('WEAK_PASSWORD');
        const row = (await pool.request().input('h', sql.NVarChar(128), sha256(token)).query('SELECT UsadoEn FROM PasswordReset WHERE ResetTokenHash=@h')).recordset[0];
        expect(row.UsadoEn).toBeNull(); // no consumido
    });

    it('reset exitoso -> 200, hash cambia; segundo uso -> 400 RESET_TOKEN_USED', async () => {
        const token = await crearReset();
        const r1 = await request(app).post('/password/reset').send({ resetToken: token, nueva: 'NuevaPass123' });
        expect(r1.status).toBe(200);
        const nuevoHash = (await pool.request().input('id', sql.Int, idLogin).query('SELECT Contraseña FROM LoginUniPass WHERE IdLogin=@id')).recordset[0].Contraseña;
        expect(nuevoHash).not.toBe(hashOriginal); // contraseña actualizada
        // Segundo uso del MISMO token -> rechazado (single-use).
        const r2 = await request(app).post('/password/reset').send({ resetToken: token, nueva: 'OtraPass123' });
        expect(r2.status).toBe(400);
        expect(r2.body.code).toBe('RESET_TOKEN_USED');
    });
});
