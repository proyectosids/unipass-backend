import { Router } from "express";
import { verifyToken } from "../Middleware/verifityToken.js";
import { deleteFileDoc, getDocumentsByUser, saveDocument, getProfile, uploadProfile, getExpedientesAlumnos, getArchivosAlumno, aprobarDocumento, rejectDocument } from "../controllers/doctos.controller.js";
import { Subirimagen } from "../Middleware/storage.js";
import multer from "multer";

const router = Router();

// Foto de perfil / documento puntual (?IdDocumento=)
router.get("/doctosProfile/:id", getProfile);

// Expediente completo del usuario :Id (IdLogin)
router.get("/doctos/:Id", getDocumentsByUser);

// Subida y reemplazo (multipart, campo 'Archivo'; jpg/jpeg/png/pdf, max 50 MB)
// Task 7.2: verifyToken ANTES de multer (no procesar archivo sin auth); IdLogin del body ignorado.
router.post("/doctosMul", verifyToken, Subirimagen.single('Archivo'), saveDocument)

router.put("/doctosMul/updateProfile", verifyToken, Subirimagen.single('Archivo'), uploadProfile)

// Borra doc propio (:Id del path ignorado, se usa token.id)
router.delete("/doctosMul/:Id", verifyToken, deleteFileDoc);

// Revision del preceptor (:IdDormi/:Dormitorio = 5 -> vista global)
router.get("/getExpediente/:IdDormi", getExpedientesAlumnos)

router.get("/getArchivos/:Dormitorio/:Nombre?/:Apellidos?/:Matricula?", getArchivosAlumno);

router.put("/statusRevision/:Id", aprobarDocumento) // aprueba (:Id = IdLogin)

router.put("/doctosMul/reject/:Id", rejectDocument) // rechaza + socket + push FCM

export default router;
