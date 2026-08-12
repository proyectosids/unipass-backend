// Controlador del expediente documental: subida/reemplazo (multer -> public/uploads),
// consulta, aprobacion y rechazo (este ultimo notifica por socket y push FCM).
// Si la BD falla despues de subir un archivo, se borra del disco (rollback).
import {
    findDocumentByLoginAndType,
    findDocumentsByLogin,
    createDocument,
    updateDocumentArchivo,
    deleteDocument,
    findExpedientesByDormitorio,
    findArchivosFiltered,
    approveDocument,
    rejectDocument as rejectDocumentRepo,
    findRejectNotificationContext
} from '../repositories/doctos.repo.js';
import { findUserByMatricula } from '../repositories/user.repo.js';
import { deleteUploadedFile } from '../util/fileStorage.js';
import { emitToUser } from '../util/socketHelpers.js';
import { notifyDocumentRejection } from '../util/notifications.js';

const PRECEPTOR_ROLES = new Set(['PRECEPTOR', 'EMPLEADO', 'VIGILANCIA']);

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
        // Task 7.2: solo borra documentos propios (token.id); :Id del path se ignora.
        const idLogin = req.user.id;
        const fileRecord = await findDocumentByLoginAndType(idLogin, req.body.IdDocumento);
        if (!fileRecord) {
            return res.status(404).json({ message: 'Dato no encontrado' });
        }
        const archivoPath = fileRecord.Archivo;

        const deleted = await deleteDocument(idLogin, req.body.IdDocumento);
        if (!deleted) {
            return res.status(404).json({ message: 'Dato no encontrado' });
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

export const aprobarDocumento = async (req, res) => {
    // Task 7.3: candidato a endpoint muerto (Frontend no lo consume). Log para juntar
    // evidencia de uso real antes de deprecar/eliminar. No cambia el comportamiento.
    console.warn(`[DEPRECATION][Task7] PUT /statusRevision/:Id invocado (IdLogin=${req.params.Id}) — candidato a endpoint muerto`);
    try {
        const updated = await approveDocument(req.params.Id, req.body.IdDocumento);
        if (!updated) {
            return res.status(404).json({ message: 'Documento no encontrado' });
        }
        return res.status(200).json({ message: 'Documento aprobado correctamente' });
    } catch (error) {
        console.error('Error actualizando estado de revisión:', error);
        return res.status(500).json({ message: 'Error en el servidor' });
    }
};

export const rejectDocument = async (req, res) => {
    try {
        const idLogin = parseInt(req.params.Id, 10);
        const { IdDocumento, Motivo, Comentario, MatriculaPreceptor } = req.body;

        if (!idLogin || !IdDocumento || !Motivo || !MatriculaPreceptor) {
            return res.status(400).json({
                message: 'idLogin, IdDocumento, Motivo y MatriculaPreceptor son obligatorios'
            });
        }

        const preceptor = await findUserByMatricula(MatriculaPreceptor);
        if (!preceptor) {
            return res.status(403).json({ message: 'Preceptor no encontrado' });
        }
        if (!PRECEPTOR_ROLES.has(preceptor.TipoUser)) {
            return res.status(403).json({ message: 'No tienes permisos para rechazar documentos' });
        }

        const rejected = await rejectDocumentRepo({
            idLogin,
            idDocumento: IdDocumento,
            motivo: Motivo,
            comentario: Comentario,
            matriculaPreceptor: MatriculaPreceptor
        });

        if (!rejected) {
            return res.status(404).json({ message: 'Documento no encontrado' });
        }

        res.status(200).json({ message: 'Documento rechazado' });

        let context = null;
        try {
            context = await findRejectNotificationContext(idLogin, IdDocumento);
        } catch (queryError) {
            console.error('Error obteniendo contexto para notificacion:', queryError.message);
        }

        if (context) {
            try {
                const io = req.app.get('io');
                emitToUser(io, context.Matricula, 'document_rejected', {
                    idLogin,
                    idDocumento: IdDocumento,
                    tipoDocumento: context.TipoDocumento,
                    motivo: Motivo,
                    comentario: Comentario || null,
                    rechazadoPor: MatriculaPreceptor,
                    timestamp: new Date().toISOString()
                });
            } catch (socketError) {
                console.error('[Socket] Error en rejectDocument:', socketError.message);
            }

            try {
                await notifyDocumentRejection({
                    tokenFCM: context.TokenFCM,
                    tipoDocumento: context.TipoDocumento,
                    motivo: Motivo,
                    matricula: context.Matricula
                });
            } catch (fcmError) {
                console.error('[FCM] Error en notifyDocumentRejection:', fcmError.message);
            }
        }
    } catch (error) {
        console.error('Error en el servidor:', error);
        if (!res.headersSent) {
            return res.status(500).json({ message: 'Error al rechazar el documento' });
        }
    }
};
