import { getBedroomStudentUseCase } from "../../usercases/bedroom.usercase.js";

export async function getBedroomStudent(req, res) {
    try {
        const { Sexo, NivelAcademico } = req.params;
        const bedroom = await getBedroomStudentUseCase(Sexo, NivelAcademico);
        if (!bedroom) return res.status(404).json({ message: "Dormitorio no encontrado" });
        res.json(bedroom);
    } catch (error) {
        console.error("Error en el servidor:", error);
        res.status(500).send(error.message);
    }
}
