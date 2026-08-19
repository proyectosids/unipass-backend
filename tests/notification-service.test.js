// Task 7.4A - Unit tests de NotificationService (token resuelto server-side; sin red real).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/repositories/user.repo.js', () => ({
    findTokenFCMByMatricula: vi.fn()
}));

import { findTokenFCMByMatricula } from '../src/repositories/user.repo.js';
import { sendToEmployee } from '../src/services/notificationService.js';

describe('NotificationService.sendToEmployee (Task 7.4A)', () => {
    const OLD = process.env.FIREBASE_NOTIFICATION_URL;
    beforeEach(() => { vi.clearAllMocks(); process.env.FIREBASE_NOTIFICATION_URL = 'https://fake-fcm.test'; });
    afterEach(() => { process.env.FIREBASE_NOTIFICATION_URL = OLD; vi.unstubAllGlobals(); });

    it('sin URL configurada -> skipped NOT_CONFIGURED (no falla)', async () => {
        delete process.env.FIREBASE_NOTIFICATION_URL;
        const r = await sendToEmployee({ matricula: '273', title: 't', body: 'b' });
        expect(r).toEqual({ skipped: 'NOT_CONFIGURED' });
    });

    it('empleado sin token -> skipped NO_TOKEN (no envía, no falla)', async () => {
        findTokenFCMByMatricula.mockResolvedValue([{ TokenCFM: null }]);
        const fetchSpy = vi.fn();
        vi.stubGlobal('fetch', fetchSpy);
        const r = await sendToEmployee({ matricula: '273', title: 't', body: 'b' });
        expect(r).toEqual({ skipped: 'NO_TOKEN' });
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('con token -> hace POST {URL}/send { token, title, body } y success', async () => {
        findTokenFCMByMatricula.mockResolvedValue([{ TokenCFM: 'fcm-abc' }]);
        const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
        vi.stubGlobal('fetch', fetchSpy);
        const r = await sendToEmployee({ matricula: '273', title: 'Solicitud de Salida al Pueblo', body: 'b' });
        expect(r).toEqual({ success: true });
        expect(fetchSpy).toHaveBeenCalledOnce();
        const [url, opts] = fetchSpy.mock.calls[0];
        expect(url).toBe('https://fake-fcm.test/send');
        expect(JSON.parse(opts.body)).toEqual({ token: 'fcm-abc', title: 'Solicitud de Salida al Pueblo', body: 'b' });
    });

    it('servicio FCM responde error -> { success:false } (no lanza)', async () => {
        findTokenFCMByMatricula.mockResolvedValue([{ TokenCFM: 'fcm-abc' }]);
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
        const r = await sendToEmployee({ matricula: '273', title: 't', body: 'b' });
        expect(r).toMatchObject({ success: false, status: 500 });
    });
});
