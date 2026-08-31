// Task 7.4B (Commit B) - Resolución SERVER-SIDE del autorizador de salidas Especial(2)/A Casa(3).
// Reutiliza la MISMA regla institucional que GET /autorizadorSalida (switch AUTORIZADOR_SALIDAS en
// UNIPASS.Configuracion), pero como service interno: NO se llama por HTTP al propio endpoint y NO se
// acepta ningún dato de autorizador del cliente. La entrada autoritativa es el dormitorio ASIGNADO
// al alumno (LoginUniPass.Dormitorio), no sexo/nivel enviados por el cliente.
import { findConfigValue } from '../repositories/config.repo.js';
import { findCoordinadorActivo, findPreceptorMatriculaByDormitorio } from '../repositories/user.repo.js';
import { findBedroomIdentificador } from '../repositories/bedroom.repo.js';

// Entero > 0 o null (un valor vacío en Configuracion equivale a "sin override").
const enteroPositivoONull = (valor) => {
    const n = Number(valor);
    return Number.isInteger(n) && n > 0 ? n : null;
};

// Resuelve el ÚNICO autorizador (Orden 1) de una salida 2/3.
// Devuelve { idEmpleado, noDepto, modo } o { error: 'AUTORIZADOR_NO_CONFIGURADO' | 'PRECEPTOR_NOT_FOUND' }.
export const resolverAutorizadorSalida = async ({ dormitorio }) => {
    const modo = ((await findConfigValue('AUTORIZADOR_SALIDAS')) || 'PRECEPTOR').toUpperCase();

    if (modo === 'COORDINADOR') {
        // Híbrido: override explícito en Configuracion; si falta, coordinador (ADMINISTRATIVO) activo.
        let idEmpleado = enteroPositivoONull(await findConfigValue('COORDINADOR_IDEMPLEADO'));
        let noDepto = enteroPositivoONull(await findConfigValue('COORDINADOR_NODEPTO'));
        if (idEmpleado == null || noDepto == null) {
            const coord = await findCoordinadorActivo();
            idEmpleado = enteroPositivoONull(coord?.IdEmpleado);
            noDepto = enteroPositivoONull(coord?.NoDepto);
        }
        if (idEmpleado == null || noDepto == null) return { error: 'AUTORIZADOR_NO_CONFIGURADO' };
        return { idEmpleado, noDepto, modo: 'COORDINADOR' };
    }

    // PRECEPTOR (default): preceptor del dormitorio ASIGNADO al alumno. Mismo resultado que la ruta
    // por sexo+nivel, pero tomado de la asignación real del alumno (sin entrada del cliente).
    if (dormitorio == null) return { error: 'PRECEPTOR_NOT_FOUND' };
    const noDepto = enteroPositivoONull(await findBedroomIdentificador(dormitorio));
    const matriculaPreceptor = await findPreceptorMatriculaByDormitorio(dormitorio);
    const idEmpleado = enteroPositivoONull(matriculaPreceptor);
    if (noDepto == null || idEmpleado == null) return { error: 'PRECEPTOR_NOT_FOUND' };
    return { idEmpleado, noDepto, modo: 'PRECEPTOR' };
};
