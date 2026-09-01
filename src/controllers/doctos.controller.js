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
    findRejectNotificationContext
} from '../repositories/doctos.repo.js';
import { findUserById } from '../repositories/user.repo.js';
import { deleteUploadedFile } from '../util/fileStorage.js';
import { emitToUser } from '../util/socketHelpers.js';
import { notifyDocumentRejection } from '../util/notifications.js';

// Task 7.3 D1-A: el revisor documental normal es ÚNICAMENTE TipoUser='PRECEPTOR' (decisión fijada:
// EMPLEADO/VIGILANCIA/ADMINISTRATIVO NO se autorizan por defecto; la permisividad legacy no es política).

export const getProfile = async (req, res) => {
    try {
        const docto = await findDocumentByLoginAndType(req.params.id, req.query.IdDocumento);
        if (!docto) {
            return res.status(404).json({ message: 'Archivo no encontrado' });
        }
        return res.json(docto);
    } catch (error) {
        console.error('Error en el servidor:', error);
        res.status(500).send(error.message);
    }
};

export const getDocumentsByUser = async (req, res) => {
    try {
        const documents = await findDocumentsByLogin(req.params.Id);
        if (documents.length === 0) {
            return res.status(404).json({ message: 'No se encontraron archivos para el usuario' });
        }
        return res.json(documents);
    } catch (error) {
        console.error('Error en el servidor:', error);
        res.status(500).send(error.message);
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

export const getExpedientesAlumnos = async (req, res) => {
    try {
        const expedientes = await findExpedientesByDormitorio(req.params.IdDormi);
        if (expedientes.length === 0) {
            return res.status(404).json({ message: 'No se encontraron experientes' });
        }
        return res.json(expedientes);
    } catch (error) {
        console.error('Error en el servidor:', error);
        res.status(580).send(error.message);
    }
};

export const getArchivosAlumno = async (req, res) => {
    try {
        const { Dormitorio, Nombre, Apellidos, Matricula } = req.params;
        if (!Dormitorio) {
            return res.status(400).json({ message: 'El parámetro Dormitorio es obligatorio' });
        }

        const archivos = await findArchivosFiltered({
            dormitorio: Dormitorio,
            nombre: Nombre,
            apellidos: Apellidos,
            matricula: Matricula
        });

        if (archivos.length === 0) {
            return res.status(404).json({ message: 'No se encontraron expedientes para el alumno especificado' });
        }
        return res.json(archivos);
    } catch (error) {
        console.error('Error en el servidor:', error);
        res.status(500).send(error.message);
    }
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

// LEGADO CONTENIDO (Task 7.3 D1-A · DEPRECATED — REMOVE D1-C): PUT /doctosMul/reject/:Id. Ahora requiere
// Bearer y usa la MISMA lógica segura (actor del token, PRECEPTOR, scope, state machine). El
// `MatriculaPreceptor` del body se IGNORA. Localiza el doc por (IdLogin=path, IdDocumento=body) solo como
// puente mientras Flutter migra a PUT /documents/:idDoctos/reject.
export const rejectDocument = async (req, res) => {
    try {
        const idLogin = parseInt(req.params.Id, 10);
        const { IdDocumento, Motivo, Comentario } = req.body || {};
        if (!idLogin || !IdDocumento) return res.status(400).json({ message: 'IdLogin(path) e IdDocumento son obligatorios', code: 'MISSING_FIELDS' });
        const doc = await findDocumentByLoginAndType(idLogin, IdDocumento);
        if (!doc) return res.status(404).json({ message: 'Documento no encontrado', code: 'DOCUMENT_NOT_FOUND' });
        await ejecutarRechazo(req, res, { idDoctos: doc.IdDoctos, motivo: Motivo, comentario: Comentario });
    } catch (error) {
        console.error('Error en rejectDocument (legacy):', error);
        if (!res.headersSent) res.status(500).json({ message: 'Error al rechazar el documento', code: 'SERVER_ERROR' });
    }
};
