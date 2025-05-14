import { CheckerRepository } from "../adapter/repositories/checker.repository.js";
const repository = new CheckerRepository();

export async function buscarCheckersUseCase(correoEmpleado) {
    return await repository.buscarCheckers(correoEmpleado);
}

export async function cambiarActividadUseCase(idLogin, status, matricula) {
    return await repository.cambiarActividad(idLogin, status, matricula);
}

export async function eliminarCheckerUseCase(idLogin) {
    return await repository.eliminarChecker(idLogin);
}
