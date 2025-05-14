
import { getProfileUseCase, getDocumentsByUserUseCase, saveDocumentUseCase, uploadProfileUseCase, deleteFileDocUseCase, getExpedientesAlumnosUseCase, getArchivosAlumnoUseCase, aprobarDocumentoUseCase } from "../../usercases/doctos.usercase.js";

export async function getProfile(req, res) {
    try {
        const result = await getProfileUseCase(req.params.id, req.query.IdDocumento);
        if (!result) return res.status(404).json({ message: "Archivo no encontrado" });
        res.json(result);
    } catch (error) {
        res.status(500).send(error.message);
    }
}

export async function getDocumentsByUser(req, res) {
    try {
        const result = await getDocumentsByUserUseCase(req.params.Id);
        if (!result.length) return res.status(404).json({ message: "No se encontraron archivos para el usuario" });
        res.json(result);
    } catch (error) {
        res.status(500).send(error.message);
    }
}

export async function saveDocument(req, res) {
    try {
        if (!req.file) {
            return res.status(400).json({ message: "Archivo no cargado" });
        }

        const filePath = "/uploads/" + req.file.filename;
        const result = await saveDocumentUseCase({
            IdDocumento: req.body.IdDocumento,
            Archivo: filePath,
            IdLogin: req.body.IdLogin
        });

        res.json({
            Id: result.IdDoctos,
            IdDocumento: req.body.IdDocumento,
            Archivo: filePath,
            StatusDoctos: "Adjunto",
            IdLogin: req.body.IdLogin
        });
    } catch (error) {
        res.status(500).json({ message: "Error en el proceso de carga" });
    }
}

export async function uploadProfile(req, res) {
    try {
        if (!req.file) return res.status(400).json({ message: "Archivo no cargado" });

        const filePath = "/uploads/" + req.file.filename;
        const result = await uploadProfileUseCase({
            IdDocumento: req.body.IdDocumento,
            Archivo: filePath,
            IdLogin: req.body.IdLogin
        });

        if (!result) return res.status(404).json({ message: "No se puede actualizar el archivo" });

        res.json(result);
    } catch (error) {
        res.status(500).json({ message: "Error en el proceso de carga" });
    }
}

export async function deleteFileDoc(req, res) {
    try {
        const success = await deleteFileDocUseCase(
            req.params.Id,
            req.body.IdDocumento,
            (archivo) => {
                fs.unlinkSync("./public/" + archivo);
            }
        );
        if (!success) return res.status(404).json({ message: "Dato no encontrado" });
        res.json({ message: "DATO ELIMINADO" });
    } catch (error) {
        res.status(500).json({ message: "Error en el proceso de eliminación" });
    }
}

export async function getExpedientesAlumnos(req, res) {
    try {
        const result = await getExpedientesAlumnosUseCase(req.params.IdDormi);
        if (!result.length) return res.status(404).json({ message: "No se encontraron expedientes" });
        res.json(result);
    } catch (error) {
        res.status(580).send(error.message);
    }
}

export async function getArchivosAlumno(req, res) {
    try {
        const { Dormitorio, Nombre, Apellidos } = req.params;

        if (!Dormitorio || !Nombre || !Apellidos) {
            return res.status(400).json({ message: "Faltan parámetros en la solicitud" });
        }

        const result = await getArchivosAlumnoUseCase(Dormitorio, Nombre, Apellidos);
        if (!result.length) {
            return res.status(404).json({ message: "No se encontraron expedientes para el alumno especificado" });
        }
        res.json(result);
    } catch (error) {
        res.status(500).send(error.message);
    }
}

export async function aprobarDocumento(req, res) {
    try {
        const { IdDocumento } = req.body;
        const { Id } = req.params;

        const success = await aprobarDocumentoUseCase(Id, IdDocumento);
        if (!success) {
            return res.status(404).json({ message: "Documento no encontrado" });
        }

        return res.status(200).json({ message: "Documento aprobado correctamente" });
    } catch (error) {
        res.status(500).json({ message: "Error en el servidor" });
    }
}
