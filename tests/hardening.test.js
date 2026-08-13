// Task 7 - regresion de gating (solo verifica 401 sin token; no toca DB porque el
// middleware verifyToken responde antes de llegar al controlador/consulta).
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';

describe('Task 7 gating: escritura sin token -> 401', () => {
    it('DELETE /permission/:Id sin token -> 401 (cerrado a ADMIN)', async () => {
        const res = await request(app).delete('/permission/1');
        expect(res.status).toBe(401);
    });
});

describe('Endpoints /admin/* siguen requiriendo token -> 401', () => {
    for (const path of ['/admin/dashboard', '/admin/reporte', '/admin/observaciones']) {
        it(`GET ${path} sin token -> 401`, async () => {
            const res = await request(app).get(path);
            expect(res.status).toBe(401);
        });
    }
});

describe('Task 7.2 self endpoints: sin token -> 401', () => {
    const casos = [
        ['put', '/TokenDispositivo/123'],
        ['delete', '/doctosMul/1'],
        ['put', '/permission/1'],
        ['post', '/doctosMul'],
        ['put', '/doctosMul/updateProfile'],
        ['post', '/permission'],
    ];
    for (const [metodo, path] of casos) {
        it(`${metodo.toUpperCase()} ${path} sin token -> 401`, async () => {
            const res = await request(app)[metodo](path).send({});
            expect(res.status).toBe(401);
        });
    }
});

describe('Task 7.1 PUT /me/password: gating', () => {
    it('sin token -> 401', async () => {
        const res = await request(app).put('/me/password').send({ actual: 'x', nueva: 'yyyyyy' });
        expect(res.status).toBe(401);
    });
});
