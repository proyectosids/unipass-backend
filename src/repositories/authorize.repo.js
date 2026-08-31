import sql from 'mssql';
import { withConnection } from '../database/connection.js';

// Repositorio de Authorize: cadena de aprobacion de un permiso, en orden de
// IdAuthorize (primer eslabon = jefe de trabajo, luego preceptor).

// Idempotente: si ya existe Authorize para (IdPermission, IdEmpleado),
// no inserta duplicado y marca el existente como DualRole.
export const createAuthorize = ({ idEmpleado, noDepto, idPermission, statusAuthorize }) =>
    withConnection(async (pool) => {
        const existing = await pool.request()
            .input('IdPermission', sql.Int, idPermission)
            .input('IdEmpleado', sql.Int, idEmpleado)
            .query(`SELECT IdAuthorize FROM UNIPASS.Authorize
                    WHERE IdPermission = @IdPermission AND IdEmpleado = @IdEmpleado`);

        if (existing.recordset.length > 0) {
            const existingId = existing.recordset[0].IdAuthorize;
            await pool.request()
                .input('IdAuthorize', sql.Int, existingId)
                .query('UPDATE UNIPASS.Authorize SET DualRole = 1 WHERE IdAuthorize = @IdAuthorize');
            return { id: existingId, dualRoleApplied: true };
        }

        const result = await pool.request()
            .input('IdEmpleado', sql.Int, idEmpleado)
            .input('NoDepto', sql.Int, noDepto)
            .input('IdPermission', sql.Int, idPermission)
            .input('StatusAuthorize', sql.VarChar, statusAuthorize)
            .query(`INSERT INTO UNIPASS.Authorize (IdEmpleado, NoDepto, IdPermission, StatusAuthorize)
                    VALUES (@IdEmpleado, @NoDepto, @IdPermission, @StatusAuthorize);
                    SELECT SCOPE_IDENTITY() AS IdAuthorize`);
        if (result.recordset.length === 0) return null;
        return { id: result.recordset[0].IdAuthorize, dualRoleApplied: false };
    });

// RETIRADO (Task 7.4B, Commit A): updateAuthorizeStatus/findUpdatedAuthorize (resolución por
// IdEmpleado del cliente, sin auth ni máquina de estados) fueron ELIMINADAS. La resolución segura y
// atómica vive en resolveAuthorizeLinkTx (abajo), con actor del token y recálculo global en la misma tx.

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
// NOTA de ORDEN: la columna Authorize.Orden NO es fiable (DEFAULT 1 y createPermissionWithChainTx no
// la setea -> cadenas del backend actual quedan con Orden=1 en todos los eslabones). El orden REAL de
// la cadena es la secuencia de inserción = IdAuthorize ascendente (Jefe se inserta antes que Preceptor).
// Por eso el enforcement de "eslabón previo aprobado" usa IdAuthorize, no la columna Orden. (Commit B
// poblará Orden correctamente al mover la creación de cadena server-side para todos los tipos.)
export const resolveAuthorizeLinkTx = ({ idPermission, actorMatricula, nuevoStatus, audit }) =>
    withConnection(async (pool) => {
        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            // 1) Permission con lock (evita carreras con otro eslabón del mismo permiso).
            const permRes = await new sql.Request(tx)
                .input('Id', sql.Int, idPermission)
                .query('SELECT IdPermission, StatusPermission FROM UNIPASS.Permission WITH (UPDLOCK, HOLDLOCK) WHERE IdPermission = @Id');
            if (permRes.recordset.length === 0) { await tx.rollback(); return { error: 'PERMISSION_NOT_FOUND' }; }
            const permAntes = permRes.recordset[0].StatusPermission;

            // 2) Cadena completa (orden real = IdAuthorize ascendente).
            const rowsRes = await new sql.Request(tx)
                .input('Id', sql.Int, idPermission)
                .query('SELECT IdAuthorize, IdEmpleado, StatusAuthorize FROM UNIPASS.Authorize WHERE IdPermission = @Id ORDER BY IdAuthorize');
            const rows = rowsRes.recordset;

            // 3) Fila del actor por matrícula == IdEmpleado. Sin fila -> no es autorizador de este permiso.
            const actorNum = Number(String(actorMatricula ?? '').trim());
            const actorRow = Number.isFinite(actorNum) ? rows.find((r) => r.IdEmpleado === actorNum) : null;
            if (!actorRow) { await tx.rollback(); return { error: 'NOT_AUTHORIZER' }; }

            // 4) Permission debe estar Pendiente (no finalizada ni cancelada).
            if (permAntes !== 'Pendiente') { await tx.rollback(); return { error: 'PERMISSION_NOT_PENDING' }; }

            // 5) Transición válida: la fila del actor debe estar Pendiente (Pendiente -> Aprobada/Rechazada).
            if (actorRow.StatusAuthorize !== 'Pendiente') { await tx.rollback(); return { error: 'INVALID_TRANSITION' }; }

            // 6) Orden estricto: todo eslabón previo (IdAuthorize menor) debe estar Aprobado.
            const previos = rows.filter((r) => r.IdAuthorize < actorRow.IdAuthorize);
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
