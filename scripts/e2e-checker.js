// E2E del modelo "checador por TIPO de punto + orden" contra la BD/app reales
// (supertest, sin red). Crea un grant temporal y lo BORRA al final; si pruebas el
// orden, revierte los checks usados. Es escritura: ejecutalo tu.
//
// Variables de entorno requeridas:
//   PRECEPTOR_MAT, PRECEPTOR_PASS   credenciales de un PRECEPTOR (asigna Dormitorio)
//   BENEF_MAT, BENEF_PASS           credenciales del beneficiario (ALUMNO/EMPLEADO)
//   BENEF_IDLOGIN                   IdLogin del beneficiario
// Opcional (prueba de orden 1->4, MUTA checks reales y luego los revierte):
//   IDPERMISSION  permiso con 4 checks Pendientes (ej. 6033)
//
// Uso:
//   PRECEPTOR_MAT=41 PRECEPTOR_PASS=.. BENEF_MAT=221068 BENEF_PASS=.. BENEF_IDLOGIN=1 \
//   IDPERMISSION=6033 node scripts/e2e-checker.js
import request from 'supertest';
import app from '../src/app.js';
import { withConnection } from '../src/database/connection.js';

const env = process.env;
const need = ['PRECEPTOR_MAT', 'PRECEPTOR_PASS', 'BENEF_MAT', 'BENEF_PASS', 'BENEF_IDLOGIN'];
const missing = need.filter((k) => !env[k]);
if (missing.length) {
    console.error('Faltan variables de entorno:', missing.join(', '));
    process.exit(1);
}
const IDPERMISSION = env.IDPERMISSION ? parseInt(env.IDPERMISSION, 10) : null;

let passed = 0, failed = 0;
const ok = (cond, label, extra = '') => {
    if (cond) { console.log(`✅ ${label}`); passed++; }
    else { console.log(`❌ ${label} ${extra}`); failed++; }
};
const login = (mat, pass) => request(app).post('/login').send({ Matricula: mat, Contraseña: pass });

// Lee los checks de un permiso ordenados por Paso (1..4) con su info.
const stepsDe = (idPermission) => withConnection((pool) =>
    pool.request().query(`
        SELECT cp.IdCheck, cp.Accion, p.NombrePunto, cp.Estatus,
            CASE WHEN cp.Accion='SALIDA'  AND p.NombrePunto='Dormitorio' THEN 1
                 WHEN cp.Accion='SALIDA'  AND p.NombrePunto='Caseta'     THEN 2
                 WHEN cp.Accion='RETORNO' AND p.NombrePunto='Caseta'     THEN 3
                 WHEN cp.Accion='RETORNO' AND p.NombrePunto='Dormitorio' THEN 4 END AS Paso
        FROM CheckPoints cp JOIN Point p ON p.IdPoint=cp.IdPoint
        WHERE cp.IdPermission=${idPermission} ORDER BY Paso`).then((r) => r.recordset));

const run = async () => {
    // 1) Login preceptor
    const pre = await login(env.PRECEPTOR_MAT, env.PRECEPTOR_PASS);
    ok(pre.status === 200 && pre.body.accessToken, '1. Login preceptor 200', `(status ${pre.status})`);
    const tokenPre = pre.body.accessToken;
    const dormPre = pre.body.user?.Dormitorio;

    // Grants previos del beneficiario, para NO borrar en el cleanup uno preexistente
    // que el upsert haya reactivado (createOrReactivateGrant matchea por Tipo/IdDormitorio).
    const previos = await request(app).get(`/checkerGrantsByUser/${env.BENEF_IDLOGIN}`)
        .set('Authorization', `Bearer ${tokenPre}`);
    const idsPrevios = new Set((previos.body || []).map((g) => g.IdGrant));

    // 2) Crear grant (sin IdPoint). El backend deriva Tipo='Dormitorio' + IdDormitorio del token.
    const grantRes = await request(app).post('/checkerGrant')
        .set('Authorization', `Bearer ${tokenPre}`)
        .send({ IdLogin: Number(env.BENEF_IDLOGIN), Scope: 'AMBOS', Vigencia: 'PERMANENTE' });
    ok([200, 201].includes(grantRes.status) && grantRes.body.IdGrant,
        '2. POST /checkerGrant 201/200', `(status ${grantRes.status} body ${JSON.stringify(grantRes.body)})`);
    ok(grantRes.body.Tipo === 'Dormitorio' && grantRes.body.IdDormitorio === dormPre,
        '   grant deriva Tipo=Dormitorio + IdDormitorio del preceptor', `(${grantRes.body.Tipo}/${grantRes.body.IdDormitorio} vs dorm ${dormPre})`);
    const idGrant = grantRes.body.IdGrant;

    // 3) Login beneficiario: capabilities con pointType + idDormitorio
    const benef = await login(env.BENEF_MAT, env.BENEF_PASS);
    const cap = (benef.body.capabilities || []).find((c) => c.type === 'CHECKER' && c.pointType === 'Dormitorio');
    ok(!!cap && cap.idDormitorio === dormPre,
        '3. capabilities del beneficiario con pointType/idDormitorio', JSON.stringify(benef.body.capabilities));
    const tokenBenef = benef.body.accessToken;

    // 4) GET /checkerGrants scopeado por rol del preceptor
    const list = await request(app).get('/checkerGrants').set('Authorization', `Bearer ${tokenPre}`);
    ok(list.status === 200 && list.body.every((g) => g.Tipo === 'Dormitorio' && g.IdDormitorio === dormPre),
        '4. GET /checkerGrants scopeado a Dormitorio del preceptor', `(status ${list.status})`);

    // 5) 401 sin token
    const r401 = await request(app).put('/checks/1').send({ Estatus: 'Confirmada' });
    ok(r401.status === 401, '5. PUT /checks sin Authorization -> 401', `(status ${r401.status})`);

    // 6) Orden 1->4 (opcional, requiere IDPERMISSION con 4 checks Pendientes)
    let revertir = [];
    if (IDPERMISSION) {
        const steps = await stepsDe(IDPERMISSION);
        const byPaso = Object.fromEntries(steps.map((s) => [s.Paso, s]));
        const todosPend = [1, 2, 3, 4].every((p) => byPaso[p]?.Estatus === 'Pendiente');
        ok(todosPend, `6. Permiso ${IDPERMISSION} tiene 4 checks Pendientes (paso 1..4)`, JSON.stringify(steps));
        if (todosPend) {
            revertir = steps.map((s) => s.IdCheck);
            const confirmar = (idCheck) => request(app).put(`/checks/${idCheck}`)
                .set('Authorization', `Bearer ${tokenBenef}`)
                .send({ Estatus: 'Confirmada', FechaCheck: '2026-06-28T10:00:00', Observaciones: 'e2e' });

            // El beneficiario es checador de Dormitorio: solo pasos 1 y 4 (Caseta = 2,3 son de otro tipo).
            // a) Authz por tipo: paso 2 (Caseta) -> 403 NOT_AUTHORIZED_CHECKER
            const caseta = await confirmar(byPaso[2].IdCheck);
            ok(caseta.status === 403 && caseta.body.code === 'NOT_AUTHORIZED_CHECKER',
                '   checador Dormitorio en check Caseta -> 403 NOT_AUTHORIZED_CHECKER', `(status ${caseta.status} code ${caseta.body.code})`);

            // b) Orden: paso 4 (Regreso Dormitorio) con paso 3 pendiente -> 409
            const fuera = await confirmar(byPaso[4].IdCheck);
            ok(fuera.status === 409 && fuera.body.code === 'CHECK_OUT_OF_ORDER',
                '   paso 4 con paso 3 pendiente -> 409 CHECK_OUT_OF_ORDER', `(status ${fuera.status} code ${fuera.body.code})`);

            // c) Happy path: paso 1 (Salida Dormitorio) -> 200 (es el primero, sin predecesor)
            const paso1 = await confirmar(byPaso[1].IdCheck);
            ok(paso1.status === 200, '   paso 1 (Salida Dormitorio) -> 200', `(status ${paso1.status} ${JSON.stringify(paso1.body)})`);
        }
    } else {
        console.log('ℹ️  (Paso 6 omitido: define IDPERMISSION con 4 checks Pendientes para probar el orden)');
    }

    // 7) Cleanup: revertir checks confirmados y borrar el grant
    if (revertir.length) {
        await withConnection((pool) => pool.request().query(
            `UPDATE CheckPoints SET Estatus='Pendiente', FechaCheck=NULL, Observaciones='Ninguna', ConfirmadoPor=NULL
             WHERE IdCheck IN (${revertir.join(',')})`));
        console.log('   (checks revertidos a Pendiente)');
    }
    if (idsPrevios.has(idGrant)) {
        ok(true, '7. Cleanup: el grant ya existia (preexistente) -> no se borra');
    } else {
        const del = await request(app).delete(`/checkerGrant/${idGrant}`).set('Authorization', `Bearer ${tokenPre}`);
        ok(del.status === 200, '7. Cleanup DELETE /checkerGrant', `(status ${del.status})`);
    }
};

run()
    .then(() => { console.log(`\nResultado: ${passed} OK, ${failed} fallos`); process.exit(failed === 0 ? 0 : 1); })
    .catch((e) => { console.error('\nError e2e:', e); process.exit(1); });
