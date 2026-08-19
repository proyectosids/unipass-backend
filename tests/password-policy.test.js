// Task 7.1.B - Unit tests de la política de contraseña (min 8, 1 letra, 1 número).
import { describe, it, expect } from 'vitest';
import { validatePassword } from '../src/util/passwordPolicy.js';

describe('validatePassword (Task 7.1.B)', () => {
    it('acepta 8+ con letra y número', () => {
        expect(validatePassword('abcdefg1').ok).toBe(true);
        expect(validatePassword('Password123').ok).toBe(true);
    });
    it('rechaza < 8 caracteres -> WEAK_PASSWORD', () => {
        const r = validatePassword('abc123'); // 6
        expect(r.ok).toBe(false); expect(r.code).toBe('WEAK_PASSWORD');
    });
    it('rechaza sin número -> WEAK_PASSWORD', () => {
        expect(validatePassword('abcdefgh').code).toBe('WEAK_PASSWORD');
    });
    it('rechaza sin letra -> WEAK_PASSWORD', () => {
        expect(validatePassword('12345678').code).toBe('WEAK_PASSWORD');
    });
});
