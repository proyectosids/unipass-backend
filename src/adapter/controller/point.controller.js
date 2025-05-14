import { getPointsChecksUseCase } from "../../usercases/point.usercase.js";

export const getPointsChecks = async (req, res) => {
    try {
        const { Id } = req.params;
        const points = await getPointsChecksUseCase(Id);

        return res.status(200).json(points);
    } catch (error) {
        console.error("Error en getPointsChecks:", error);
        res.status(500).json({ error: error.message });
    }
};
