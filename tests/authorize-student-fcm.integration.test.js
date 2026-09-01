// BOLA/IDOR R1-C (§3) - Reemplazo server-side del push al alumno en aprobación/rechazo (antes lo hacía
// Flutter con /VerToken, retirado). Verifica que definirAutorizacion envía FCM al alumno (resuelto de
// Permission.IdUser, TokenCFM interno) post-commit. notificationService MOCKEADO. Requiere DB.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import sql from 'mssql';
import 'dotenv/config';

vi.mock('../src/services/notificationService.js', () => ({ sendToEmployee: vi.fn().mockResolvedValue({ success: true }) }));
vi.mock('../src/util/socketHelpers.js', () => ({ emitToUser: vi.fn(), emitToEmpleado: vi.fn() }));

import { sendToEmployee } from '../src/services/notificationService.js';
import app from '../src/app.js';
import { generateAccessToken } from '../src/util/tokens.js';
import { hashData } from '../src/util/hashData.js';

const hasDb = !!process.env.DB_SERVER;
const d = hasDb ? describe : describe.skip;
const wait = (ms) => new Promise((r) => setTimeout(r, ms)); // el push es post-respuesta (best-effort)

d('BOLA/IDOR R1-C §3 - FCM al alumno en aprobación (integración)', () => {
    let pool, alumno = {}, jefe = {}, tokenJefe;
    const permisos = new Set(), cuentas = new Set();

    const insertAccount = async ({ matricula, tipo }) => {
        const hash = await hashData('x');
        const r = await pool.request()
            .input('m', sql.VarChar(10), matricula).input('c', sql.VarChar(80), `${matricula}@test.local`)
            .input('p', sql.VarChar(sql.MAX), hash).input('n', sql.VarChar(120), 'T').input('a', sql.VarChar(120), 'FCM')
            .input('t', sql.VarChar(20), tipo).input('s', sql.VarChar(15), 'M')
            .input('f', sql.DateTime, new Date('2000-01-01')).input('cel', sql.VarChar(15), '9610000000')
            .query(`INSERT INTO UNIPASS.LoginUniPass (Matricula,Contraseña,Correo,Nombre,Apellidos,TipoUser,Sexo,FechaNacimiento,Celular,StatusActividad)
                    OUTPUT INSERTED.IdLogin AS IdLogin VALUES (@m,@p,@c,@n,@a,@t,@s,@f,@cel,1)`);
        const row = { IdLogin: r.recordset[0].IdLogin, Matricula: matricula, TipoUser: tipo };
        cuentas.add(row.IdLogin);
        return row;
    };

    beforeAll(async () => {
        pool = await sql.connect({
            user: process.env.DB_USER, password: process.env.DB_PASSWORD, server: process.env.DB_SERVER, database: process.env.DB_DATABASE,
            options: { encrypt: process.env.DB_ENCRYPT === 'true', trustServerCertificate: process.env.DB_TRUST_CERT === 'true' }
        });
        const base = Number(String(Date.now()).slice(-7));
        alumno = await insertAccount({ matricula: String(base), tipo: 'ALUMNO' });
        jefe = await insertAccount({ matricula: String(base + 1), tipo: 'EMPLEADO' });
        tokenJefe = generateAccessToken(jefe);
    });
    afterAll(async () => {
        for (const id of permisos) {
            await pool.request().input('id', sql.NVarChar(40), String(id)).query("DELETE FROM UNIPASS.AuditLog WHERE Recurso='Permission' AND RecursoId=@id");
            await pool.request().input('id', sql.Int, id).query('DELETE FROM UNIPASS.CheckPoints WHERE IdPermission=@id');
            await pool.request().input('id', sql.Int, id).query('DELETE FROM UNIPASS.Authorize WHERE IdPermission=@id');
            await pool.request().input('id', sql.Int, id).query('DELETE FROM UNIPASS.Permission WHERE IdPermission=@id');
        }
        for (const id of cuentas) await pool.request().input('id', sql.Int, id).query('DELETE FROM UNIPASS.LoginUniPass WHERE IdLogin=@id');
        await pool?.close();
    });

    const crearPermiso = async () => {
        const p = await pool.request()
            .input('fs', sql.DateTime, new Date()).input('sp', sql.VarChar, 'Pendiente')
            .input('fsal', sql.DateTime, new Date(Date.now() + 86400000)).input('freg', sql.DateTime, new Date(Date.now() + 172800000))
            .input('mot', sql.VarChar, 'FCM').input('idu', sql.Int, alumno.IdLogin).input('its', sql.Int, 1)
            .query(`INSERT INTO UNIPASS.Permission (FechaSolicitada,StatusPermission,FechaSalida,FechaRegreso,Motivo,IdUser,IdTipoSalida,Observaciones)
                    OUTPUT INSERTED.IdPermission AS IdPermission VALUES (@fs,@sp,@fsal,@freg,@mot,@idu,@its,'Ninguna')`);
        const idPermission = p.recordset[0].IdPermission; permisos.add(idPermission);
        await pool.request().input('e', sql.Int, Number(jefe.Matricula)).input('nd', sql.Int, 1).input('ip', sql.Int, idPermission).input('o', sql.Int, 1)
            .query(`INSERT INTO UNIPASS.Authorize (IdEmpleado,NoDepto,IdPermission,StatusAuthorize,Orden) VALUES (@e,@nd,@ip,'Pendiente',@o)`);
        return idPermission;
    };

    it('aprobación final -> FCM al alumno (matrícula de Permission.IdUser), post-commit best-effort', async () => {
        const idPermission = await crearPermiso();
        const res = await request(app).put(`/autorizarPermission/${idPermission}`).set('Authorization', `Bearer ${tokenJefe}`).send({ StatusAuthorize: 'Aprobada' });
        expect(res.status).toBe(200);
        expect(res.body.StatusPermission).toBe('Aprobada');
        // el push es post-respuesta (best-effort): esperar un tick
        for (let i = 0; i < 20 && sendToEmployee.mock.calls.length === 0; i++) await wait(25);
        expect(sendToEmployee).toHaveBeenCalled();
        const arg = sendToEmployee.mock.calls[0][0];
        expect(String(arg.matricula)).toBe(String(alumno.Matricula)); // al alumno, no al jefe
        expect(String(arg.body).toLowerCase()).toContain('aprobada');
    });
});
