// src/usecases/doctos.usecase.js
import { DoctosRepository } from "../adapter/repositories/doctos.repository.js";
const repository = new DoctosRepository();

export async function getProfileUseCase(idLogin, idDocumento) {
    return await repository.getProfile(idLogin, idDocumento);
}

export async function getDocumentsByUserUseCase(idLogin) {
    return await repository.getDocumentsByUser(idLogin);
}

export async function saveDocumentUseCase(data) {
    return await repository.saveDocument(data);
}

export async function uploadProfileUseCase(data) {
    return await repository.uploadProfile(data);
}

export async function deleteFileDocUseCase(id, idDocumento, deleteCallback) {
    return await repository.deleteFileDoc(id, idDocumento, deleteCallback);
}

export async function getExpedientesAlumnosUseCase(idDormi) {
    return await repository.getExpedientesAlumnos(idDormi);
}

export async function getArchivosAlumnoUseCase(dormitorio, nombre, apellidos) {
    return await repository.getArchivosAlumno(dormitorio, nombre, apellidos);
}

export async function aprobarDocumentoUseCase(idLogin, idDocumento) {
    return await repository.aprobarDocumento(idLogin, idDocumento);
}
