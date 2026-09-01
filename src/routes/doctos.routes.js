import { Router } from "express";
import { verifyToken } from "../Middleware/verifityToken.js";
import { deleteFileDoc, getDocumentsByUser, saveDocument, getProfile, uploadProfile, getExpedientesAlumnos, getArchivosAlumno, rejectDocumentByIdDoctos, getMyDocuments, getReviewStudents, getReviewStudentDocuments, getProfilePhoto } from "../controllers/doctos.controller.js";
import { Subirimagen } from "../Middleware/storage.js";
import multer from "multer";

const router = Router();

// ===== Task 7.3 D2-A: contratos de LECTURA server-authoritative (Bearer) =====

// SELF: documentos del usuario autenticado (allowlist; sin hash/token).
router.get("/me/documents", verifyToken, getMyDocuments);

// Revisión PRECEPTOR: alumnos de SU dormitorio (dorm resuelto server-side; sin dorm=5 global).
router.get("/documents/review/students", verifyToken, getReviewStudents);

// Revisión PRECEPTOR: documentos de un alumno de SU dormitorio (target identificado por IdLogin).
router.get("/documents/review/students/:idLogin/documents", verifyToken, getReviewStudentDocuments);

// Foto de perfil (IdDocumento=6, server-side): política SELF / PRECEPTOR(mismo dorm) / CHECKER(grant vigente).
router.get("/users/:idLogin/profile-photo", verifyToken, getProfilePhoto);

// ===== Bridges legacy CONTENIDOS (DEPRECATED — REMOVE D2-C). Ahora exigen Bearer + ownership/scope. =====

// Bridge foto de perfil (?IdDocumento=6 obligatorio; misma política que /users/:idLogin/profile-photo).
router.get("/doctosProfile/:id", verifyToken, getProfile);

// Bridge SELF: :Id debe ser el IdLogin del token.
router.get("/doctos/:Id", verifyToken, getDocumentsByUser);

// Subida y reemplazo (multipart, campo 'Archivo'; jpg/jpeg/png/pdf, max 50 MB)
// Task 7.2: verifyToken ANTES de multer (no procesar archivo sin auth); IdLogin del body ignorado.
router.post("/doctosMul", verifyToken, Subirimagen.single('Archivo'), saveDocument)

router.put("/doctosMul/updateProfile", verifyToken, Subirimagen.single('Archivo'), uploadProfile)

// Borra doc propio (:Id del path ignorado, se usa token.id)
router.delete("/doctosMul/:Id", verifyToken, deleteFileDoc);

// Bridges de revisión CONTENIDOS (DEPRECATED — REMOVE D2-C): Bearer + PRECEPTOR + dorm forzado server-side
// (:IdDormi/:Dormitorio debe coincidir con el dorm del actor; ya NO existe vista global dorm=5).
router.get("/getExpediente/:IdDormi", verifyToken, getExpedientesAlumnos)

router.get("/getArchivos/:Dormitorio/:Nombre?/:Apellidos?/:Matricula?", verifyToken, getArchivosAlumno);

// RETIRADO (Task 7.3 D1-A): PUT /statusRevision/:Id (aprobación anónima, 0 consumidores) -> 404.

// Task 7.3 D1-A: rechazo documental SEGURO. Bearer; actor = token PRECEPTOR; scope de dormitorio +
// máquina de estados (Pendiente->Rechazado) + AuditLog server-side. Body { motivo, comentario? }.
router.put("/documents/:idDoctos/reject", verifyToken, rejectDocumentByIdDoctos);

// RETIRADO (Task 7.3 D1-C2): PUT /doctosMul/reject/:Id ELIMINADO → 404. El único contrato de rechazo
// es PUT /documents/:idDoctos/reject (arriba).

export default router;
