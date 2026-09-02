import { Router } from "express";
import { verifyToken } from "../Middleware/verifityToken.js";
import { deleteFileDoc, saveDocument, uploadProfile, rejectDocumentByIdDoctos, getMyDocuments, getReviewStudents, getReviewStudentDocuments, getProfilePhoto, getFileByIdDoctos } from "../controllers/doctos.controller.js";
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

// Task 7.3 D2-B2: entrega AUTENTICADA de binarios documentales por PK. Bearer; identifica por IdDoctos;
// política por IdDocumento (foto=6 admite CHECKER; privados solo SELF/PRECEPTOR mismo dorm); anti path
// traversal; stream inline; sin redirect a /uploads. Contrato para Flutter D2-B3.
router.get("/files/:idDoctos", verifyToken, getFileByIdDoctos);

// RETIRADOS (Task 7.3 D2-C): los bridges de LECTURA legacy fueron ELIMINADOS → 404 (con o sin token).
// Flutter (D2-B1/D2-B3) confirmó 0 consumidores. Los contratos definitivos son los de arriba:
//   `GET /doctosProfile/:id`  -> usar `GET /users/:idLogin/profile-photo` + `GET /files/:idDoctos`
//   `GET /doctos/:Id`         -> usar `GET /me/documents` + `GET /files/:idDoctos`
//   `GET /getExpediente/:IdDormi` / `GET /getArchivos/...` -> usar `GET /documents/review/students[...]`
// No se mantienen aliases ni redirects.

// Subida y reemplazo (multipart, campo 'Archivo'; jpg/jpeg/png/pdf, max 50 MB)
// Task 7.2: verifyToken ANTES de multer (no procesar archivo sin auth); IdLogin del body ignorado.
router.post("/doctosMul", verifyToken, Subirimagen.single('Archivo'), saveDocument)

router.put("/doctosMul/updateProfile", verifyToken, Subirimagen.single('Archivo'), uploadProfile)

// Borra doc propio (:Id del path ignorado, se usa token.id)
router.delete("/doctosMul/:Id", verifyToken, deleteFileDoc);

// RETIRADO (Task 7.3 D2-C): GET /getExpediente/:IdDormi y GET /getArchivos/... ELIMINADOS → 404.
// Reemplazo: GET /documents/review/students y GET /documents/review/students/:idLogin/documents.

// RETIRADO (Task 7.3 D1-A): PUT /statusRevision/:Id (aprobación anónima, 0 consumidores) -> 404.

// Task 7.3 D1-A: rechazo documental SEGURO. Bearer; actor = token PRECEPTOR; scope de dormitorio +
// máquina de estados (Pendiente->Rechazado) + AuditLog server-side. Body { motivo, comentario? }.
router.put("/documents/:idDoctos/reject", verifyToken, rejectDocumentByIdDoctos);

// RETIRADO (Task 7.3 D1-C2): PUT /doctosMul/reject/:Id ELIMINADO → 404. El único contrato de rechazo
// es PUT /documents/:idDoctos/reject (arriba).

export default router;
