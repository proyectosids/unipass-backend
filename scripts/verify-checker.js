// Verificacion READ-ONLY del estado del esquema para la feature CheckerGrant.
// No modifica nada. Uso: node scripts/verify-checker.js
import { withConnection } from '../src/database/connection.js';

const checks = [
    { label: 'Tabla LoginUniPass', sql: "SELECT 1 FROM sys.tables WHERE name='LoginUniPass'" },
    { label: 'Tabla Point', sql: "SELECT 1 FROM sys.tables WHERE name='Point'" },
    { label: 'Tabla CheckPoints', sql: "SELECT 1 FROM sys.tables WHERE name='CheckPoints'" },
    { label: 'Tabla CheckerGrant', sql: "SELECT 1 FROM sys.tables WHERE name='CheckerGrant'" },
    { label: 'Columna CheckPoints.ConfirmadoPor', sql: "SELECT 1 FROM sys.columns WHERE name='ConfirmadoPor' AND object_id=OBJECT_ID('dbo.CheckPoints')" }
];

const run = async () => {
    await withConnection(async (pool) => {
        const db = await pool.request().query('SELECT DB_NAME() AS db');
        console.log(`\nConectado a BD: ${db.recordset[0].db}\n`);

        for (const c of checks) {
            const r = await pool.request().query(c.sql);
            const exists = r.recordset.length > 0;
            console.log(`${exists ? '✅' : '❌'}  ${c.label}`);
        }

        // Distribucion de TipoUser (contexto para roles/migracion)
        const tipos = await pool.request().query(
            'SELECT TipoUser, COUNT(*) AS n FROM LoginUniPass GROUP BY TipoUser ORDER BY n DESC'
        );
        console.log('\nTipoUser en LoginUniPass:');
        tipos.recordset.forEach((t) => console.log(`   ${t.TipoUser}: ${t.n}`));

        const pts = await pool.request().query('SELECT IdPoint, NombrePunto FROM Point ORDER BY IdPoint');
        console.log('\nPuntos (Point):');
        pts.recordset.forEach((p) => console.log(`   IdPoint=${p.IdPoint} -> ${p.NombrePunto}`));
    });
};

run()
    .then(() => { console.log('\nVerificacion OK (read-only).'); process.exit(0); })
    .catch((e) => { console.error('\nError:', e.message); process.exit(1); });
