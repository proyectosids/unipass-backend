import sql from 'mssql';
import { withConnection } from '../database/connection.js';
import { resolveRequiredDocumentIds } from '../util/documentRequirements.js';

// Repositorio de Doctos + DocumentCatalog (expediente documental del alumno).
// Regla de dormitorio: IdDormitorio = 5 significa vista global (dormitorios 1-4).

// === Task 7.3 D1-A.2: completitud documental (fuente de verdad server-side) ===
// nivel+sexo se resuelven de DB (LoginUniPass.Sexo + Bedroom.NivelDormitorio via Dormitorio), NUNCA del
// cliente. `complete` = todos los requeridos presentes AND ninguno 'Rechazado'. Aprobado NO es requerido.
const _evaluarDocumentacion = async (nuevaReq, idLogin) => {
    const u = (await nuevaReq()
        .input('id', sql.Int, idLogin)
        .query(`SELECT lp.Sexo, b.NivelDormitorio
                FROM UNIPASS.LoginUniPass lp
                LEFT JOIN UNIPASS.Bedroom b ON b.IdBedroom = lp.Dormitorio
                WHERE lp.IdLogin = @id`)).recordset[0];
    if (!u) return { error: 'DOCUMENT_REQUIREMENTS_UNRESOLVED' };
    const required = resolveRequiredDocumentIds({ nivelDormitorio: u.NivelDormitorio, sexo: u.Sexo });
    if (!required) return { error: 'DOCUMENT_REQUIREMENTS_UNRESOLVED' };

    const docs = (await nuevaReq()
        .input('id', sql.Int, idLogin)
        .query('SELECT IdDocumento, StatusRevision FROM UNIPASS.Doctos WHERE IdLogin = @id')).recordset;
    const status = new Map(docs.map((d) => [d.IdDocumento, d.StatusRevision]));
    const present = required.filter((id) => status.has(id));
    const missing = required.filter((id) => !status.has(id));
    const rejected = required.filter((id) => status.get(id) === 'Rechazado');
    return { complete: missing.length === 0 && rejected.length === 0, required, present, missing, rejected };
};

// Evaluación de LECTURA (sin escribir). Autoridad para el gate de POST /permission.
export const evaluateDocumentation = (idLogin) =>
    withConnection(async (pool) => _evaluarDocumentacion(() => pool.request(), idLogin));

// Recalcula y persiste LoginUniPass.Documentacion (0/1) DENTRO de una tx existente (mismo commit que la
// mutación). No resoluble -> 0 (no completo). Solo escribe si cambió. Devuelve la evaluación.
export const recalcDocumentacionInTx = async (tx, idLogin) => {
    const ev = await _evaluarDocumentacion(() => new sql.Request(tx), idLogin);
    const val = ev.error ? 0 : (ev.complete ? 1 : 0);
    await new sql.Request(tx)
        .input('id', sql.Int, idLogin)
        .input('v', sql.Int, val)
        .query('UPDATE UNIPASS.LoginUniPass SET Documentacion = @v WHERE IdLogin = @id AND (Documentacion IS NULL OR Documentacion <> @v)');
    return ev;
};

// Recalcula Documentacion en su propia tx (para el bridge legacy /Documentacion). Devuelve 0/1.
export const recalculateDocumentationStatus = (idLogin) =>
    withConnection(async (pool) => {
        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            const ev = await recalcDocumentacionInTx(tx, idLogin);
            await tx.commit();
            return ev.error ? 0 : (ev.complete ? 1 : 0);
        } catch (error) {
            try { await tx.rollback(); } catch (rbErr) { console.error('[Tx] rollback error:', rbErr.message); }
            throw error;
        }
    });

export const findDocumentByLoginAndType = (idLogin, idDocumento) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('id', sql.Int, idLogin)
            .input('IdDocumento', sql.Int, idDocumento)
            .query('SELECT IdDoctos, Archivo FROM UNIPASS.Doctos WHERE IdLogin = @id AND IdDocumento = @IdDocumento');
        return result.recordset[0] || null;
    });

export const findDocumentsByLogin = (idLogin) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('Id', sql.Int, idLogin)
            .query(`
                SELECT
                    D.IdDoctos,
                    D.IdLogin,
                    D.IdDocumento,
                    D.Archivo,
                    D.StatusDoctos,
                    D.StatusRevision,
                    D.MotivoRechazo,
                    D.ComentarioRechazo,
                    D.FechaRechazo,
                    DC.TipoDocumento,
                    LTRIM(RTRIM(CONCAT(LP.Nombre, ' ', LP.Apellidos))) AS RechazadoPor
                FROM UNIPASS.Doctos D
                LEFT JOIN UNIPASS.DocumentCatalog DC ON DC.IdDocument = D.IdDocumento
                LEFT JOIN UNIPASS.LoginUniPass LP ON LP.Matricula = D.RechazadoPor
                WHERE D.IdLogin = @Id
            `);
        return result.recordset;
    });

// Upsert TRANSACCIONAL (Task 7.3 D1-A.2): si ya existe (IdLogin, IdDocumento) actualiza limpiando los
// campos de rechazo (Rechazado -> Pendiente); si no, inserta. Recalcula Documentacion en la MISMA tx.
export const createDocument = ({ idDocumento, archivo, idLogin, statusDoctos = 'Adjunto' }) =>
    withConnection(async (pool) => {
        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            const existing = await new sql.Request(tx)
                .input('IdLogin', sql.Int, idLogin)
                .input('IdDocumento', sql.Int, idDocumento)
                .query('SELECT IdDoctos FROM UNIPASS.Doctos WHERE IdLogin = @IdLogin AND IdDocumento = @IdDocumento');

            let idDoctos;
            if (existing.recordset.length > 0) {
                idDoctos = existing.recordset[0].IdDoctos;
                await new sql.Request(tx)
                    .input('IdDoctos', sql.Int, idDoctos)
                    .input('Archivo', sql.VarChar, archivo)
                    .input('StatusDoctos', sql.VarChar, statusDoctos)
                    .query(`UPDATE UNIPASS.Doctos
                            SET Archivo=@Archivo, StatusDoctos=@StatusDoctos, StatusRevision='Pendiente',
                                MotivoRechazo=NULL, ComentarioRechazo=NULL, RechazadoPor=NULL, FechaRechazo=NULL
                            WHERE IdDoctos=@IdDoctos`);
            } else {
                const ins = await new sql.Request(tx)
                    .input('IdDocumento', sql.Int, idDocumento)
                    .input('Archivo', sql.VarChar, archivo)
                    .input('StatusDoctos', sql.VarChar, statusDoctos)
                    .input('IdLogin', sql.Int, idLogin)
                    .query(`INSERT INTO UNIPASS.Doctos (IdDocumento, Archivo, StatusDoctos, IdLogin)
                            VALUES (@IdDocumento, @Archivo, @StatusDoctos, @IdLogin);
                            SELECT SCOPE_IDENTITY() AS IdDoctos`);
                idDoctos = ins.recordset[0].IdDoctos;
            }
            await recalcDocumentacionInTx(tx, idLogin); // completitud atómica con el upsert
            await tx.commit();
            return idDoctos;
        } catch (error) {
            try { await tx.rollback(); } catch (rbErr) { console.error('[Tx] rollback error:', rbErr.message); }
            throw error;
        }
    });

export const updateDocumentArchivo = (idLogin, idDocumento, archivo) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('IdDocumento', sql.Int, idDocumento)
            .input('Archivo', sql.VarChar, archivo)
            .input('IdLogin', sql.Int, idLogin)
            .query(`UPDATE UNIPASS.Doctos
                    SET Archivo = @Archivo,
                        StatusRevision = 'Pendiente',
                        MotivoRechazo = NULL,
                        ComentarioRechazo = NULL,
                        RechazadoPor = NULL,
                        FechaRechazo = NULL
                    WHERE IdDocumento = @IdDocumento AND IdLogin = @IdLogin`);
        return result.rowsAffected[0] > 0;
    });

export const deleteDocument = (idLogin, idDocumento) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('Id', sql.Int, idLogin)
            .input('IdDocumento', sql.Int, idDocumento)
            .query('DELETE FROM UNIPASS.Doctos WHERE IdLogin = @Id AND IdDocumento = @IdDocumento');
        return result.rowsAffected[0] > 0;
    });

// Documento por su id UNICO (IdDoctos). Devuelve dueño (IdLogin) + Archivo, para
// validar ownership antes de borrar (403 ajeno / 404 inexistente). null si no existe.
export const findDocumentById = (idDoctos) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('IdDoctos', sql.Int, idDoctos)
            .query('SELECT IdDoctos, IdLogin, Archivo FROM UNIPASS.Doctos WHERE IdDoctos = @IdDoctos');
        return result.recordset[0] || null;
    });

export const deleteDocumentById = (idDoctos) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('IdDoctos', sql.Int, idDoctos)
            .query('DELETE FROM UNIPASS.Doctos WHERE IdDoctos = @IdDoctos');
        return result.rowsAffected[0] > 0;
    });

// Task 7.3 D1-A.2: borrado SELF + recálculo de Documentacion en UNA transacción (atómico con el borrado).
export const deleteDocumentByIdAndRecalcTx = ({ idDoctos, idLogin }) =>
    withConnection(async (pool) => {
        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            const del = await new sql.Request(tx).input('IdDoctos', sql.Int, idDoctos)
                .query('DELETE FROM UNIPASS.Doctos WHERE IdDoctos = @IdDoctos');
            await recalcDocumentacionInTx(tx, idLogin);
            await tx.commit();
            return del.rowsAffected[0] > 0;
        } catch (error) {
            try { await tx.rollback(); } catch (rbErr) { console.error('[Tx] rollback error:', rbErr.message); }
            throw error;
        }
    });

export const deleteDocumentByTypeAndRecalcTx = ({ idLogin, idDocumento }) =>
    withConnection(async (pool) => {
        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            const del = await new sql.Request(tx).input('Id', sql.Int, idLogin).input('IdDocumento', sql.Int, idDocumento)
                .query('DELETE FROM UNIPASS.Doctos WHERE IdLogin = @Id AND IdDocumento = @IdDocumento');
            await recalcDocumentacionInTx(tx, idLogin);
            await tx.commit();
            return del.rowsAffected[0] > 0;
        } catch (error) {
            try { await tx.rollback(); } catch (rbErr) { console.error('[Tx] rollback error:', rbErr.message); }
            throw error;
        }
    });

// Task 7.3 D2-A: alumnos revisables de un dormitorio (para el preceptor de ESE dorm). Allowlist mínima
// (IdLogin para identificar el recurso en la siguiente lectura; NO nombre como identificador). Sin dorm=5.
export const findReviewStudentsByDorm = (dormitorio) =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .input('Dorm', sql.Int, dormitorio)
            .query(`SELECT IdLogin, Nombre, Apellidos, Matricula
                    FROM UNIPASS.LoginUniPass
                    WHERE TipoUser = 'ALUMNO' AND Dormitorio = @Dorm
                    ORDER BY Nombre, Apellidos`);
        return result.recordset;
    });

// Foto de perfil (IdDocumento=6) de un usuario. Allowlist: solo IdDoctos + Archivo (ruta). null si no hay.
export const findProfilePhoto = (idLogin) =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .input('id', sql.Int, idLogin)
            .query("SELECT IdDoctos, Archivo FROM UNIPASS.Doctos WHERE IdLogin = @id AND IdDocumento = 6");
        return result.recordset[0] || null;
    });

// Task 7.3 D2-B2: documento por PK (IdDoctos) para la entrega autenticada de binarios. Allowlist mínima
// (dueño + tipo + ruta) para decidir autorización server-side; sin SELECT *. null si no existe la fila.
export const findDocumentFileByIdDoctos = (idDoctos) =>
    withConnection(async (pool) => {
        const result = await pool.request()
            .input('id', sql.Int, idDoctos)
            .query("SELECT IdDoctos, IdLogin, IdDocumento, Archivo FROM UNIPASS.Doctos WHERE IdDoctos = @id");
        return result.recordset[0] || null;
    });

export const findExpedientesByDormitorio = (idDormitorio) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('IdDormitorio', sql.Int, idDormitorio)
            .query(`
                SELECT DISTINCT L.Matricula, L.Nombre, L.Apellidos
                FROM UNIPASS.Doctos D
                INNER JOIN UNIPASS.DocumentCatalog DC ON DC.IdDocument = D.IdDocumento
                INNER JOIN UNIPASS.LoginUniPass L ON L.IdLogin = D.IdLogin
                WHERE L.TipoUser = 'ALUMNO'
                  AND (
                      (@IdDormitorio = 5 AND L.Dormitorio BETWEEN 1 AND 4)
                      OR
                      (@IdDormitorio <> 5 AND L.Dormitorio = @IdDormitorio)
                  );
            `);
        return result.recordset;
    });

export const findArchivosFiltered = ({ dormitorio, nombre, apellidos, matricula }) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('Dormitorio', sql.Int, dormitorio)
            .input('Nombre', sql.VarChar, nombre || null)
            .input('Apellidos', sql.VarChar, apellidos || null)
            .input('Matricula', sql.VarChar, matricula || null)
            .query(`
                SELECT
                    Doctos.*,
                    DocumentCatalog.*,
                    LTRIM(RTRIM(CONCAT(LR.Nombre, ' ', LR.Apellidos))) AS NombreRechazadoPor
                FROM UNIPASS.Doctos
                INNER JOIN UNIPASS.DocumentCatalog ON DocumentCatalog.IdDocument = Doctos.IdDocumento
                INNER JOIN UNIPASS.LoginUniPass ON LoginUniPass.IdLogin = Doctos.IdLogin
                LEFT JOIN UNIPASS.LoginUniPass LR ON LR.Matricula = Doctos.RechazadoPor
                WHERE DocumentCatalog.Estado = 'Activo'
                  AND (
                      (@Dormitorio = 5 AND LoginUniPass.Matricula = @Matricula)
                      OR (@Dormitorio <> 5 AND
                          LoginUniPass.Dormitorio = @Dormitorio AND
                          (@Nombre IS NULL OR LoginUniPass.Nombre = @Nombre) AND
                          (@Apellidos IS NULL OR LoginUniPass.Apellidos = @Apellidos)
                      )
                  );
            `);
        return result.recordset;
    });

// RETIRADO (Task 7.3 D1-A): approveDocument (PUT /statusRevision, 0 consumidores Flutter, anónimo) y
// rejectDocument (por IdLogin+IdDocumento con RechazadoPor = matrícula del CLIENTE -> impersonación)
// fueron ELIMINADAS. El rechazo seguro y atómico vive en rejectDocumentTx (abajo): actor del token,
// scope de dormitorio server-side, máquina de estados y AuditLog en una transacción.

// Task 7.3 D1-A - Rechazo SEGURO y ATÓMICO de un documento (identificado por IdDoctos). En una tx:
// carga el doc (lock) -> valida SCOPE (dormitorio dueño == dormitorio del preceptor, server-side) ->
// máquina de estados (Pendiente -> Rechazado, guardado también en el WHERE del UPDATE) -> persiste
// RechazadoPor = MATRÍCULA DEL ACTOR (token, nunca del cliente) -> AuditLog. Devuelve dueño/tipo para
// la notificación post-commit. Errores de dominio -> { error }.
export const rejectDocumentTx = ({ idDoctos, actorMatricula, actorDormitorio, motivo, comentario, audit }) =>
    withConnection(async (pool) => {
        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            const docRes = await new sql.Request(tx)
                .input('Id', sql.Int, idDoctos)
                .query('SELECT IdDoctos, IdLogin, IdDocumento, StatusRevision FROM UNIPASS.Doctos WITH (UPDLOCK, HOLDLOCK) WHERE IdDoctos = @Id');
            if (docRes.recordset.length === 0) { await tx.rollback(); return { error: 'DOCUMENT_NOT_FOUND' }; }
            const doc = docRes.recordset[0];

            // Scope: dormitorio del dueño == dormitorio del preceptor (ambos server-side).
            const ownerRes = await new sql.Request(tx)
                .input('Id', sql.Int, doc.IdLogin)
                .query('SELECT Dormitorio FROM UNIPASS.LoginUniPass WHERE IdLogin = @Id');
            const ownerDorm = ownerRes.recordset[0]?.Dormitorio ?? null;
            if (ownerDorm == null || actorDormitorio == null || Number(ownerDorm) !== Number(actorDormitorio)) {
                await tx.rollback(); return { error: 'FORBIDDEN_DOCUMENT_SCOPE' };
            }

            // Máquina de estados: solo Pendiente -> Rechazado (guard en memoria y en el UPDATE).
            if (doc.StatusRevision !== 'Pendiente') { await tx.rollback(); return { error: 'INVALID_DOCUMENT_TRANSITION' }; }

            const upd = await new sql.Request(tx)
                .input('Id', sql.Int, idDoctos)
                .input('Motivo', sql.VarChar(80), motivo)
                .input('Comentario', sql.NVarChar(500), comentario || null)
                .input('RechazadoPor', sql.VarChar(20), actorMatricula) // actor del token, NUNCA del cliente
                .query(`UPDATE UNIPASS.Doctos
                        SET StatusRevision='Rechazado', MotivoRechazo=@Motivo, ComentarioRechazo=@Comentario,
                            RechazadoPor=@RechazadoPor, FechaRechazo=GETDATE()
                        WHERE IdDoctos=@Id AND StatusRevision='Pendiente'`);
            if (upd.rowsAffected[0] !== 1) { await tx.rollback(); return { error: 'INVALID_DOCUMENT_TRANSITION' }; }

            // D1-A.2: rechazar un requerido puede volver la documentación incompleta -> recalcular
            // Documentacion del DUEÑO en la MISMA transacción (atómico con el rechazo).
            await recalcDocumentacionInTx(tx, doc.IdLogin);

            await new sql.Request(tx)
                .input('ActorIdLogin', sql.Int, audit.actorIdLogin ?? null)
                .input('ActorMatricula', sql.VarChar(15), audit.actorMatricula ?? null)
                .input('Accion', sql.NVarChar(60), 'DOCUMENT_REJECT')
                .input('Recurso', sql.NVarChar(40), 'Doctos')
                .input('RecursoId', sql.NVarChar(40), String(idDoctos))
                .input('Resultado', sql.NVarChar(12), 'SUCCESS')
                .input('DatosAntes', sql.NVarChar(sql.MAX), JSON.stringify({ statusRevision: 'Pendiente' }))
                .input('DatosDespues', sql.NVarChar(sql.MAX), JSON.stringify({ statusRevision: 'Rechazado', idDocumento: doc.IdDocumento, motivo: motivo }))
                .input('Ip', sql.VarChar(45), audit.ip ?? null)
                .input('Endpoint', sql.NVarChar(120), audit.endpoint ?? null)
                .input('Metodo', sql.VarChar(10), audit.metodo ?? null)
                .input('Contexto', sql.NVarChar(300), `IdLoginDueno=${doc.IdLogin}`)
                .query(`INSERT INTO UNIPASS.AuditLog (ActorIdLogin, ActorMatricula, Capability, Permission, Accion, Recurso, RecursoId, Resultado, DatosAntes, DatosDespues, Ip, Endpoint, Metodo, Contexto)
                        VALUES (@ActorIdLogin, @ActorMatricula, NULL, NULL, @Accion, @Recurso, @RecursoId, @Resultado, @DatosAntes, @DatosDespues, @Ip, @Endpoint, @Metodo, @Contexto)`);

            await tx.commit();
            return { ok: true, idLogin: doc.IdLogin, idDocumento: doc.IdDocumento };
        } catch (error) {
            try { await tx.rollback(); } catch (rbErr) { console.error('[Tx] rollback error:', rbErr.message); }
            throw error;
        }
    });

// Devuelve { tokenFCM, tipoDocumento, matricula } para construir la notificacion.
export const findRejectNotificationContext = (idLogin, idDocumento) =>
    withConnection(async (pool) => {
        const result = await pool
            .request()
            .input('IdLogin', sql.Int, idLogin)
            .input('IdDocumento', sql.Int, idDocumento)
            .query(`SELECT LP.TokenCFM AS TokenFCM, LP.Matricula, DC.TipoDocumento
                    FROM UNIPASS.LoginUniPass LP
                    INNER JOIN UNIPASS.DocumentCatalog DC ON DC.IdDocument = @IdDocumento
                    WHERE LP.IdLogin = @IdLogin`);
        return result.recordset[0] || null;
    });
