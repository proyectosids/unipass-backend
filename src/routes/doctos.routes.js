import { Router } from "express";
import { verifyToken } from "../Middleware/verifityToken.js";
import { deleteFileDoc, getDocumentsByUser, saveDocument, getProfile, uploadProfile, getExpedientesAlumnos, getArchivosAlumno, rejectDocumentByIdDoctos } from "../controllers/doctos.controller.js";
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

// RETIRADO (Task 7.3 D1-A): PUT /statusRevision/:Id (aprobación anónima, 0 consumidores) -> 404.

// Task 7.3 D1-A: rechazo documental SEGURO. Bearer; actor = token PRECEPTOR; scope de dormitorio +
// máquina de estados (Pendiente->Rechazado) + AuditLog server-side. Body { motivo, comentario? }.
router.put("/documents/:idDoctos/reject", verifyToken, rejectDocumentByIdDoctos);

// RETIRADO (Task 7.3 D1-C2): PUT /doctosMul/reject/:Id ELIMINADO → 404. El único contrato de rechazo
// es PUT /documents/:idDoctos/reject (arriba).

export default router;
