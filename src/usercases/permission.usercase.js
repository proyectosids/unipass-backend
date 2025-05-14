import { PermissionRepository } from "../adapter/repositories/permission.repository";
const repository = new PermissionRepository();

export async function getPermissionsByUserUseCase(id, page, limit) {
    return await repository.getPermissionsByUser(id, page, limit);
}

export async function getPermissionForAutorizacionPreceUseCase(id) {
    return await repository.getPermissionForAutorizacionPrece(id);
}

export async function getPermissionForAutorizacionUseCase(id) {
    return await repository.getPermissionForAutorizacion(id);
}

export async function createPermissionUseCase(data) {
    return await repository.createPermission(data);
}

export async function deletePermissionUseCase(id) {
    return await repository.deletePermission(id);
}

export async function cancelPermissionUseCase(id) {
    return await repository.cancelPermission(id);
}

export async function autorizarPermisoUseCase(id, status, observaciones) {
    return await repository.autorizarPermiso(id, status, observaciones);
}

export async function topPermissionStudentUseCase(idLogin) {
    return await repository.topPermissionStudent(idLogin);
}

export async function topPermissionEmployeeUseCase(matricula) {
    return await repository.topPermissionEmployee(matricula);
}

export async function topPermissionPreceUseCase(matricula) {
    return await repository.topPermissionPrece(matricula);
}

export async function dashboardPermissionUseCase(matricula) {
    return await repository.dashboardPermission(matricula);
}

export async function dashboardDocumentosUseCase(matricula) {
    return await repository.dashboardDocumentos(matricula);
}

export async function filtrarPermisosUseCase({ idEmpleado, fechaInicio, fechaFin, status, nombre, matricula }) {
    return await repository.filtrarPermisos({ idEmpleado, fechaInicio, fechaFin, status, nombre, matricula });
}
