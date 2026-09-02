// Controlador del expediente documental: subida/reemplazo (multer -> public/uploads),
// consulta, aprobacion y rechazo (este ultimo notifica por socket y push FCM).
// Si la BD falla despues de subir un archivo, se borra del disco (rollback).
import {
    findDocumentByLoginAndType,
    findDocumentsByLogin,
    createDocument,
    updateDocumentArchivo,
    findDocumentById,
    deleteDocumentByIdAndRecalcTx,
    deleteDocumentByTypeAndRecalcTx,
    findExpedientesByDormitorio,
    findArchivosFiltered,
    rejectDocumentTx,
    findRejectNotificationContext,
    findReviewStudentsByDorm,
    findProfilePhoto,
    findDocumentFileByIdDoctos
} from '../repositories/doctos.repo.js';
import { findUserById } from '../repositories/user.repo.js';
import { deleteUploadedFile } from '../util/fileStorage.js';
import { emitToUser } from '../util/socketHelpers.js';
import { notifyDocumentRejection } from '../util/notifications.js';
import { authorizeDocumentRead, PROFILE_PHOTO_DOC } from '../services/documentAccess.service.js';
import { resolveUploadPath, mimeForFile } from '../util/secureFilePath.js';
import fs from 'node:fs';
import path from 'node:path';

// Task 7.3 D1-A: el revisor documental normal es ÚNICAMENTE TipoUser='PRECEPTOR' (decisión fijada:
// EMPLEADO/VIGILANCIA/ADMINISTRATIVO NO se autorizan por defecto; la permisividad legacy no es política).

// ===== Task 7.3 D2-A: lecturas documentales server-authoritative (BOLA/IDOR) =====

// Política de FOTO DE PERFIL (IdDocumento=6): delega en la política documental ÚNICA
// (documentAccess.service): SELF; PRECEPTOR del mismo dormitorio; o CHECKER con grant vigente. Se pasa un
// documento sintético con IdDocumento=6 para reutilizar exactamente la misma decisión que /files/:idDoctos.
const puedeVerFotoPerfil = (req, targetIdLogin) =>
    authorizeDocumentRead(req.user.id, { IdLogin: targetIdLogin, IdDocumento: PROFILE_PHOTO_DOC });

const servirFotoPerfil = async (res, targetId) => {
    const photo = await findProfilePhoto(targetId);
    if (!photo) return res.status(404).json({ message: 'Foto no encontrada', code: 'DOCUMENT_NOT_FOUND' });
    return res.json({ IdDoctos: photo.IdDoctos, IdDocumento: 6, Archivo: photo.Archivo });
};

// GET /me/documents (Bearer): SOLO documentos del actor autenticado. findDocumentsByLogin ya es allowlist.
export const getMyDocuments = async (req, res) => {
    try {
        return res.json(await findDocumentsByLogin(req.user.id));
    } catch (error) { console.error('Error en /me/documents:', error); res.status(500).json({ message: 'Error', code: 'SERVER_ERROR' }); }
};

// GET /documents/review/students (Bearer PRECEPTOR): alumnos de SU dormitorio (resuelto server-side).
export const getReviewStudents = async (req, res) => {
    try {
        const actor = await findUserById(req.user.id);
        if (!actor) return res.status(404).json({ message: 'Usuario no encontrado', code: 'USER_NOT_FOUND' });
        if (actor.TipoUser !== 'PRECEPTOR') return res.status(403).json({ message: 'Solo un preceptor puede revisar', code: 'FORBIDDEN_DOCUMENT_REVIEWER' });
        if (actor.Dormitorio == null) return res.status(409).json({ message: 'Preceptor sin dormitorio', code: 'DOCUMENT_REQUIREMENTS_UNRESOLVED' });
        return res.json(await findReviewStudentsByDorm(actor.Dormitorio));
    } catch (error) { console.error('Error en review/students:', error); res.status(500).json({ message: 'Error', code: 'SERVER_ERROR' }); }
};

// GET /documents/review/students/:idLogin/documents (Bearer PRECEPTOR): documentos de un alumno de SU dorm.
export const getReviewStudentDocuments = async (req, res) => {
    try {
        const actor = await findUserById(req.user.id);
        if (!actor) return res.status(404).json({ message: 'Usuario no encontrado', code: 'USER_NOT_FOUND' });
        if (actor.TipoUser !== 'PRECEPTOR') return res.status(403).json({ message: 'Solo un preceptor puede revisar', code: 'FORBIDDEN_DOCUMENT_REVIEWER' });
        const target = await findUserById(Number(req.params.idLogin));
        if (!target || target.TipoUser !== 'ALUMNO') return res.status(404).json({ message: 'Alumno no encontrado', code: 'DOCUMENT_NOT_FOUND' });
        if (actor.Dormitorio == null || Number(actor.Dormitorio) !== Number(target.Dormitorio)) {
            return res.status(403).json({ message: 'Fuera de tu dormitorio', code: 'FORBIDDEN_DOCUMENT_SCOPE' });
        }
        return res.json(await findDocumentsByLogin(target.IdLogin));
    } catch (error) { console.error('Error en review/students/:id/documents:', error); res.status(500).json({ message: 'Error', code: 'SERVER_ERROR' }); }
};

// GET /users/:idLogin/profile-photo (Bearer): foto de perfil (IdDocumento=6) según política SELF/PRECEPTOR/CHECKER.
export const getProfilePhoto = async (req, res) => {
    try {
        const targetId = Number(req.params.idLogin);
        if (!Number.isInteger(targetId) || targetId <= 0) return res.status(400).json({ message: 'idLogin invalido', code: 'MISSING_FIELDS' });
        if (!(await puedeVerFotoPerfil(req, targetId))) return res.status(403).json({ message: 'No autorizado para ver esta foto', code: 'FORBIDDEN_DOCUMENT_SCOPE' });
        return servirFotoPerfil(res, targetId);
    } catch (error) { console.error('Error en getProfilePhoto:', error); res.status(500).json({ message: 'Error', code: 'SERVER_ERROR' }); }
};

// ===== Bridges legacy CONTENIDOS (DEPRECATED — REMOVE D2-C) =====

// GET /doctosProfile/:id?IdDocumento=6 — bridge de foto de perfil. Solo IdDocumento=6; misma política.
// No puede usarse como lector genérico (otro IdDocumento -> 403).
export const getProfile = async (req, res) => {
    try {
        if (Number(req.query.IdDocumento) !== 6) return res.status(403).json({ message: 'Este endpoint solo sirve la foto de perfil (IdDocumento=6)', code: 'FORBIDDEN_DOCUMENT_SCOPE' });
        const targetId = Number(req.params.id);
        if (!(await puedeVerFotoPerfil(req, targetId))) return res.status(403).json({ message: 'No autorizado para ver esta foto', code: 'FORBIDDEN_DOCUMENT_SCOPE' });
        return servirFotoPerfil(res, targetId);
    } catch (error) { console.error('Error en getProfile (bridge):', error); res.status(500).json({ message: 'Error', code: 'SERVER_ERROR' }); }
};

// GET /doctos/:Id — bridge SELF: :Id debe ser el IdLogin del token.
export const getDocumentsByUser = async (req, res) => {
    try {
        if (Number(req.params.Id) !== Number(req.user.id)) {
            return res.status(403).json({ message: 'Solo puedes ver tus documentos', code: 'FORBIDDEN_OWNERSHIP' });
        }
        const documents = await findDocumentsByLogin(req.user.id);
        if (documents.length === 0) return res.status(404).json({ message: 'No se encontraron archivos', code: 'DOC_NOT_FOUND' });
        return res.json(documents);
    } catch (error) { console.error('Error en /doctos/:Id (bridge):', error); res.status(500).json({ message: 'Error', code: 'SERVER_ERROR' }); }
};

// ===== Task 7.3 D2-B2: entrega AUTENTICADA de binarios documentales por IdDoctos =====
// GET /files/:idDoctos (Bearer). El recurso se identifica por PK (IdDoctos); el filename/Archivo/IdLogin/
// IdDocumento/scope NUNCA vienen del cliente. Pipeline: Bearer -> IdDoctos -> Doctos -> política -> ruta
// segura (anti traversal) -> stream. No redirige a /uploads ni revela paths físicos.
export const getFileByIdDoctos = async (req, res) => {
    try {
        const idDoctos = Number(req.params.idDoctos);
        if (!Number.isInteger(idDoctos) || idDoctos <= 0) {
            return res.status(400).json({ message: 'idDoctos invalido', code: 'MISSING_FIELDS' });
        }

        const doc = await findDocumentFileByIdDoctos(idDoctos);
        if (!doc) return res.status(404).json({ message: 'Documento no encontrado', code: 'FILE_NOT_FOUND' });

        // Autorización por IdDocumento (foto=6 admite CHECKER; privados solo SELF/PRECEPTOR mismo dorm).
        const allowed = await authorizeDocumentRead(req.user.id, doc);
        if (!allowed) return res.status(403).json({ message: 'No autorizado para este documento', code: 'FORBIDDEN_DOCUMENT_SCOPE' });

        // Solo DESPUÉS de autorizar se toca el filesystem, y con resolución confinada a UPLOAD_ROOT.
        const absPath = resolveUploadPath(doc.Archivo);
        const mime = absPath ? mimeForFile(absPath) : null;
        if (!absPath || !mime) return res.status(404).json({ message: 'Archivo no encontrado', code: 'FILE_NOT_FOUND' });

        // Existencia física: la fila puede existir sin binario en disco -> 404 controlado (sin path/stack).
        let stat;
        try { stat = await fs.promises.stat(absPath); }
        catch { return res.status(404).json({ message: 'Archivo no encontrado', code: 'FILE_NOT_FOUND' }); }
        if (!stat.isFile()) return res.status(404).json({ message: 'Archivo no encontrado', code: 'FILE_NOT_FOUND' });

        const safeName = path.basename(absPath).replace(/[^\w.\-]/g, '_'); // filename numérico; se sanea igual
        res.setHeader('Content-Type', mime);
        res.setHeader('Content-Length', stat.size);
        res.setHeader('Content-Disposition', `inline; filename="${safeName}"`); // inline para render (img/pdf)
        res.setHeader('Cache-Control', 'private, no-store'); // documentación sensible (INE, etc.): no cachear
        res.setHeader('Pragma', 'no-cache');

        const stream = fs.createReadStream(absPath);
        stream.on('error', () => {
            if (!res.headersSent) res.status(500).json({ message: 'Error al leer el archivo', code: 'SERVER_ERROR' });
            else res.destroy();
        });
        stream.pipe(res);
    } catch (error) {
        // No se loguean bytes/paths/secretos: solo el IdDoctos y el mensaje técnico.
        console.error('Error en getFileByIdDoctos: idDoctos=', req.params?.idDoctos, '-', error.message);
        if (!res.headersSent) res.status(500).json({ message: 'Error', code: 'SERVER_ERROR' });
    }
};

export const saveDocument = async (req, res) => {
    let filePath = null;
    let insertOk = false;
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'Archivo no cargado' });
        }
        filePath = '/uploads/' + req.file.filename;

        // Task 7.2: el dueño del documento es el usuario del token (IdLogin del body ignorado).
        const idLogin = req.user.id;
        const newId = await createDocument({
            idDocumento: req.body.IdDocumento,
            archivo: filePath,
            idLogin
        });

        if (newId === null) {
            return res.status(404).json({ message: 'No se puede guardar el archivo' });
        }
        insertOk = true;
        return res.json({
            Id: newId,
            IdDocumento: req.body.IdDocumento,
            Archivo: filePath,
            StatusDoctos: 'Adjunto',
            IdLogin: idLogin
        });
    } catch (error) {
        console.error('Error en el servidor:', error);
        return res.status(500).json({ message: 'Error en el proceso de carga' });
    } finally {
        // Rollback: si el INSERT/UPDATE no termino bien y ya habia archivo subido, borrarlo.
        if (!insertOk && filePath) {
            await deleteUploadedFile(filePath);
        }
    }
};

export const uploadProfile = async (req, res) => {
    let newFilePath = null;
    let updateOk = false;
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'Archivo no cargado' });
        }
        newFilePath = '/uploads/' + req.file.filename;

        // Task 7.2: se opera sobre el documento del usuario del token (IdLogin del body ignorado).
        const idLogin = req.user.id;
        const oldDoc = await findDocumentByLoginAndType(idLogin, req.body.IdDocumento);
        const oldFilePath = oldDoc ? oldDoc.Archivo : null;

        const updated = await updateDocumentArchivo(
            idLogin,
            req.body.IdDocumento,
            newFilePath
        );
        if (!updated) {
            return res.status(404).json({ message: 'No se puede actualizar el archivo' });
        }
        updateOk = true;

        const updatedRecord = await findDocumentByLoginAndType(idLogin, req.body.IdDocumento);
        res.json(updatedRecord);

        if (oldFilePath && oldFilePath !== newFilePath) {
            await deleteUploadedFile(oldFilePath);
        }
    } catch (error) {
        console.error('Error en el servidor:', error);
        if (!res.headersSent) {
            return res.status(500).json({ message: 'Error en el proceso de carga' });
        }
    } finally {
        // Rollback: si el UPDATE no se concreto pero ya subimos el archivo nuevo, borrarlo.
        if (!updateOk && newFilePath) {
            await deleteUploadedFile(newFilePath);
        }
    }
};

export const deleteFileDoc = async (req, res) => {
    try {
        // Task 7.2: identidad del token (:Id del path se ignora). Validacion de ownership
        // ANTES de borrar. IdDoctos identifica un documento UNICO -> permite distinguir
        // 403 (ajeno) de 404 (inexistente), como pidio Frontend. IdDocumento es un TIPO
        // (compartido entre usuarios): via legacy segura, scoped al doc propio del token.
        const idLogin = req.user.id;
        const { IdDoctos, IdDocumento } = req.body;

        let archivoPath;
        let deleted;

        if (IdDoctos !== undefined && IdDoctos !== null) {
            const doc = await findDocumentById(IdDoctos);
            if (!doc) {
                return res.status(404).json({ message: 'Documento no encontrado', code: 'DOC_NOT_FOUND' });
            }
            if (Number(doc.IdLogin) !== Number(idLogin)) {
                return res.status(403).json({ message: 'No puedes borrar un documento que no te pertenece', code: 'FORBIDDEN_OWNERSHIP' });
            }
            archivoPath = doc.Archivo;
            deleted = await deleteDocumentByIdAndRecalcTx({ idDoctos: IdDoctos, idLogin }); // D1-A.2: delete + recalc atómico
        } else {
            // Legacy: IdDocumento = TIPO. Se opera solo sobre el doc propio (token.id);
            // no puede alcanzar documentos ajenos, por lo que "no es tuyo" es 404.
            const fileRecord = await findDocumentByLoginAndType(idLogin, IdDocumento);
            if (!fileRecord) {
                return res.status(404).json({ message: 'Documento no encontrado', code: 'DOC_NOT_FOUND' });
            }
            archivoPath = fileRecord.Archivo;
            deleted = await deleteDocumentByTypeAndRecalcTx({ idLogin, idDocumento: IdDocumento }); // D1-A.2
        }

        if (!deleted) {
            return res.status(404).json({ message: 'Documento no encontrado', code: 'DOC_NOT_FOUND' });
        }

        res.status(200).json({ message: 'DATO ELIMINADO' });

        if (archivoPath) {
            await deleteUploadedFile(archivoPath);
        }
    } catch (error) {
        console.error('Error en el servidor:', error);
        if (!res.headersSent) {
            return res.status(500).json({ message: 'Error en el proceso de eliminación' });
        }
    }
};

// GET /getExpediente/:IdDormi — bridge CONTENIDO (DEPRECATED — REMOVE D2-C).
// PRECEPTOR only; dorm resuelto server-side; :IdDormi debe coincidir con el dorm del actor (sin dorm=5).
export const getExpedientesAlumnos = async (req, res) => {
    try {
        const actor = await findUserById(req.user.id);
        if (!actor) return res.status(404).json({ message: 'Usuario no encontrado', code: 'USER_NOT_FOUND' });
        if (actor.TipoUser !== 'PRECEPTOR') return res.status(403).json({ message: 'Solo un preceptor puede revisar', code: 'FORBIDDEN_DOCUMENT_REVIEWER' });
        if (actor.Dormitorio == null || Number(req.params.IdDormi) !== Number(actor.Dormitorio)) {
            return res.status(403).json({ message: 'Fuera de tu dormitorio', code: 'FORBIDDEN_DOCUMENT_SCOPE' });
        }
        const expedientes = await findExpedientesByDormitorio(actor.Dormitorio);
        if (expedientes.length === 0) return res.status(404).json({ message: 'No se encontraron expedientes', code: 'DOC_NOT_FOUND' });
        return res.json(expedientes);
    } catch (error) { console.error('Error en getExpedientesAlumnos (bridge):', error); res.status(500).json({ message: 'Error', code: 'SERVER_ERROR' }); }
};

// GET /getArchivos/:Dormitorio/... — bridge CONTENIDO (DEPRECATED — REMOVE D2-C).
// PRECEPTOR only; el filtro de dormitorio se FUERZA al dorm del actor (el :Dormitorio del path se ignora
// para autorización y se valida que coincida; sin dorm=5). Nombre/Apellidos/Matricula siguen como filtro.
export const getArchivosAlumno = async (req, res) => {
    try {
        const actor = await findUserById(req.user.id);
        if (!actor) return res.status(404).json({ message: 'Usuario no encontrado', code: 'USER_NOT_FOUND' });
        if (actor.TipoUser !== 'PRECEPTOR') return res.status(403).json({ message: 'Solo un preceptor puede revisar', code: 'FORBIDDEN_DOCUMENT_REVIEWER' });
        if (actor.Dormitorio == null || Number(req.params.Dormitorio) !== Number(actor.Dormitorio)) {
            return res.status(403).json({ message: 'Fuera de tu dormitorio', code: 'FORBIDDEN_DOCUMENT_SCOPE' });
        }
        const archivos = await findArchivosFiltered({
            dormitorio: actor.Dormitorio,
            nombre: req.params.Nombre,
            apellidos: req.params.Apellidos,
            matricula: req.params.Matricula
        });
        if (archivos.length === 0) return res.status(404).json({ message: 'No se encontraron expedientes', code: 'DOC_NOT_FOUND' });
        return res.json(archivos);
    } catch (error) { console.error('Error en getArchivosAlumno (bridge):', error); res.status(500).json({ message: 'Error', code: 'SERVER_ERROR' }); }
};

// RETIRADO (Task 7.3 D1-A): aprobarDocumento / PUT /statusRevision/:Id fue ELIMINADO (0 consumidores
// Flutter; aprobación anónima). No hay operación pública de APROBAR (Flutter solo rechaza).

// Task 7.3 D1-A - código de dominio -> HTTP para el rechazo seguro.
const HTTP_DOC_REJECT = { DOCUMENT_NOT_FOUND: 404, FORBIDDEN_DOCUMENT_SCOPE: 403, INVALID_DOCUMENT_TRANSITION: 409 };

// Notificación POST-COMMIT del rechazo (socket + FCM), best-effort: no revierte nada. Destinatario y
// TokenCFM se resuelven server-side desde Doctos.IdLogin. Reutilizada por el endpoint nuevo y el legacy.
const notificarRechazo = async (req, { idLogin, idDocumento, motivo, comentario, rechazadoPor }) => {
    let context = null;
    try { context = await findRejectNotificationContext(idLogin, idDocumento); }
    catch (e) { console.error('Error contexto notificacion rechazo:', e.message); }
    if (!context) return;
    try {
        const io = req.app.get('io');
        emitToUser(io, context.Matricula, 'document_rejected', {
            idLogin, idDocumento, tipoDocumento: context.TipoDocumento, motivo,
            comentario: comentario || null, rechazadoPor, timestamp: new Date().toISOString()
        });
    } catch (e) { console.error('[Socket] Error document_rejected:', e.message); }
    try {
        await notifyDocumentRejection({ tokenFCM: context.TokenFCM, tipoDocumento: context.TipoDocumento, motivo, matricula: context.Matricula });
    } catch (e) { console.error('[FCM] Error notifyDocumentRejection:', e.message); }
};

// Lógica de rechazo SEGURA compartida: actor del token -> PRECEPTOR -> scope de dormitorio + máquina de
// estados + AuditLog (en rejectDocumentTx) -> notificación post-commit. El actor NUNCA viene del body.
const ejecutarRechazo = async (req, res, { idDoctos, motivo, comentario }) => {
    if (!Number.isInteger(idDoctos) || idDoctos <= 0) return res.status(400).json({ message: 'IdDoctos invalido', code: 'MISSING_FIELDS' });
    if (!motivo) return res.status(400).json({ message: 'motivo es obligatorio', code: 'MISSING_FIELDS' });

    const actor = await findUserById(req.user.id);
    if (!actor) return res.status(404).json({ message: 'Usuario no encontrado', code: 'USER_NOT_FOUND' });
    if (actor.TipoUser !== 'PRECEPTOR') {
        return res.status(403).json({ message: 'Solo un preceptor puede rechazar documentos', code: 'FORBIDDEN_DOCUMENT_REVIEWER' });
    }

    const result = await rejectDocumentTx({
        idDoctos, actorMatricula: actor.Matricula, actorDormitorio: actor.Dormitorio, motivo, comentario,
        audit: { actorIdLogin: req.user.id, actorMatricula: actor.Matricula, ip: req.ip || req.headers?.['x-forwarded-for'] || null, endpoint: req.originalUrl || null, metodo: req.method || null }
    });
    if (result.error) {
        return res.status(HTTP_DOC_REJECT[result.error] || 409).json({ message: 'No se pudo rechazar el documento', code: result.error });
    }

    res.json({ message: 'Documento rechazado', IdDoctos: idDoctos, StatusRevision: 'Rechazado' });
    await notificarRechazo(req, { idLogin: result.idLogin, idDocumento: result.idDocumento, motivo, comentario, rechazadoPor: actor.Matricula });
};

// PUT /documents/:idDoctos/reject (Bearer). Contrato NUEVO seguro. Body { motivo, comentario? }.
export const rejectDocumentByIdDoctos = async (req, res) => {
    try {
        await ejecutarRechazo(req, res, { idDoctos: Number(req.params.idDoctos), motivo: req.body?.motivo, comentario: req.body?.comentario });
    } catch (error) {
        console.error('Error en rejectDocumentByIdDoctos:', error);
        if (!res.headersSent) res.status(500).json({ message: 'Error al rechazar el documento', code: 'SERVER_ERROR' });
    }
};

// RETIRADO (Task 7.3 D1-C2): rejectDocument / PUT /doctosMul/reject/:Id ELIMINADO. El único contrato de
// rechazo es PUT /documents/:idDoctos/reject (rejectDocumentByIdDoctos), con la misma lógica segura.
