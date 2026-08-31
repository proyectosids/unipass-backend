// Task 7.4B (Commit B) - Unit del resolver server-side del autorizador (switch AUTORIZADOR_SALIDAS).
// Repos mockeados: no toca BD. Cubre PRECEPTOR (default), COORDINADOR (override y por rol) y errores.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/repositories/config.repo.js', () => ({ findConfigValue: vi.fn() }));
vi.mock('../src/repositories/user.repo.js', () => ({ findCoordinadorActivo: vi.fn(), findPreceptorMatriculaByDormitorio: vi.fn() }));
vi.mock('../src/repositories/bedroom.repo.js', () => ({ findBedroomIdentificador: vi.fn() }));

import { resolverAutorizadorSalida } from '../src/services/authorizerResolver.service.js';
import { findConfigValue } from '../src/repositories/config.repo.js';
import { findCoordinadorActivo, findPreceptorMatriculaByDormitorio } from '../src/repositories/user.repo.js';
import { findBedroomIdentificador } from '../src/repositories/bedroom.repo.js';

const config = (map) => findConfigValue.mockImplementation(async (k) => map[k]);

describe('resolverAutorizadorSalida (7.4B Commit B)', () => {
    beforeEach(() => vi.clearAllMocks());

    it('PRECEPTOR (default): preceptor del dormitorio del alumno', async () => {
        config({ AUTORIZADOR_SALIDAS: 'PRECEPTOR' });
        findBedroomIdentificador.mockResolvedValue(7);
        findPreceptorMatriculaByDormitorio.mockResolvedValue('273');
        const r = await resolverAutorizadorSalida({ dormitorio: 4 });
        expect(r).toEqual({ idEmpleado: 273, noDepto: 7, modo: 'PRECEPTOR' });
    });

    it('PRECEPTOR sin preceptor resoluble -> error PRECEPTOR_NOT_FOUND', async () => {
        config({ AUTORIZADOR_SALIDAS: 'PRECEPTOR' });
        findBedroomIdentificador.mockResolvedValue(7);
        findPreceptorMatriculaByDormitorio.mockResolvedValue(null);
        expect(await resolverAutorizadorSalida({ dormitorio: 4 })).toEqual({ error: 'PRECEPTOR_NOT_FOUND' });
    });

    it('PRECEPTOR sin dormitorio -> error PRECEPTOR_NOT_FOUND', async () => {
        config({ AUTORIZADOR_SALIDAS: 'PRECEPTOR' });
        expect(await resolverAutorizadorSalida({ dormitorio: null })).toEqual({ error: 'PRECEPTOR_NOT_FOUND' });
    });

    it('COORDINADOR con override explícito en Configuracion', async () => {
        config({ AUTORIZADOR_SALIDAS: 'COORDINADOR', COORDINADOR_IDEMPLEADO: '264', COORDINADOR_NODEPTO: '10' });
        const r = await resolverAutorizadorSalida({ dormitorio: 4 });
        expect(r).toEqual({ idEmpleado: 264, noDepto: 10, modo: 'COORDINADOR' });
        expect(findCoordinadorActivo).not.toHaveBeenCalled();
    });

    it('COORDINADOR sin override -> resuelve por rol (ADMINISTRATIVO activo)', async () => {
        config({ AUTORIZADOR_SALIDAS: 'COORDINADOR', COORDINADOR_IDEMPLEADO: '', COORDINADOR_NODEPTO: '' });
        findCoordinadorActivo.mockResolvedValue({ IdEmpleado: 264, NoDepto: 10 });
        const r = await resolverAutorizadorSalida({ dormitorio: 4 });
        expect(r).toEqual({ idEmpleado: 264, noDepto: 10, modo: 'COORDINADOR' });
    });

    it('COORDINADOR no resoluble -> error AUTORIZADOR_NO_CONFIGURADO', async () => {
        config({ AUTORIZADOR_SALIDAS: 'COORDINADOR', COORDINADOR_IDEMPLEADO: '', COORDINADOR_NODEPTO: '' });
        findCoordinadorActivo.mockResolvedValue(null);
        expect(await resolverAutorizadorSalida({ dormitorio: 4 })).toEqual({ error: 'AUTORIZADOR_NO_CONFIGURADO' });
    });
});
