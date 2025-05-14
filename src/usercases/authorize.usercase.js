// src/usecases/authorize.usecase.js
import { AuthorizeRepository } from "../adapter/repositories/authorize.repository.js";
const repository = new AuthorizeRepository();

export async function createAuthorizeUseCase(data) {
    return await repository.createAuthorize(data);
}

export async function asignarPreceptorUseCase(nivel, sexo) {
    return await repository.asignarPreceptor(nivel, sexo);
}

export async function definirAutorizacionUseCase(idPermiso, idEmpleado, statusAuthorize) {
    return await repository.definirAutorizacion(idPermiso, idEmpleado, statusAuthorize);
}

export async function verificarValidacionUseCase(idEmpleado, idPermiso) {
    return await repository.verificarValidacion(idEmpleado, idPermiso);
}

export async function advancePermissionUseCase(idPermission) {
    return await repository.advancePermission(idPermission);
}
