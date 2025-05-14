// src/usecases/bedroom.usecase.js
import { BedroomRepository } from "../adapter/repositories/bedroom.repository.js";
const repository = new BedroomRepository();

export async function getBedroomStudentUseCase(sexo, nivelAcademico) {
    return await repository.getBedroomBySexoYNivel(sexo, nivelAcademico);
}
