// Ejecuta un archivo .sql contra la BD configurada en .env.
// Uso: node scripts/run-sql.js database/migrations/001_checker_grant.sql
// Separa batches por lineas 'GO' (como SSMS). Pensado para migraciones DDL.
import fs from 'fs';
import path from 'path';
import { withConnection } from '../src/database/connection.js';

const file = process.argv[2];
if (!file) {
    console.error('Falta la ruta del .sql. Uso: node scripts/run-sql.js <archivo.sql>');
    process.exit(1);
}

const sqlText = fs.readFileSync(path.resolve(file), 'utf8');
const batches = sqlText
    .split(/^\s*GO\s*$/im)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);

withConnection(async (pool) => {
    const db = await pool.request().query('SELECT DB_NAME() AS db');
    console.log(`Ejecutando ${file} en BD: ${db.recordset[0].db} (${batches.length} batch/es)`);
    for (let i = 0; i < batches.length; i++) {
        await pool.request().query(batches[i]);
        console.log(`  batch ${i + 1}/${batches.length} OK`);
    }
})
    .then(() => { console.log('Migracion aplicada.'); process.exit(0); })
    .catch((e) => { console.error('Error aplicando migracion:', e.message); process.exit(1); });
