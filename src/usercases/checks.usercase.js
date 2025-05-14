// src/usecases/checks.usecase.js
import { ChecksRepository } from "../adapter/repositories/checks.repository.js";
const repository = new ChecksRepository();

export async function createChecksPermissionUseCase(data) {
    return await repository.createChecksPermission(data);
}

export async function getChecksDormitorioUseCase(idDormitorio) {
    return await repository.getChecksDormitorio(idDormitorio);
}

export async function getChecksDormitorioFinalUseCase(idDormitorio) {
    return await repository.getChecksDormitorioFinal(idDormitorio);
}

export async function getChecksVigilanciaUseCase() {
    return await repository.getChecksVigilancia();
  }
  
export async function getChecksVigilanciaRegresoUseCase() {
    return await repository.getChecksVigilanciaRegreso();
}
  
export async function putCheckPointUseCase(idCheck, FechaCheck, Estatus, Observaciones) {
    return await repository.putCheckPoint(idCheck, FechaCheck, Estatus, Observaciones);
}