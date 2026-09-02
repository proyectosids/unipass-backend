// Task 7.3 D2-B2 - Resolver seguro de rutas de uploads (anti path traversal). Unit puro, sin DB ni disco.
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { resolveUploadPath, mimeForFile, UPLOAD_ROOT } from '../src/util/secureFilePath.js';

describe('secureFilePath.resolveUploadPath', () => {
    it('acepta el formato canónico "/uploads/<file>" y confina dentro de UPLOAD_ROOT', () => {
        const r = resolveUploadPath('/uploads/test.pdf');
        expect(r).toBe(path.join(UPLOAD_ROOT, 'test.pdf'));
        expect(r.startsWith(UPLOAD_ROOT + path.sep)).toBe(true);
    });
    it('acepta variantes "uploads/<file>" y "<file>"', () => {
        expect(resolveUploadPath('uploads/foo.png')).toBe(path.join(UPLOAD_ROOT, 'foo.png'));
        expect(resolveUploadPath('bar.jpg')).toBe(path.join(UPLOAD_ROOT, 'bar.jpg'));
    });

    // --- path traversal / escapes: TODOS deben devolver null ---
    it('rechaza traversal relativo "../../etc/passwd"', () => expect(resolveUploadPath('../../etc/passwd')).toBeNull());
    it('rechaza "/uploads/../../secret"', () => expect(resolveUploadPath('/uploads/../../secret.pdf')).toBeNull());
    it('rechaza path absoluto externo "/etc/passwd"', () => expect(resolveUploadPath('/etc/passwd')).toBeNull());
    it('rechaza separadores de Windows "..\\..\\secret.pdf"', () => expect(resolveUploadPath('..\\..\\secret.pdf')).toBeNull());
    it('rechaza subdirectorios "sub/dir/x.pdf"', () => expect(resolveUploadPath('sub/dir/x.pdf')).toBeNull());
    it('rechaza byte NUL', () => expect(resolveUploadPath('a\0.pdf')).toBeNull());

    // --- extensión / formato ---
    it('rechaza extensión no permitida (.exe/.txt/.sh)', () => {
        expect(resolveUploadPath('/uploads/x.exe')).toBeNull();
        expect(resolveUploadPath('/uploads/x.txt')).toBeNull();
        expect(resolveUploadPath('/uploads/x.sh')).toBeNull();
    });
    it('rechaza vacío / no-string / null', () => {
        expect(resolveUploadPath('')).toBeNull();
        expect(resolveUploadPath('   ')).toBeNull();
        expect(resolveUploadPath(null)).toBeNull();
        expect(resolveUploadPath(undefined)).toBeNull();
        expect(resolveUploadPath(123)).toBeNull();
    });
    it('acepta las 4 extensiones permitidas', () => {
        for (const ext of ['pdf', 'png', 'jpg', 'jpeg']) expect(resolveUploadPath(`/uploads/f.${ext}`)).not.toBeNull();
    });
});

describe('secureFilePath.mimeForFile', () => {
    it('deriva MIME de la extensión (allowlist)', () => {
        expect(mimeForFile('x.pdf')).toBe('application/pdf');
        expect(mimeForFile('x.png')).toBe('image/png');
        expect(mimeForFile('x.jpg')).toBe('image/jpeg');
        expect(mimeForFile('x.jpeg')).toBe('image/jpeg');
    });
    it('devuelve null para extensiones no permitidas', () => {
        expect(mimeForFile('x.exe')).toBeNull();
        expect(mimeForFile('x')).toBeNull();
    });
});
