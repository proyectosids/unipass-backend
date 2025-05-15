import { Router } from "express";
import { deleteFileDoc, getDocumentsByUser, saveDocument, getProfile, uploadProfile, getExpedientesAlumnos, getArchivosAlumno, aprobarDocumento } from "../controllers/doctos.controller.js";
import { Subirimagen } from "../Middleware/storage.js"; 
import multer from "multer";

const router = Router();

router.get("/doctosProfile/:id", getProfile);

router.get("/doctos/:Id", getDocumentsByUser);

router.post("/doctosMul", Subirimagen.single('Archivo'), saveDocument)

router.put("/doctosMul/updateProfile", Subirimagen.single('Archivo'), uploadProfile)

router.delete("/doctosMul/:Id", deleteFileDoc);

router.get("/getExpediente/:IdDormi", getExpedientesAlumnos)

router.get("/getArchivos/:Dormitorio/:Nombre?/:Apellidos?/:Matricula?", getArchivosAlumno);

router.put("/statusRevision/:Id", aprobarDocumento)

export default router;
