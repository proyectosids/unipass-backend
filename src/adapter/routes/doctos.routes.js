import { Router } from "express";
import multer from "multer";
import { getProfile, getDocumentsByUser, saveDocument, uploadProfile, deleteFileDoc, getExpedientesAlumnos, getArchivosAlumno, aprobarDocumento } from "../controller/doctos.controller.js";
import { Subirimagen } from "../../Middleware/storage.js";

const router = Router();

router.get("/doctosProfile/:id", getProfile);
router.get("/doctos/:Id", getDocumentsByUser);
router.post("/doctosMul", Subirimagen.single("Archivo"), saveDocument);
router.put("/doctosMul/updateProfile", Subirimagen.single("Archivo"), uploadProfile);
router.delete("/doctosMul/:Id", deleteFileDoc);
router.get("/getExpediente/:IdDormi", getExpedientesAlumnos);
router.get("/getArchivos/:Dormitorio/:Nombre/:Apellidos", getArchivosAlumno);
router.put("/statusRevision/:Id", aprobarDocumento);

export default router;
