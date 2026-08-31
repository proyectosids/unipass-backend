// Task 7.4B (Commit A) - Resolución SEGURA de la cadena de autorización. Requiere DB. NO destructivo
// sobre datos reales: crea empleados/alumno y permisos desechables (matrículas numéricas altas y
// únicas) y limpia todo en afterAll. El actor SIEMPRE se deriva del token; el IdEmpleado del body se
// ignora. No se loguean secretos.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import sql from 'mssql';
import 'dotenv/config';
import app from '../src/app.js';
import { generateAccessToken } from '../src/util/tokens.js';
import { hashData } from '../src/util/hashData.js';
import { resolveAuthorizeLinkTx } from '../src/repositories/authorize.repo.js';

const hasDb = !!process.env.DB_SERVER;
const d = hasDb ? describe : describe.skip;

d('Task 7.4B Commit A - autorización segura (integración)', () => {
    let pool;
    let jefe = {}, prece = {}, alumno = {}, extraneo = {};
    let tJefe, tPrece, tAlumno, tExtraneo;
    const permisos = new Set();   // IdPermission creados -> limpiar
    const cuentas = new Set();    // IdLogin creados -> limpiar
    let base;

    const insertAccount = async ({ matricula, tipo }) => {
        const hash = await hashData('NoImporta123');
        const r = await pool.request()
            .input('m', sql.VarChar(10), matricula).input('c', sql.VarChar(80), `u${matricula}@test.local`)
            .input('p', sql.VarChar(sql.MAX), hash).input('n', sql.VarChar(120), 'TEST').input('a', sql.VarChar(120), '74B')
            .input('t', sql.VarChar(20), tipo).input('s', sql.VarChar(15), 'M')
            .input('f', sql.DateTime, new Date('2000-01-01')).input('cel', sql.VarChar(15), '9610000000')
            .query(`INSERT INTO UNIPASS.LoginUniPass (Matricula,Contraseña,Correo,Nombre,Apellidos,TipoUser,Sexo,FechaNacimiento,Celular,StatusActividad)
                    OUTPUT INSERTED.IdLogin AS IdLogin VALUES (@m,@p,@c,@n,@a,@t,@s,@f,@cel,1)`);
        const row = { IdLogin: r.recordset[0].IdLogin, Matricula: matricula, Nombre: 'TEST', Apellidos: '74B', TipoUser: tipo, Dormitorio: null };
        cuentas.add(row.IdLogin);
        return row;
    };

    // Crea Permission Pendiente + cadena Authorize (orden = inserción). empleados: [matriculaOrden1, ...].
    const crearPermiso = async (empleados = [jefe.Matricula, prece.Matricula]) => {
        const p = await pool.request()
            .input('fs', sql.DateTime, new Date()).input('sp', sql.VarChar, 'Pendiente')
            .input('fsal', sql.DateTime, new Date(Date.now() + 86400000)).input('freg', sql.DateTime, new Date(Date.now() + 172800000))
            .input('mot', sql.VarChar, 'Prueba 7.4B').input('idu', sql.Int, alumno.IdLogin).input('its', sql.Int, 1)
            .query(`INSERT INTO UNIPASS.Permission (FechaSolicitada,StatusPermission,FechaSalida,FechaRegreso,Motivo,IdUser,IdTipoSalida,Observaciones)
                    OUTPUT INSERTED.IdPermission AS IdPermission VALUES (@fs,@sp,@fsal,@freg,@mot,@idu,@its,'Ninguna')`);
        const idPermission = p.recordset[0].IdPermission;
        permisos.add(idPermission);
        const auths = [];
        for (let i = 0; i < empleados.length; i++) {
            const a = await pool.request()
                .input('e', sql.Int, Number(empleados[i])).input('nd', sql.Int, i + 1)
                .input('ip', sql.Int, idPermission).input('sa', sql.VarChar, 'Pendiente')
                .query(`INSERT INTO UNIPASS.Authorize (IdEmpleado,NoDepto,IdPermission,StatusAuthorize)
                        OUTPUT INSERTED.IdAuthorize AS IdAuthorize VALUES (@e,@nd,@ip,@sa)`);
            auths.push(a.recordset[0].IdAuthorize);
        }
        return { idPermission, auths };
    };
    const statusPerm = async (id) => (await pool.request().input('id', sql.Int, id).query('SELECT StatusPermission FROM UNIPASS.Permission WHERE IdPermission=@id')).recordset[0]?.StatusPermission;
    const statusAuth = async (idAuth) => (await pool.request().input('id', sql.Int, idAuth).query('SELECT StatusAuthorize FROM UNIPASS.Authorize WHERE IdAuthorize=@id')).recordset[0]?.StatusAuthorize;
    const put = (id, body, token) => {
        const r = request(app).put(`/autorizarPermission/${id}`);
        if (token) r.set('Authorization', `Bearer ${token}`);
        return r.send(body);
    };

    beforeAll(async () => {
        pool = await sql.connect({
            user: process.env.DB_USER, password: process.env.DB_PASSWORD, server: process.env.DB_SERVER, database: process.env.DB_DATABASE,
            options: { encrypt: process.env.DB_ENCRYPT === 'true', trustServerCertificate: process.env.DB_TRUST_CERT === 'true' }
        });
        base = Number(String(Date.now()).slice(-7)); // matrículas numéricas altas y únicas
        jefe = await insertAccount({ matricula: String(base), tipo: 'EMPLEADO' });
        prece = await insertAccount({ matricula: String(base + 1), tipo: 'PRECEPTOR' });
        alumno = await insertAccount({ matricula: String(base + 2), tipo: 'ALUMNO' });
        extraneo = await insertAccount({ matricula: String(base + 3), tipo: 'PRECEPTOR' });
        tJefe = generateAccessToken(jefe); tPrece = generateAccessToken(prece);
        tAlumno = generateAccessToken(alumno); tExtraneo = generateAccessToken(extraneo);
    });
    afterAll(async () => {
        for (const id of permisos) {
            await pool.request().input('id', sql.NVarChar(40), String(id)).query("DELETE FROM UNIPASS.AuditLog WHERE Recurso='Permission' AND RecursoId=@id");
            await pool.request().input('id', sql.Int, id).query('DELETE FROM UNIPASS.CheckPoints WHERE IdPermission=@id'); // C1: la aprobacion ahora crea checks
            await pool.request().input('id', sql.Int, id).query('DELETE FROM UNIPASS.Authorize WHERE IdPermission=@id');
            await pool.request().input('id', sql.Int, id).query('DELETE FROM UNIPASS.Permission WHERE IdPermission=@id');
        }
        for (const id of cuentas) await pool.request().input('id', sql.Int, id).query('DELETE FROM UNIPASS.LoginUniPass WHERE IdLogin=@id');
        await pool?.close();
    });

    // 1
    it('sin token -> 401', async () => {
        const { idPermission } = await crearPermiso();
        const r = await put(idPermission, { StatusAuthorize: 'Aprobada' }, null);
        expect(r.status).toBe(401);
    });
    // 2
    it('ALUMNO -> 403 (no es autorizador)', async () => {
        const { idPermission } = await crearPermiso();
        const r = await put(idPermission, { StatusAuthorize: 'Aprobada' }, tAlumno);
        expect(r.status).toBe(403); expect(r.body.code).toBe('NOT_AUTHORIZER');
    });
    // 3
    it('empleado no asignado a la cadena -> 403', async () => {
        const { idPermission } = await crearPermiso();
        const r = await put(idPermission, { StatusAuthorize: 'Aprobada' }, tExtraneo);
        expect(r.status).toBe(403); expect(r.body.code).toBe('NOT_AUTHORIZER');
    });
    // 4
    it('IdEmpleado de la víctima en el body -> ignorado (sigue 403 para el extraño)', async () => {
        const { idPermission, auths } = await crearPermiso();
        const r = await put(idPermission, { StatusAuthorize: 'Aprobada', IdEmpleado: jefe.Matricula }, tExtraneo);
        expect(r.status).toBe(403);
        expect(await statusAuth(auths[0])).toBe('Pendiente'); // no tocó la fila del jefe
    });
    // 4b (positivo): actor válido con IdEmpleado ajeno en el body -> resuelve SU fila, no la del body
    it('actor válido con IdEmpleado ajeno en el body -> cambia SU propia fila', async () => {
        const { idPermission, auths } = await crearPermiso();
        const r = await put(idPermission, { StatusAuthorize: 'Aprobada', IdEmpleado: prece.Matricula }, tJefe);
        expect(r.status).toBe(200);
        expect(await statusAuth(auths[0])).toBe('Aprobada'); // jefe (su fila)
        expect(await statusAuth(auths[1])).toBe('Pendiente'); // prece intacto
    });
    // 5
    it('actor correcto + Pendiente -> aprueba (global sigue Pendiente por eslabón restante)', async () => {
        const { idPermission, auths } = await crearPermiso();
        const r = await put(idPermission, { StatusAuthorize: 'Aprobada' }, tJefe);
        expect(r.status).toBe(200); expect(r.body.StatusAuthorize).toBe('Aprobada');
        expect(await statusAuth(auths[0])).toBe('Aprobada');
        expect(await statusPerm(idPermission)).toBe('Pendiente');
    });
    // 6 / 11
    it('rechazo válido -> Authorize Rechazada y Permission Rechazada', async () => {
        const { idPermission, auths } = await crearPermiso();
        const r = await put(idPermission, { StatusAuthorize: 'Rechazada' }, tJefe);
        expect(r.status).toBe(200); expect(r.body.StatusPermission).toBe('Rechazada');
        expect(await statusAuth(auths[0])).toBe('Rechazada');
        expect(await statusPerm(idPermission)).toBe('Rechazada');
    });
    // 7
    it('Aprobada -> Aprobada otra vez -> 409', async () => {
        const { idPermission } = await crearPermiso();
        await put(idPermission, { StatusAuthorize: 'Aprobada' }, tJefe);
        const r = await put(idPermission, { StatusAuthorize: 'Aprobada' }, tJefe);
        expect(r.status).toBe(409);
    });
    // 8
    it('Rechazada -> Aprobada -> 409', async () => {
        const { idPermission } = await crearPermiso();
        await put(idPermission, { StatusAuthorize: 'Rechazada' }, tJefe);
        const r = await put(idPermission, { StatusAuthorize: 'Aprobada' }, tJefe);
        expect(r.status).toBe(409);
    });
    // 9
    it('Orden 2 con Orden 1 Pendiente -> 409 ORDER_NOT_READY', async () => {
        const { idPermission } = await crearPermiso();
        const r = await put(idPermission, { StatusAuthorize: 'Aprobada' }, tPrece);
        expect(r.status).toBe(409); expect(r.body.code).toBe('ORDER_NOT_READY');
    });
    // 10 / 12
    it('Orden 2 tras Orden 1 aprobado -> permitido; todas aprobadas -> Permission Aprobada', async () => {
        const { idPermission, auths } = await crearPermiso();
        expect((await put(idPermission, { StatusAuthorize: 'Aprobada' }, tJefe)).status).toBe(200);
        const r = await put(idPermission, { StatusAuthorize: 'Aprobada' }, tPrece);
        expect(r.status).toBe(200);
        expect(await statusAuth(auths[1])).toBe('Aprobada');
        expect(await statusPerm(idPermission)).toBe('Aprobada');
    });
    // 13
    it('todavía pendientes -> Permission sigue Pendiente', async () => {
        const { idPermission } = await crearPermiso();
        await put(idPermission, { StatusAuthorize: 'Aprobada' }, tJefe);
        expect(await statusPerm(idPermission)).toBe('Pendiente');
    });
    // 14 (atomicidad): fallo durante el AuditLog (paso final) -> ROLLBACK de Authorize y Permission
    it('error intermedio -> rollback completo (nada cambia)', async () => {
        const { idPermission, auths } = await crearPermiso();
        // actorIdLogin fuera de rango INT provoca error en el INSERT de AuditLog, DESPUES de actualizar
        // Authorize/Permission dentro de la tx -> debe revertir todo.
        await expect(resolveAuthorizeLinkTx({
            idPermission, actorMatricula: jefe.Matricula, nuevoStatus: 'Aprobada',
            audit: { actorIdLogin: 3000000000, actorMatricula: jefe.Matricula, accion: 'PERMISSION_AUTHORIZE_APPROVE' }
        })).rejects.toBeTruthy();
        expect(await statusAuth(auths[0])).toBe('Pendiente'); // revertido
        expect(await statusPerm(idPermission)).toBe('Pendiente');
    });
    // 15
    it('AuditLog: actor = usuario autenticado real (no el body)', async () => {
        const { idPermission } = await crearPermiso();
        await put(idPermission, { StatusAuthorize: 'Aprobada', IdEmpleado: 999999 }, tJefe);
        const row = (await pool.request().input('id', sql.NVarChar(40), String(idPermission))
            .query("SELECT TOP 1 ActorIdLogin, ActorMatricula, Accion FROM UNIPASS.AuditLog WHERE Recurso='Permission' AND RecursoId=@id ORDER BY Id DESC")).recordset[0];
        expect(row.ActorIdLogin).toBe(jefe.IdLogin);
        expect(String(row.ActorMatricula)).toBe(String(jefe.Matricula));
        expect(row.Accion).toBe('PERMISSION_AUTHORIZE_APPROVE');
    });
    // 16
    it('cliente NO puede forzar StatusPermission global', async () => {
        const { idPermission } = await crearPermiso();
        await put(idPermission, { StatusAuthorize: 'Aprobada', StatusPermission: 'Aprobada' }, tJefe);
        expect(await statusPerm(idPermission)).toBe('Pendiente'); // sigue pendiente (falta prece)
    });
    // 17
    it('PUT /permissionValorado/:Id retirado -> 404 y no cambia estado', async () => {
        const { idPermission } = await crearPermiso();
        const r = await request(app).put(`/permissionValorado/${idPermission}`).set('Authorization', `Bearer ${tJefe}`).send({ StatusPermission: 'Aprobada' });
        expect(r.status).toBe(404);
        expect(await statusPerm(idPermission)).toBe('Pendiente');
    });
    // 18 (404 recurso): Permission inexistente
    it('Permission inexistente -> 404', async () => {
        const r = await put(999999999, { StatusAuthorize: 'Aprobada' }, tJefe);
        expect(r.status).toBe(404); expect(r.body.code).toBe('PERMISSION_NOT_FOUND');
    });
});
