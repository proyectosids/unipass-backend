// Checks Hardening C1 (Opción B) - Creación server-side de los 4 CheckPoints al TRANSICIONAR
// Permission -> Aprobada (dentro de resolveAuthorizeLinkTx). Requiere DB. No destructivo: cuentas y
// permisos desechables se limpian en afterAll (incluye CheckPoints).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import sql from 'mssql';
import 'dotenv/config';
import app from '../src/app.js';
import { hashData } from '../src/util/hashData.js';
import { generateAccessToken } from '../src/util/tokens.js';
import { resolveAuthorizeLinkTx } from '../src/repositories/authorize.repo.js';

const hasDb = !!process.env.DB_SERVER;
const d = hasDb ? describe : describe.skip;

d('Checks Hardening C1 - auto-creación server-side (integración)', () => {
    let pool;
    let jefe = {}, prece = {}, alumno = {};
    const permisos = new Set();
    const cuentas = new Set();

    const insertAccount = async ({ matricula, tipo }) => {
        const hash = await hashData('NoImporta123');
        const r = await pool.request()
            .input('m', sql.VarChar(10), matricula).input('c', sql.VarChar(80), `u${matricula}@test.local`)
            .input('p', sql.VarChar(sql.MAX), hash).input('n', sql.VarChar(120), 'TEST').input('a', sql.VarChar(120), 'C1')
            .input('t', sql.VarChar(20), tipo).input('s', sql.VarChar(15), 'M')
            .input('f', sql.DateTime, new Date('2000-01-01')).input('cel', sql.VarChar(15), '9610000000')
            .query(`INSERT INTO UNIPASS.LoginUniPass (Matricula,Contraseña,Correo,Nombre,Apellidos,TipoUser,Sexo,FechaNacimiento,Celular,StatusActividad)
                    OUTPUT INSERTED.IdLogin AS IdLogin VALUES (@m,@p,@c,@n,@a,@t,@s,@f,@cel,1)`);
        const row = { IdLogin: r.recordset[0].IdLogin, Matricula: matricula, TipoUser: tipo };
        cuentas.add(row.IdLogin);
        return row;
    };
    // Permission Pendiente + cadena Authorize (Orden = i+1). Devuelve { idPermission, auths:[IdAuthorize] }.
    const crearPermiso = async ({ tipoSalida = 1, empleados = [jefe.Matricula, prece.Matricula] } = {}) => {
        const p = await pool.request()
            .input('fs', sql.DateTime, new Date()).input('sp', sql.VarChar, 'Pendiente')
            .input('fsal', sql.DateTime, new Date(Date.now() + 86400000)).input('freg', sql.DateTime, new Date(Date.now() + 172800000))
            .input('mot', sql.VarChar, 'C1').input('idu', sql.Int, alumno.IdLogin).input('its', sql.Int, tipoSalida)
            .query(`INSERT INTO UNIPASS.Permission (FechaSolicitada,StatusPermission,FechaSalida,FechaRegreso,Motivo,IdUser,IdTipoSalida,Observaciones)
                    OUTPUT INSERTED.IdPermission AS IdPermission VALUES (@fs,@sp,@fsal,@freg,@mot,@idu,@its,'Ninguna')`);
        const idPermission = p.recordset[0].IdPermission; permisos.add(idPermission);
        const auths = [];
        for (let i = 0; i < empleados.length; i++) {
            const a = await pool.request().input('e', sql.Int, Number(empleados[i])).input('nd', sql.Int, i + 1)
                .input('ip', sql.Int, idPermission).input('o', sql.Int, i + 1).input('sa', sql.VarChar, 'Pendiente')
                .query(`INSERT INTO UNIPASS.Authorize (IdEmpleado,NoDepto,IdPermission,StatusAuthorize,Orden)
                        OUTPUT INSERTED.IdAuthorize AS IdAuthorize VALUES (@e,@nd,@ip,@sa,@o)`);
            auths.push(a.recordset[0].IdAuthorize);
        }
        return { idPermission, auths };
    };
    const approve = (idPermission, matricula, idLogin) => resolveAuthorizeLinkTx({
        idPermission, actorMatricula: matricula, nuevoStatus: 'Aprobada',
        audit: { actorIdLogin: idLogin, actorMatricula: matricula, accion: 'PERMISSION_AUTHORIZE_APPROVE' }
    });
    const reject = (idPermission, matricula, idLogin) => resolveAuthorizeLinkTx({
        idPermission, actorMatricula: matricula, nuevoStatus: 'Rechazada',
        audit: { actorIdLogin: idLogin, actorMatricula: matricula, accion: 'PERMISSION_AUTHORIZE_REJECT' }
    });
    const checksOf = async (idPermission) => (await pool.request().input('id', sql.Int, idPermission)
        .query(`SELECT cp.IdPoint, p.NombrePunto, cp.Accion, cp.Estatus
                FROM UNIPASS.CheckPoints cp JOIN UNIPASS.Point p ON p.IdPoint=cp.IdPoint
                WHERE cp.IdPermission=@id ORDER BY cp.IdPoint, cp.Accion`)).recordset;
    const permStatus = async (id) => (await pool.request().input('id', sql.Int, id).query('SELECT StatusPermission FROM UNIPASS.Permission WHERE IdPermission=@id')).recordset[0].StatusPermission;
    const authStatus = async (idAuth) => (await pool.request().input('id', sql.Int, idAuth).query('SELECT StatusAuthorize FROM UNIPASS.Authorize WHERE IdAuthorize=@id')).recordset[0].StatusAuthorize;

    beforeAll(async () => {
        pool = await sql.connect({
            user: process.env.DB_USER, password: process.env.DB_PASSWORD, server: process.env.DB_SERVER, database: process.env.DB_DATABASE,
            options: { encrypt: process.env.DB_ENCRYPT === 'true', trustServerCertificate: process.env.DB_TRUST_CERT === 'true' }
        });
        const base = Number(String(Date.now()).slice(-7));
        jefe = await insertAccount({ matricula: String(base), tipo: 'EMPLEADO' });
        prece = await insertAccount({ matricula: String(base + 1), tipo: 'PRECEPTOR' });
        alumno = await insertAccount({ matricula: String(base + 2), tipo: 'ALUMNO' });
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

    // 1
    it('Jefe aprueba Orden 1 -> Permission Pendiente -> 0 checks', async () => {
        const { idPermission } = await crearPermiso();
        await approve(idPermission, jefe.Matricula, jefe.IdLogin);
        expect(await permStatus(idPermission)).toBe('Pendiente');
        expect(await checksOf(idPermission)).toHaveLength(0);
    });
    // 2, 9, 10, 11
    it('Preceptor aprueba final -> Aprobada -> exactamente 4 checks (Pendiente; 2 SALIDA + 2 RETORNO; combos únicos)', async () => {
        const { idPermission } = await crearPermiso();
        await approve(idPermission, jefe.Matricula, jefe.IdLogin);
        await approve(idPermission, prece.Matricula, prece.IdLogin);
        expect(await permStatus(idPermission)).toBe('Aprobada');
        const checks = await checksOf(idPermission);
        expect(checks).toHaveLength(4);
        expect(checks.every((c) => c.Estatus === 'Pendiente')).toBe(true);
        expect(checks.filter((c) => c.Accion === 'SALIDA')).toHaveLength(2);
        expect(checks.filter((c) => c.Accion === 'RETORNO')).toHaveLength(2);
        // Point correcto para tipo 1 (IdPoint 1 Dormitorio, 2 Caseta)
        expect(new Set(checks.map((c) => c.IdPoint))).toEqual(new Set([1, 2]));
        // combos (IdPoint, Accion) únicos
        const combos = checks.map((c) => `${c.IdPoint}:${c.Accion}`);
        expect(new Set(combos).size).toBe(4);
        // pares correctos
        const set = new Set(combos);
        expect(set).toEqual(new Set(['1:SALIDA', '2:SALIDA', '2:RETORNO', '1:RETORNO']));
    });
    // 3
    it('Tipo 2 aprobado -> 4 checks (Points 3/4)', async () => {
        const { idPermission } = await crearPermiso({ tipoSalida: 2, empleados: [jefe.Matricula] });
        await approve(idPermission, jefe.Matricula, jefe.IdLogin);
        const checks = await checksOf(idPermission);
        expect(checks).toHaveLength(4);
        expect(new Set(checks.map((c) => c.IdPoint))).toEqual(new Set([3, 4]));
    });
    // 4
    it('Tipo 3 aprobado -> 4 checks (Points 5/6)', async () => {
        const { idPermission } = await crearPermiso({ tipoSalida: 3, empleados: [jefe.Matricula] });
        await approve(idPermission, jefe.Matricula, jefe.IdLogin);
        const checks = await checksOf(idPermission);
        expect(checks).toHaveLength(4);
        expect(new Set(checks.map((c) => c.IdPoint))).toEqual(new Set([5, 6]));
    });
    // 5 DualRole (una sola fila)
    it('DualRole (1 solo eslabón) aprobado -> exactamente 4 checks', async () => {
        const { idPermission } = await crearPermiso({ tipoSalida: 1, empleados: [jefe.Matricula] });
        await approve(idPermission, jefe.Matricula, jefe.IdLogin);
        expect(await permStatus(idPermission)).toBe('Aprobada');
        expect(await checksOf(idPermission)).toHaveLength(4);
    });
    // 6 Rechazo
    it('Rechazo -> Permission Rechazada -> 0 checks', async () => {
        const { idPermission } = await crearPermiso();
        await reject(idPermission, jefe.Matricula, jefe.IdLogin);
        expect(await permStatus(idPermission)).toBe('Rechazada');
        expect(await checksOf(idPermission)).toHaveLength(0);
    });
    // 7 transición inválida (Orden 2 antes que Orden 1)
    it('transición inválida (ORDER_NOT_READY) -> 0 checks', async () => {
        const { idPermission } = await crearPermiso();
        const r = await approve(idPermission, prece.Matricula, prece.IdLogin);
        expect(r.error).toBe('ORDER_NOT_READY');
        expect(await checksOf(idPermission)).toHaveLength(0);
    });
    // 8 idempotencia: ya Aprobada -> no duplica
    it('Permission ya Aprobada -> re-aprobar falla y NO duplica (sigue 4)', async () => {
        const { idPermission } = await crearPermiso({ tipoSalida: 1, empleados: [jefe.Matricula] });
        await approve(idPermission, jefe.Matricula, jefe.IdLogin);
        expect(await checksOf(idPermission)).toHaveLength(4);
        const r = await approve(idPermission, jefe.Matricula, jefe.IdLogin); // ya no Pendiente
        expect(r.error).toBeTruthy();
        expect(await checksOf(idPermission)).toHaveLength(4);
    });
    // 12 + 13 catálogo incompleto -> error + ROLLBACK completo (Authorize y Permission sin cambios)
    it('catálogo Point incompleto -> CHECKPOINT_CONFIGURATION_INCOMPLETE + rollback (Authorize/Permission intactos, 0 checks)', async () => {
        // Tipo 4 (FIN DE CURSO) existe en TypeExit pero NO tiene Points en el catálogo -> incompleto.
        const { idPermission, auths } = await crearPermiso({ tipoSalida: 4, empleados: [jefe.Matricula] });
        const r = await approve(idPermission, jefe.Matricula, jefe.IdLogin);
        expect(r.error).toBe('CHECKPOINT_CONFIGURATION_INCOMPLETE');
        expect(await authStatus(auths[0])).toBe('Pendiente'); // rollback del Authorize
        expect(await permStatus(idPermission)).toBe('Pendiente'); // rollback del Permission
        expect(await checksOf(idPermission)).toHaveLength(0);
    });
    // 14 (C2) POST /checks RETIRADO -> 404 (sin token y con Bearer); 0 CheckPoints nuevos.
    it('POST /checks retirado -> 404 sin token y no crea CheckPoints', async () => {
        const { idPermission } = await crearPermiso({ tipoSalida: 1, empleados: [jefe.Matricula] });
        const antes = (await checksOf(idPermission)).length; // 0 (aún no aprobado)
        const res = await request(app).post('/checks').send({ Accion: 'SALIDA', IdPoint: 1, IdPermission: idPermission });
        expect(res.status).toBe(404);
        expect((await checksOf(idPermission)).length).toBe(antes); // 0 CheckPoints nuevos
    });
    it('POST /checks retirado -> 404 con Bearer válido (la ruta no existe, no es gating)', async () => {
        const { idPermission } = await crearPermiso({ tipoSalida: 1, empleados: [jefe.Matricula] });
        const token = generateAccessToken({ IdLogin: alumno.IdLogin, Matricula: alumno.Matricula, TipoUser: 'ALUMNO' });
        const res = await request(app).post('/checks').set('Authorization', `Bearer ${token}`)
            .send({ Accion: 'SALIDA', IdPoint: 1, IdPermission: idPermission });
        expect(res.status).toBe(404);
        expect((await checksOf(idPermission)).length).toBe(0);
    });
    // 10-bis criterio principal: sin ninguna llamada POST /checks, los 4 existen igual
    it('criterio principal: sin POST /checks, los 4 CheckPoints existen igual', async () => {
        const { idPermission } = await crearPermiso({ tipoSalida: 1, empleados: [jefe.Matricula] });
        await approve(idPermission, jefe.Matricula, jefe.IdLogin);
        expect(await checksOf(idPermission)).toHaveLength(4); // creados sin intervencion del cliente
    });
});
