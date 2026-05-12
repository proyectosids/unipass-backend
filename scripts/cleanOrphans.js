// Script one-shot: detecta archivos en ./public/uploads/ que NO tengan
// un registro correspondiente en la tabla Doctos y los borra.
//
// Uso:
//   node scripts/cleanOrphans.js           -> dry-run (solo lista, no borra)
//   node scripts/cleanOrphans.js --apply   -> borra de verdad
//
// Reverso (registros zombie cuyo archivo ya no existe en disco): los lista
// al final para que decidas si los borras de BD manualmente.

import sql from 'mssql';
import path from 'path';
import fs from 'fs/promises';
import { getConnection } from '../src/database/connection.js';
import { listUploadedFiles, deleteUploadedFile, UPLOADS_ROOT } from '../src/util/fileStorage.js';

const APPLY = process.argv.includes('--apply');

function basenameFromStored(stored) {
    if (!stored || typeof stored !== 'string') return null;
    return path.basename(stored);
}

async function main() {
    console.log(`[cleanOrphans] Modo: ${APPLY ? 'APPLY (borrara archivos)' : 'DRY-RUN (solo listar)'}`);
    console.log(`[cleanOrphans] Uploads root: ${UPLOADS_ROOT}`);

    // 1) Archivos en disco
    const filesOnDisk = await listUploadedFiles();
    console.log(`[cleanOrphans] Archivos en disco: ${filesOnDisk.length}`);

    // 2) Paths registrados en BD
    let pool;
    let dbPaths = [];
    try {
        pool = await getConnection();
        const result = await pool.request().query('SELECT Archivo FROM Doctos WHERE Archivo IS NOT NULL');
        dbPaths = result.recordset.map(r => basenameFromStored(r.Archivo)).filter(Boolean);
    } finally {
        if (pool) {
            try { await pool.close(); } catch {}
        }
    }
    const dbSet = new Set(dbPaths);
    console.log(`[cleanOrphans] Registros en Doctos: ${dbPaths.length}`);

    // 3) Huerfanos en disco (no estan en BD)
    const orphansOnDisk = filesOnDisk.filter(name => !dbSet.has(name));
    console.log(`\n[cleanOrphans] Archivos huerfanos en disco: ${orphansOnDisk.length}`);
    for (const name of orphansOnDisk) {
        console.log(`  - ${name}`);
    }

    if (APPLY && orphansOnDisk.length > 0) {
        let borrados = 0;
        for (const name of orphansOnDisk) {
            const ok = await deleteUploadedFile('/uploads/' + name);
            if (ok) borrados++;
        }
        console.log(`\n[cleanOrphans] Borrados: ${borrados}/${orphansOnDisk.length}`);
    } else if (orphansOnDisk.length > 0) {
        console.log(`\n[cleanOrphans] (dry-run) corre con --apply para borrarlos`);
    }

    // 4) Registros zombie (en BD pero el archivo no existe)
    const diskSet = new Set(filesOnDisk);
    const zombies = dbPaths.filter(name => !diskSet.has(name));
    if (zombies.length > 0) {
        console.log(`\n[cleanOrphans] Registros en Doctos cuyo archivo NO existe en disco: ${zombies.length}`);
        for (const name of zombies) {
            console.log(`  - ${name}`);
        }
        console.log(`[cleanOrphans] (revisa manualmente si conviene borrar esos registros de Doctos)`);
    }

    console.log('\n[cleanOrphans] Fin.');
}

main().catch(err => {
    console.error('[cleanOrphans] Error fatal:', err);
    process.exit(1);
});
