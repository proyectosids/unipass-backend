import sql from 'mssql';
import { withConnection } from '../database/connection.js';

// Repositorio de Authorize: cadena de aprobacion de un permiso. Orden de la cadena = columna Orden
// (autoritativa para cadenas nuevas) con fallback IdAuthorize ascendente para cadenas historicas.

// RETIRADO (Task 7.4B, Commit B): createAuthorize (alta de fila por datos del cliente) fue ELIMINADO
// junto con POST /authorize. La creacion de la cadena es interna (createPermissionWithChainTx en
// permission.repo), siempre 'Pendiente' y con Orden/DualRole autoritativos.

// RETIRADO (Task 7.4B, Commit A): updateAuthorizeStatus/findUpdatedAuthorize (resolución por
// IdEmpleado del cliente, sin auth ni máquina de estados) fueron ELIMINADAS. La resolución segura y
// atómica vive en resolveAuthorizeLinkTx (abajo), con actor del token y recálculo global en la misma tx.

// Checks Hardening C1 (Opción B) - Crea IDEMPOTENTEMENTE los 4 CheckPoints de un permiso DENTRO de la
// transacción de aprobación. Resuelve los Points por CATÁLOGO (Point.IdExit = IdTipoSalida): exige un
// 'Dormitorio' y un 'Caseta' (no se hardcodean IdPoint). Combos: SALIDA/Dorm, SALIDA/Caseta,
// RETORNO/Caseta, RETORNO/Dorm — todos 'Pendiente'. Idempotente (INSERT ... WHERE NOT EXISTS),
// respaldado por UNIQUE(IdPermission,IdPoint,Accion) como última defensa de concurrencia.
// Devuelve { ok:true } o { error:'CHECKPOINT_CONFIGURATION_INCOMPLETE' } si el catálogo Point no tiene
// exactamente los 2 puntos requeridos (el llamador hace ROLLBACK: no se crean checks parciales).
const ensureCheckPointsTx = async (tx, idPermission, idTipoSalida) => {
    const pts = (await new sql.Request(tx)
        .input('IdExit', sql.Int, idTipoSalida)
        .query('SELECT IdPoint, NombrePunto FROM UNIPASS.Point WHERE IdExit = @IdExit')).recordset;
    const dorm = pts.find((p) => p.NombrePunto === 'Dormitorio');
    const caseta = pts.find((p) => p.NombrePunto === 'Caseta');
    if (!dorm || !caseta) return { error: 'CHECKPOINT_CONFIGURATION_INCOMPLETE' };

    const combos = [
        { idPoint: dorm.IdPoint, accion: 'SALIDA' },   // paso 1
        { idPoint: caseta.IdPoint, accion: 'SALIDA' }, // paso 2
        { idPoint: caseta.IdPoint, accion: 'RETORNO' },// paso 3
        { idPoint: dorm.IdPoint, accion: 'RETORNO' }   // paso 4
    ];
    for (const c of combos) {
        await new sql.Request(tx)
            .input('IdPermission', sql.Int, idPermission)
            .input('IdPoint', sql.Int, c.idPoint)
            .input('Accion', sql.VarChar, c.accion)
            .query(`INSERT INTO UNIPASS.CheckPoints (Estatus, Accion, IdPoint, IdPermission)
                    SELECT 'Pendiente', @Accion, @IdPoint, @IdPermission
                    WHERE NOT EXISTS (
                        SELECT 1 FROM UNIPASS.CheckPoints
                        WHERE IdPermission = @IdPermission AND IdPoint = @IdPoint AND Accion = @Accion)`);
    }
    return { ok: true };
};

export const findNextPendingEmpleado = (idPermission) =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .input('IdPermisoChain', sql.Int, idPermission)
            .query(`SELECT TOP 1 IdEmpleado FROM UNIPASS.Authorize
                    WHERE IdPermission = @IdPermisoChain
                      AND StatusAuthorize = 'Pendiente'
                    ORDER BY IdAuthorize`);
        return result.recordset[0]?.IdEmpleado || null;
    });

export const findAuthorizeByEmpleadoAndPermiso = (idEmpleado, idPermiso) =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .input('IdEmpleado', sql.Int, idEmpleado)
            .input('IdPermiso', sql.Int, idPermiso)
            .query('SELECT * FROM UNIPASS.Authorize WHERE IdEmpleado = @IdEmpleado AND IdPermission = @IdPermiso');
        return result.recordset[0] || null;
    });

// Task 7.4B (Commit A) - Resolución SEGURA y ATÓMICA de un eslabón. El actor se identifica por su
// MATRÍCULA (resuelta server-side desde el token), NUNCA por el body. En una sola transacción:
// carga Permission (lock) -> ubica la fila del actor -> valida estado y Orden estricto -> actualiza
// la fila -> recalcula el estado global de Permission -> inserta AuditLog. Cualquier error -> ROLLBACK.
//
// NOTA de ORDEN: desde Commit B las cadenas NUEVAS persisten Orden autoritativo (1=Jefe, 2=Preceptor;
// salidas 2/3 = Orden 1). Para cadenas HISTÓRICAS mal pobladas (Orden=1,1) el valor no distingue la
// secuencia -> se usa un fallback determinista: IdAuthorize ascendente (orden de inserción). La clave
// de orden se decide por permiso (Orden si es distinguible; si hay duplicados -> IdAuthorize).
export const resolveAuthorizeLinkTx = ({ idPermission, actorMatricula, nuevoStatus, audit }) =>
    withConnection(async (pool) => {
        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            // 1) Permission con lock (evita carreras con otro eslabón del mismo permiso).
            const permRes = await new sql.Request(tx)
                .input('Id', sql.Int, idPermission)
                .query('SELECT IdPermission, StatusPermission, IdTipoSalida FROM UNIPASS.Permission WITH (UPDLOCK, HOLDLOCK) WHERE IdPermission = @Id');
            if (permRes.recordset.length === 0) { await tx.rollback(); return { error: 'PERMISSION_NOT_FOUND' }; }
            const permAntes = permRes.recordset[0].StatusPermission;
            const idTipoSalida = permRes.recordset[0].IdTipoSalida;

            // 2) Cadena completa. Clave de orden: `Orden` AUTORITATIVO para cadenas nuevas (Commit B lo
            //    persiste). Si hay Orden duplicados (cadenas HISTÓRICAS mal pobladas, p.ej. 1,1) el valor
            //    no distingue la secuencia -> fallback seguro a IdAuthorize ascendente (orden de inserción).
            const rowsRes = await new sql.Request(tx)
                .input('Id', sql.Int, idPermission)
                .query('SELECT IdAuthorize, IdEmpleado, StatusAuthorize, Orden FROM UNIPASS.Authorize WHERE IdPermission = @Id ORDER BY IdAuthorize');
            const rows = rowsRes.recordset;
            const ordenDistinguible = new Set(rows.map((r) => r.Orden)).size === rows.length;
            const claveOrden = (r) => (ordenDistinguible ? r.Orden : r.IdAuthorize);

            // 3) Fila del actor por matrícula == IdEmpleado. Sin fila -> no es autorizador de este permiso.
            const actorNum = Number(String(actorMatricula ?? '').trim());
            const actorRow = Number.isFinite(actorNum) ? rows.find((r) => r.IdEmpleado === actorNum) : null;
            if (!actorRow) { await tx.rollback(); return { error: 'NOT_AUTHORIZER' }; }

            // 4) Permission debe estar Pendiente (no finalizada ni cancelada).
            if (permAntes !== 'Pendiente') { await tx.rollback(); return { error: 'PERMISSION_NOT_PENDING' }; }

            // 5) Transición válida: la fila del actor debe estar Pendiente (Pendiente -> Aprobada/Rechazada).
            if (actorRow.StatusAuthorize !== 'Pendiente') { await tx.rollback(); return { error: 'INVALID_TRANSITION' }; }

            // 6) Orden estricto: todo eslabón previo (clave de orden menor) debe estar Aprobado.
            const previos = rows.filter((r) => claveOrden(r) < claveOrden(actorRow));
            if (previos.some((r) => r.StatusAuthorize !== 'Aprobada')) { await tx.rollback(); return { error: 'ORDER_NOT_READY' }; }

            // 7) Actualizar SOLO la fila del actor (guard de concurrencia sobre Pendiente).
            const upd = await new sql.Request(tx)
                .input('IdAuthorize', sql.Int, actorRow.IdAuthorize)
                .input('Status', sql.VarChar, nuevoStatus)
                .query(`UPDATE UNIPASS.Authorize SET StatusAuthorize = @Status, FechaAprobacion = GETDATE()
                        WHERE IdAuthorize = @IdAuthorize AND StatusAuthorize = 'Pendiente'`);
            if (upd.rowsAffected[0] !== 1) { await tx.rollback(); return { error: 'INVALID_TRANSITION' }; }

            // 8) Recalcular estado global desde el conjunto ya actualizado (en memoria).
            const nuevos = rows.map((r) => (r.IdAuthorize === actorRow.IdAuthorize ? { ...r, StatusAuthorize: nuevoStatus } : r));
            let permDespues;
            if (nuevos.some((r) => r.StatusAuthorize === 'Rechazada')) permDespues = 'Rechazada';
            else if (nuevos.every((r) => r.StatusAuthorize === 'Aprobada')) permDespues = 'Aprobada';
            else permDespues = 'Pendiente';

            // 8b) TRANSICIÓN real a Aprobada (estadoAnterior != 'Aprobada' && estadoNuevo == 'Aprobada')
            //     -> crear los 4 CheckPoints en la MISMA transacción. Obligatorio: si falla la creación,
            //     ROLLBACK completo (no debe quedar Permission=Aprobada sin sus checks). Solo en la
            //     transición: un reintento/cadena ya resuelta no regenera artefactos.
            if (permAntes !== 'Aprobada' && permDespues === 'Aprobada') {
                const chk = await ensureCheckPointsTx(tx, idPermission, idTipoSalida);
                if (chk.error) { await tx.rollback(); return { error: chk.error }; }
            }

            // 9) Actualizar Permission solo si cambió.
            if (permDespues !== permAntes) {
                await new sql.Request(tx)
                    .input('Id', sql.Int, idPermission)
                    .input('Status', sql.VarChar, permDespues)
                    .query('UPDATE UNIPASS.Permission SET StatusPermission = @Status WHERE IdPermission = @Id');
            }

            // 10) AuditLog DENTRO de la transacción. El actor SIEMPRE proviene del token (audit.*).
            await new sql.Request(tx)
                .input('ActorIdLogin', sql.Int, audit.actorIdLogin ?? null)
                .input('ActorMatricula', sql.VarChar(15), audit.actorMatricula ?? null)
                .input('Capability', sql.NVarChar(20), null)
                .input('Permission', sql.NVarChar(40), null)
                .input('Accion', sql.NVarChar(60), audit.accion)
                .input('Recurso', sql.NVarChar(40), 'Permission')
                .input('RecursoId', sql.NVarChar(40), String(idPermission))
                .input('Resultado', sql.NVarChar(12), 'SUCCESS')
                .input('DatosAntes', sql.NVarChar(sql.MAX), JSON.stringify({ idAuthorize: actorRow.IdAuthorize, authorize: actorRow.StatusAuthorize, permission: permAntes }))
                .input('DatosDespues', sql.NVarChar(sql.MAX), JSON.stringify({ idAuthorize: actorRow.IdAuthorize, authorize: nuevoStatus, permission: permDespues }))
                .input('Ip', sql.VarChar(45), audit.ip ?? null)
                .input('Endpoint', sql.NVarChar(120), audit.endpoint ?? null)
                .input('Metodo', sql.VarChar(10), audit.metodo ?? null)
                .input('Contexto', sql.NVarChar(300), `IdAuthorize=${actorRow.IdAuthorize}`)
                .query(`INSERT INTO UNIPASS.AuditLog
                        (ActorIdLogin, ActorMatricula, Capability, Permission, Accion, Recurso, RecursoId, Resultado, DatosAntes, DatosDespues, Ip, Endpoint, Metodo, Contexto)
                        VALUES
                        (@ActorIdLogin, @ActorMatricula, @Capability, @Permission, @Accion, @Recurso, @RecursoId, @Resultado, @DatosAntes, @DatosDespues, @Ip, @Endpoint, @Metodo, @Contexto)`);

            await tx.commit();
            return { ok: true, idAuthorize: actorRow.IdAuthorize, authAntes: actorRow.StatusAuthorize, authDespues: nuevoStatus, permAntes, permDespues };
        } catch (error) {
            try { await tx.rollback(); } catch (rbErr) { console.error('[Tx] rollback error:', rbErr.message); }
            throw error;
        }
    });

export const findAllAuthorizeByPermission = (idPermission) =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .input('Id', sql.Int, idPermission)
            .query(`SELECT
                        A.IdAuthorize,
                        A.IdEmpleado,
                        A.NoDepto,
                        A.IdPermission,
                        A.StatusAuthorize,
                        A.FechaAprobacion,
                        A.DualRole,
                        CASE
                            WHEN L.TipoUser = 'EMPLEADO' THEN 'Jefe de trabajo'
                            WHEN L.TipoUser = 'PRECEPTOR' THEN 'Preceptor'
                            WHEN L.TipoUser = 'VIGILANCIA' THEN 'Vigilancia'
                            WHEN L.TipoUser = 'ADMINISTRATIVO' THEN 'Administración'
                            ELSE 'Aprobador'
                        END AS Rol,
                        LTRIM(RTRIM(CONCAT(L.Nombre, ' ', L.Apellidos))) AS NombreAprobador,
                        ROW_NUMBER() OVER (ORDER BY A.IdAuthorize) AS Orden
                    FROM UNIPASS.Authorize A
                    LEFT JOIN UNIPASS.LoginUniPass L ON L.Matricula = CAST(A.IdEmpleado AS VARCHAR(20))
                    WHERE A.IdPermission = @Id
                    ORDER BY A.IdAuthorize`);
        return result.recordset;
    });
