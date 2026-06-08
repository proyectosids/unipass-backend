import {
    findDocumentByLoginAndType,
    findDocumentsByLogin,
    createDocument,
    updateDocumentArchivo,
    deleteDocument,
    findExpedientesByDormitorio,
    findArchivosFiltered,
    approveDocument
} from '../repositories/doctos.repo.js';
import { deleteUploadedFile } from '../util/fileStorage.js';

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

        const newId = await createDocument({
            idDocumento: req.body.IdDocumento,
            archivo: filePath,
            idLogin: req.body.IdLogin
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
            IdLogin: req.body.IdLogin
        });
    } catch (error) {
        console.error('Error en el servidor:', error);
        return res.status(500).json({ message: 'Error en el proceso de carga' });
    } finally {
        // Rollback: si el INSERT no termino bien y ya habia archivo subido, borrarlo.
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

        const oldDoc = await findDocumentByLoginAndType(req.body.IdLogin, req.body.IdDocumento);
        const oldFilePath = oldDoc ? oldDoc.Archivo : null;

        const updated = await updateDocumentArchivo(
            req.body.IdLogin,
            req.body.IdDocumento,
            newFilePath
        );
        if (!updated) {
            return res.status(404).json({ message: 'No se puede actualizar el archivo' });
        }
        updateOk = true;

        const updatedRecord = await findDocumentByLoginAndType(req.body.IdLogin, req.body.IdDocumento);
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
        const fileRecord = await findDocumentByLoginAndType(req.params.Id, req.body.IdDocumento);
        if (!fileRecord) {
            return res.status(404).json({ message: 'Dato no encontrado' });
        }
        const archivoPath = fileRecord.Archivo;

        const deleted = await deleteDocument(req.params.Id, req.body.IdDocumento);
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
