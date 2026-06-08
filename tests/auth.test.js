// Smoke test del middleware de auth: sin tocar DB.
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';

describe('verifyToken middleware', () => {
    it('GET /verifyToken sin header Authorization devuelve 401', async () => {
        const res = await request(app).get('/verifyToken');
        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('message');
    });

    it('GET /verifyToken con token invalido devuelve 401 con code TOKEN_INVALID', async () => {
        const res = await request(app)
            .get('/verifyToken')
            .set('Authorization', 'Bearer token-basura-no-valido');
        expect(res.status).toBe(401);
        expect(res.body.code).toBe('TOKEN_INVALID');
    });

    it('POST /logout sin token devuelve 401', async () => {
        const res = await request(app)
            .post('/logout')
            .send({ refreshToken: 'cualquiercosa' });
        expect(res.status).toBe(401);
    });
});
