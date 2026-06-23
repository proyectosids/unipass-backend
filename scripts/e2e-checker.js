// E2E de la feature CheckerGrant contra la BD/app reales (supertest, sin red).
// Crea un grant temporal y lo BORRA al final. Es escritura: ejecutalo tu.
//
// Variables de entorno requeridas:
//   PRECEPTOR_MAT, PRECEPTOR_PASS   credenciales de un usuario PRECEPTOR o VIGILANCIA
//   BENEF_MAT, BENEF_PASS           credenciales del beneficiario (ALUMNO/EMPLEADO)
//   BENEF_IDLOGIN                   IdLogin del beneficiario
// Opcionales:
//   IDPOINT     (default 2 = Caseta)
//   IDCHECK     si lo pones, prueba 403 (antes del grant) y 200 (despues).
//               OJO: con IDCHECK el check se confirma DE VERDAD (mutacion real).
//
// Uso:
//   PRECEPTOR_MAT=.. PRECEPTOR_PASS=.. BENEF_MAT=.. BENEF_PASS=.. BENEF_IDLOGIN=.. \
//   node scripts/e2e-checker.js
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
const IDPOINT = parseInt(env.IDPOINT || '2', 10);
const IDCHECK = env.IDCHECK ? parseInt(env.IDCHECK, 10) : null;

let passed = 0;
let failed = 0;
const ok = (cond, label, extra = '') => {
    if (cond) { console.log(`✅ ${label}`); passed++; }
    else { console.log(`❌ ${label} ${extra}`); failed++; }
};

const login = (mat, pass) =>
    request(app).post('/login').send({ Matricula: mat, Contraseña: pass });

const run = async () => {
    // 1) Login preceptor
    const pre = await login(env.PRECEPTOR_MAT, env.PRECEPTOR_PASS);
    ok(pre.status === 200 && pre.body.accessToken, '1. Login preceptor 200 + accessToken', `(status ${pre.status})`);
    ok(Array.isArray(pre.body.capabilities), '   login devuelve capabilities[]');
    const tokenPre = pre.body.accessToken;

    // 2) (opcional) 403 ANTES del grant: beneficiario sin grant no puede confirmar
    let benef = await login(env.BENEF_MAT, env.BENEF_PASS);
    ok(benef.status === 200 && benef.body.accessToken, '2. Login beneficiario 200 + accessToken', `(status ${benef.status})`);
    let tokenBenef = benef.body.accessToken;

    if (IDCHECK) {
        const r403 = await request(app).put(`/checks/${IDCHECK}`)
            .set('Authorization', `Bearer ${tokenBenef}`)
            .send({ Estatus: 'Confirmada', FechaCheck: '2026-06-22T10:00:00', Observaciones: 'e2e' });
        ok(r403.status === 403 && r403.body.code === 'NOT_AUTHORIZED_CHECKER',
            '3. PUT /checks sin grant -> 403 NOT_AUTHORIZED_CHECKER', `(status ${r403.status} code ${r403.body.code})`);
    }

    // 4) Crear grant (preceptor)
    const grantRes = await request(app).post('/checkerGrant')
        .set('Authorization', `Bearer ${tokenPre}`)
        .send({ IdLogin: Number(env.BENEF_IDLOGIN), IdPoint: IDPOINT, Scope: 'AMBOS', Vigencia: 'PERMANENTE' });
    ok([200, 201].includes(grantRes.status) && grantRes.body.IdGrant,
        '4. POST /checkerGrant -> 201/200 + IdGrant', `(status ${grantRes.status})`);
    const idGrant = grantRes.body.IdGrant;

    // 5) Re-login beneficiario: capabilities ahora incluye el punto
    benef = await login(env.BENEF_MAT, env.BENEF_PASS);
    const cap = (benef.body.capabilities || []).find((c) => c.idPoint === IDPOINT && c.type === 'CHECKER');
    ok(!!cap, '5. capabilities del beneficiario incluye el grant', JSON.stringify(benef.body.capabilities));
    tokenBenef = benef.body.accessToken;

    // 6) GET /getCapabilities coincide
    const gc = await request(app).get('/getCapabilities').set('Authorization', `Bearer ${tokenBenef}`);
    ok(gc.status === 200 && (gc.body.capabilities || []).some((c) => c.idPoint === IDPOINT),
        '6. GET /getCapabilities refleja el grant', `(status ${gc.status})`);

    // 7) 401 sin token
    const r401 = await request(app).put('/checks/1')
        .send({ Estatus: 'Confirmada', FechaCheck: '2026-06-22T10:00:00' });
    ok(r401.status === 401, '7. PUT /checks sin Authorization -> 401', `(status ${r401.status})`);

    // 8) (opcional) 200 con grant + ConfirmadoPor seteado (MUTA el check real)
    if (IDCHECK) {
        const r200 = await request(app).put(`/checks/${IDCHECK}`)
            .set('Authorization', `Bearer ${tokenBenef}`)
            .send({ Estatus: 'Confirmada', FechaCheck: '2026-06-22T10:00:00', Observaciones: 'e2e ok' });
        ok(r200.status === 200, '8. PUT /checks con grant -> 200', `(status ${r200.status} body ${JSON.stringify(r200.body)})`);

        const dbRow = await withConnection((pool) =>
            pool.request().query(`SELECT ConfirmadoPor FROM CheckPoints WHERE IdCheck = ${IDCHECK}`));
        ok(dbRow.recordset[0]?.ConfirmadoPor === Number(env.BENEF_IDLOGIN),
            '   ConfirmadoPor = IdLogin del beneficiario', `(=${dbRow.recordset[0]?.ConfirmadoPor})`);
    } else {
        console.log('ℹ️  (Pasos 3 y 8 omitidos: define IDCHECK para probar 403/200 con un check real)');
    }

    // 9) Cleanup: borra el grant creado
    const del = await request(app).delete(`/checkerGrant/${idGrant}`).set('Authorization', `Bearer ${tokenPre}`);
    ok(del.status === 200, '9. Cleanup DELETE /checkerGrant', `(status ${del.status})`);
};

run()
    .then(() => {
        console.log(`\nResultado: ${passed} OK, ${failed} fallos`);
        process.exit(failed === 0 ? 0 : 1);
    })
    .catch((e) => { console.error('\nError e2e:', e); process.exit(1); });
