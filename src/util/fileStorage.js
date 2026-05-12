import fs from 'fs/promises';
import path from 'path';

const UPLOADS_ROOT = path.resolve('./public/uploads');

// Convierte el path almacenado en BD (ej. "/uploads/123.jpg") a una ruta
// absoluta segura dentro de UPLOADS_ROOT. Devuelve null si esta fuera.
function resolveSafe(storedPath) {
    if (!storedPath || typeof storedPath !== 'string') return null;

    // Quitar prefijo "/uploads/" si viene asi
    const cleaned = storedPath.replace(/^\/?uploads\//, '');

    const resolved = path.resolve(UPLOADS_ROOT, cleaned);
    if (!resolved.startsWith(UPLOADS_ROOT + path.sep) && resolved !== UPLOADS_ROOT) {
        return null;
    }
    return resolved;
}

// Borra un archivo subido. Idempotente: si no existe no lanza error.
// Nunca lanza al caller: cualquier error se logea pero la operacion sigue.
export async function deleteUploadedFile(storedPath) {
    const absolute = resolveSafe(storedPath);
    if (!absolute) {
        console.warn(`[FileStorage] Path inseguro o invalido, no se borra: ${storedPath}`);
        return false;
    }
    try {
        await fs.unlink(absolute);
        console.log(`[FileStorage] Borrado: ${absolute}`);
        return true;
    } catch (err) {
        if (err.code === 'ENOENT') {
            // No existia, lo damos por hecho
            return true;
        }
        console.error(`[FileStorage] Error borrando ${absolute}:`, err.message);
        return false;
    }
}

// Util para tests/scripts: lista los nombres de archivo dentro de uploads.
export async function listUploadedFiles() {
    try {
        return await fs.readdir(UPLOADS_ROOT);
    } catch (err) {
        if (err.code === 'ENOENT') return [];
        throw err;
    }
}

export { UPLOADS_ROOT };
