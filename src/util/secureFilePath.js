// Task 7.3 D2-B2 - Resolución SEGURA de binarios documentales para la entrega autenticada.
// El valor de BD (Doctos.Archivo, p.ej. "/uploads/123456789.pdf") NUNCA se usa ingenuamente contra el
// filesystem: se valida formato + extensión y se confina dentro de UPLOAD_ROOT (anti path traversal).
import path from 'node:path';

// Raíz canónica de uploads (donde escribe multer: ./public/uploads). Configurable por env para tests/deploy.
export const UPLOAD_ROOT = path.resolve(process.env.UPLOAD_ROOT || path.join(process.cwd(), 'public', 'uploads'));

// Extensiones permitidas = las mismas que acepta el upload (jpg/jpeg/png/pdf). El content-type se deriva de aquí.
const MIME_BY_EXT = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.pdf': 'application/pdf'
};

// MIME seguro derivado del NOMBRE almacenado/validado (nunca de un content-type del request). Allowlist.
export const mimeForFile = (name) => MIME_BY_EXT[path.extname(String(name)).toLowerCase()] || null;

// Resuelve el Archivo almacenado a una ruta absoluta segura DENTRO de UPLOAD_ROOT.
// Devuelve null (rechazo) si: no es string; tiene separadores/traversal tras normalizar; extensión no
// permitida; o el path canónico escapa de UPLOAD_ROOT. No usa concatenación ingenua de strings.
export const resolveUploadPath = (archivo) => {
    if (typeof archivo !== 'string' || archivo.trim() === '') return null;

    // Formato canónico esperado: "/uploads/<filename>", "uploads/<filename>" o "<filename>".
    let name = archivo.trim().replace(/^\/+/, '');       // quita barras iniciales (path absoluto externo)
    if (name.startsWith('uploads/')) name = name.slice('uploads/'.length);

    // Tras normalizar, DEBE ser un nombre de archivo simple: sin separadores, sin traversal, sin NUL.
    if (name === '' || name.includes('/') || name.includes('\\') || name.includes('..') || name.includes('\0')) {
        return null;
    }
    if (!Object.prototype.hasOwnProperty.call(MIME_BY_EXT, path.extname(name).toLowerCase())) return null;

    // Defensa en profundidad: el canónico debe quedar estrictamente dentro de UPLOAD_ROOT.
    const resolved = path.resolve(UPLOAD_ROOT, name);
    if (resolved !== path.join(UPLOAD_ROOT, name)) return null;
    if (!resolved.startsWith(UPLOAD_ROOT + path.sep)) return null;

    return resolved;
};
