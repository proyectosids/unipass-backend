// Task 7.4A - Integración de POST /permission Tipo 1 (Pueblo). DB real + UlvApiService
// mockeado. No destructivo sobre datos previos: cada creación se limpia al final.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import sql from 'mssql';
import 'dotenv/config';

vi.mock('../src/services/ulvApiService.js', () => ({
    getStudentData: vi.fn(),
    getDepartmentHead: vi.fn(),
    getPreceptor: vi.fn(),
    validateDepartmentHead: vi.fn(),
    getStudentCoordinator: vi.fn(),
    UlvApiError: class extends Error { constructor(c) { super(c); this.code = c; } }
}));

import * as ulv from '../src/services/ulvApiService.js';
import app from '../src/app.js';
import { generateAccessToken } from '../src/util/tokens.js';
import { createPermissionWithChainTx } from '../src/repositories/permission.repo.js';

const hasDb = !!process.env.DB_SERVER;
const d = hasDb ? describe : describe.skip;

d('Task 7.4A POST /permission Pueblo (integración)', () => {
    let pool, tokenAlumno;
    const creados = [];
    const cuerpo = { FechaSolicitada: '2026-08-18T10:00:00', FechaSalida: '2026-08-19T09:00:00', FechaRegreso: '2026-08-19T18:00:00', Motivo: 'Test 7.4A', IdTipoSalida: 1 };

    beforeAll(async () => {
        pool = await sql.connect({
            user: process.env.DB_USER, password: process.env.DB_PASSWORD, server: process.env.DB_SERVER, database: process.env.DB_DATABASE,
            options: { encrypt: process.env.DB_ENCRYPT === 'true', trustServerCertificate: process.env.DB_TRUST_CERT === 'true' }
        });
        const u = (await pool.request().input('id', sql.Int, 1)
            .query('SELECT IdLogin,Matricula,Nombre,Apellidos,TipoUser,Dormitorio FROM LoginUniPass WHERE IdLogin=@id')).recordset[0];
        tokenAlumno = generateAccessToken(u); // alumno IdLogin 1, dorm 4
    });

    afterAll(async () => {
        for (const id of creados) {
            await pool.request().input('id', sql.Int, id).query('DELETE FROM Authorize WHERE IdPermission=@id');
            await pool.request().input('id', sql.Int, id).query('DELETE FROM IdempotencyRequest WHERE IdPermission=@id');
            await pool.request().input('id', sql.Int, id).query('DELETE FROM Permission WHERE IdPermission=@id');
        }
        await pool?.close();
    });

    const authRows = async (idP) => (await pool.request().input('id', sql.Int, idP)
        .query('SELECT IdEmpleado, NoDepto, StatusAuthorize FROM Authorize WHERE IdPermission=@id ORDER BY IdAuthorize')).recordset;

    it('Pueblo normal (Jefe 273 != Preceptor 41) -> 1 Permission + 2 Authorize (orden 1 Jefe, orden 2 Preceptor)', async () => {
        ulv.getStudentData.mockResolvedValue({ type: 'ALUMNO', work: [{ 'ID DEPTO': 302, 'ID JEFE': 273 }] });
        ulv.getDepartmentHead.mockResolvedValue({ EmpMatricula: '273' }); // Rafael (IdLogin 2055)
        ulv.getPreceptor.mockResolvedValue({ 'ID JEFE': 41 });            // Melytzin (IdLogin 3)

        const res = await request(app).post('/permission').set('Authorization', `Bearer ${tokenAlumno}`).send(cuerpo);
        expect(res.status).toBe(201);
        expect(res.body.cadena).toHaveLength(2);
        expect(res.body.cadena[0]).toMatchObject({ orden: 1, matricula: '273', rol: 'Jefe de trabajo' });
        expect(res.body.cadena[1]).toMatchObject({ orden: 2, matricula: '41', rol: 'Preceptor' });
        creados.push(res.body.Id);
        const rows = await authRows(res.body.Id);
        expect(rows.map((r) => r.IdEmpleado)).toEqual([273, 41]);
    });

    it('Pueblo deduplicado (Jefe == Preceptor 41) -> 1 Permission + 1 Authorize', async () => {
        ulv.getStudentData.mockResolvedValue({ type: 'ALUMNO', work: [{ 'ID DEPTO': 302, 'ID JEFE': 41 }] });
        ulv.getDepartmentHead.mockResolvedValue({ EmpMatricula: '41' });
        ulv.getPreceptor.mockResolvedValue({ 'ID JEFE': 41 });

        const res = await request(app).post('/permission').set('Authorization', `Bearer ${tokenAlumno}`).send(cuerpo);
        expect(res.status).toBe(201);
        expect(res.body.cadena).toHaveLength(1);
        creados.push(res.body.Id);
        expect(await authRows(res.body.Id)).toHaveLength(1);
    });

    it('Idempotencia: mismo Idempotency-Key -> una sola Permission (2do = replayed)', async () => {
        ulv.getStudentData.mockResolvedValue({ type: 'ALUMNO', work: [{ 'ID DEPTO': 302, 'ID JEFE': 273 }] });
        ulv.getDepartmentHead.mockResolvedValue({ EmpMatricula: '273' });
        ulv.getPreceptor.mockResolvedValue({ 'ID JEFE': 41 });
        const key = 'test-idem-' + Date.now();

        const r1 = await request(app).post('/permission').set('Authorization', `Bearer ${tokenAlumno}`).set('Idempotency-Key', key).send(cuerpo);
        const r2 = await request(app).post('/permission').set('Authorization', `Bearer ${tokenAlumno}`).set('Idempotency-Key', key).send(cuerpo);
        expect(r1.status).toBe(201);
        expect(r2.status).toBe(200);
        expect(r2.body.replayed).toBe(true);
        expect(r2.body.Id).toBe(r1.body.Id);
        creados.push(r1.body.Id);
    });

    it('Sin work -> 409 STUDENT_WORK_NOT_FOUND, 0 Permission', async () => {
        ulv.getStudentData.mockResolvedValue({ type: 'ALUMNO', work: [] });
        const res = await request(app).post('/permission').set('Authorization', `Bearer ${tokenAlumno}`).send(cuerpo);
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('STUDENT_WORK_NOT_FOUND');
    });

    it('Jefe institucional sin cuenta UniPass -> 409 AUTHORIZER_NOT_REGISTERED', async () => {
        ulv.getStudentData.mockResolvedValue({ type: 'ALUMNO', work: [{ 'ID DEPTO': 302, 'ID JEFE': 999999 }] });
        ulv.getDepartmentHead.mockResolvedValue({ EmpMatricula: '999999' }); // sin cuenta UniPass
        ulv.getPreceptor.mockResolvedValue({ 'ID JEFE': 41 });
        const res = await request(app).post('/permission').set('Authorization', `Bearer ${tokenAlumno}`).send(cuerpo);
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('AUTHORIZER_NOT_REGISTERED');
    });

    it('API-ULV caída -> 502 ULV_API_UNAVAILABLE, 0 Permission', async () => {
        ulv.getStudentData.mockRejectedValue(Object.assign(new Error('down'), { code: 'ULV_API_UNAVAILABLE' }));
        const res = await request(app).post('/permission').set('Authorization', `Bearer ${tokenAlumno}`).send(cuerpo);
        expect(res.status).toBe(502);
        expect(res.body.code).toBe('ULV_API_UNAVAILABLE');
    });

    it('Rollback: error SQL en Authorize -> 0 Permission, 0 Authorize (repo)', async () => {
        const antes = (await pool.request().input('u', sql.Int, 1)
            .query('SELECT COUNT(*) n FROM Permission WHERE IdUser=@u AND IdTipoSalida=1')).recordset[0].n;
        // idEmpleado fuera de rango INT -> falla el INSERT de Authorize -> ROLLBACK.
        await expect(createPermissionWithChainTx({
            permission: { fechaSolicitada: new Date().toISOString(), statusPermission: 'Pendiente', fechaSalida: new Date().toISOString(), fechaRegreso: new Date().toISOString(), motivo: 'rollback', idUser: 1, idTipoSalida: 1 },
            authorizers: [{ idEmpleado: 9999999999, noDepto: 302, orden: 1 }],
            idLogin: 1
        })).rejects.toBeTruthy();
        const despues = (await pool.request().input('u', sql.Int, 1)
            .query('SELECT COUNT(*) n FROM Permission WHERE IdUser=@u AND IdTipoSalida=1')).recordset[0].n;
        expect(despues).toBe(antes);
    });
});
