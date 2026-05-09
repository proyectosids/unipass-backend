import sql from 'mssql';

// Emite un evento a la sala user_{matricula} con log.
export function emitToUser(io, matricula, eventName, data) {
    if (!io || matricula === null || matricula === undefined) return;
    const room = `user_${String(matricula).trim()}`;
    console.log(`[Socket] Emitiendo ${eventName} a ${room}`);
    io.to(room).emit(eventName, data);
}

// Devuelve la matricula original + matriculas de empleados que la cubren
// (cobertura activa via Position.MatriculaEncargado / IdCargoDelegado).
export async function getMatriculasToNotify(pool, matricula) {
    const original = String(matricula).trim();
    const matriculas = [original];
    if (!pool) return matriculas;
    try {
        const result = await pool.request()
            .input('MatriculaOriginal', sql.VarChar, original)
            .query(`SELECT L.Matricula
                    FROM LoginUniPass L
                    INNER JOIN Position P ON L.IdCargoDelegado = P.IdCargo
                    WHERE P.MatriculaEncargado = @MatriculaOriginal
                      AND P.Activo = 1`);
        for (const row of result.recordset) {
            const sub = String(row.Matricula).trim();
            if (!matriculas.includes(sub)) matriculas.push(sub);
        }
    } catch (err) {
        console.error('[Socket] Error obteniendo cobertura:', err.message);
    }
    return matriculas;
}

// Emite a un empleado y a todos los que lo cubren actualmente.
export async function emitToEmpleado(io, pool, matricula, eventName, data) {
    const matriculas = await getMatriculasToNotify(pool, matricula);
    for (const m of matriculas) emitToUser(io, m, eventName, data);
}
