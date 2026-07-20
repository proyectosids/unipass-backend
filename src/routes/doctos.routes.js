import { Router } from "express";
import { deleteFileDoc, getDocumentsByUser, saveDocument, getProfile, uploadProfile, getExpedientesAlumnos, getArchivosAlumno, aprobarDocumento, rejectDocument } from "../controllers/doctos.controller.js";
import { Subirimagen } from "../Middleware/storage.js";
import multer from "multer";

const router = Router();

// Foto de perfil / documento puntual (?IdDocumento=)
router.get("/doctosProfile/:id", getProfile);

// Expediente completo del usuario :Id (IdLogin)
router.get("/doctos/:Id", getDocumentsByUser);

// Subida y reemplazo (multipart, campo 'Archivo'; jpg/jpeg/png/pdf, max 50 MB)
router.post("/doctosMul", Subirimagen.single('Archivo'), saveDocument)

router.put("/doctosMul/updateProfile", Subirimagen.single('Archivo'), uploadProfile)

router.delete("/doctosMul/:Id", deleteFileDoc);

// Revision del preceptor (:IdDormi/:Dormitorio = 5 -> vista global)
router.get("/getExpediente/:IdDormi", getExpedientesAlumnos)

router.get("/getArchivos/:Dormitorio/:Nombre?/:Apellidos?/:Matricula?", getArchivosAlumno);

router.put("/statusRevision/:Id", aprobarDocumento) // aprueba (:Id = IdLogin)

router.put("/doctosMul/reject/:Id", rejectDocument) // rechaza + socket + push FCM

export default router;
