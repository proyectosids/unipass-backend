// Task 7.4A - Unit tests de la resolución de cadena Pueblo (deps mockeadas, sin BD ni HTTP).
import { describe, it, expect, vi } from 'vitest';
import { resolvePuebloChain, ChainError } from '../src/util/puebloChain.js';

// Helpers para armar deps
const deps = (over = {}) => ({
    getStudentData: async () => ({ type: 'ALUMNO', work: [{ 'ID DEPTO': 302, 'ID JEFE': 213 }] }),
    getDepartmentHead: async () => ({ EmpMatricula: '213' }),
    getPreceptor: async () => ({ 'ID JEFE': 41 }),
    resolveLocalUser: async (m) => ({ IdLogin: m === '213' ? 100 : 3, StatusActividad: 1 }),
    onMismatch: () => {},
    ...over
});

describe('resolvePuebloChain (Task 7.4A)', () => {
    it('Caso A: Jefe != Preceptor -> 2 eslabones, orden 1 Jefe, orden 2 Preceptor', async () => {
        const r = await resolvePuebloChain(deps(), { matricula: '221068', identificador: 318 });
        expect(r).toHaveLength(2);
        expect(r[0]).toMatchObject({ orden: 1, matricula: '213', rol: 'Jefe de trabajo' });
        expect(r[1]).toMatchObject({ orden: 2, matricula: '41', rol: 'Preceptor' });
    });

    it('Caso B: Jefe == Preceptor -> 1 solo eslabon (dedupe)', async () => {
        const r = await resolvePuebloChain(deps({
            getDepartmentHead: async () => ({ EmpMatricula: '41' }),   // jefe = 41
            getPreceptor: async () => ({ 'ID JEFE': 41 }),             // preceptor = 41
            resolveLocalUser: async () => ({ IdLogin: 3, StatusActividad: 1 })
        }), { matricula: '221068', identificador: 318 });
        expect(r).toHaveLength(1);
        expect(r[0]).toMatchObject({ orden: 1, matricula: '41', rol: 'Jefe de trabajo' });
    });

    it('Caso D: alumno sin work -> STUDENT_WORK_NOT_FOUND', async () => {
        await expect(resolvePuebloChain(deps({ getStudentData: async () => ({ type: 'ALUMNO', work: [] }) }),
            { matricula: '1', identificador: 318 })).rejects.toMatchObject({ code: 'STUDENT_WORK_NOT_FOUND' });
    });

    it('Caso E: jefe de depto no resuelto -> DEPARTMENT_HEAD_NOT_FOUND', async () => {
        await expect(resolvePuebloChain(deps({ getDepartmentHead: async () => null }),
            { matricula: '1', identificador: 318 })).rejects.toMatchObject({ code: 'DEPARTMENT_HEAD_NOT_FOUND' });
    });

    it('Caso C: preceptor no resuelto -> PRECEPTOR_NOT_FOUND', async () => {
        await expect(resolvePuebloChain(deps({ getPreceptor: async () => null }),
            { matricula: '1', identificador: 318 })).rejects.toMatchObject({ code: 'PRECEPTOR_NOT_FOUND' });
    });

    it('Caso F: autorizador institucional sin cuenta UniPass -> AUTHORIZER_NOT_REGISTERED', async () => {
        await expect(resolvePuebloChain(deps({ resolveLocalUser: async () => null }),
            { matricula: '1', identificador: 318 })).rejects.toMatchObject({ code: 'AUTHORIZER_NOT_REGISTERED' });
    });

    it('cross-check: work.ID JEFE != JefeDepto.EmpMatricula -> warn, no bloquea', async () => {
        const onMismatch = vi.fn();
        const r = await resolvePuebloChain(deps({
            getStudentData: async () => ({ type: 'ALUMNO', work: [{ 'ID DEPTO': 302, 'ID JEFE': 999 }] }), // stale
            onMismatch
        }), { matricula: '221068', identificador: 318 });
        expect(onMismatch).toHaveBeenCalledOnce();
        expect(r[0].matricula).toBe('213'); // usa JefeDepto (vigente), no el 999 stale
    });

    it('Caso G: API-ULV cae -> propaga el code de transporte (no ChainError)', async () => {
        const boom = Object.assign(new Error('ULV_API_UNAVAILABLE'), { code: 'ULV_API_UNAVAILABLE' });
        await expect(resolvePuebloChain(deps({ getStudentData: async () => { throw boom; } }),
            { matricula: '1', identificador: 318 })).rejects.toMatchObject({ code: 'ULV_API_UNAVAILABLE' });
    });
});
