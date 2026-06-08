// Smoke test: la app carga, las rutas estan montadas, no toca DB.
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';

describe('app boot', () => {
    it('responde 404 a ruta inexistente', async () => {
        const res = await request(app).get('/__ruta_que_no_existe__');
        expect(res.status).toBe(404);
    });

    it('responde a OPTIONS por CORS', async () => {
        const res = await request(app).options('/users');
        // cors() responde 204 o 200 dependiendo de la version, ambos validos
        expect([200, 204]).toContain(res.status);
    });
});
