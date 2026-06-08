import { findPointsByExitId } from '../repositories/point.repo.js';

export const getPointsChecks = async (req, res) => {
    try {
        const points = await findPointsByExitId(req.params.Id);
        res.json(points);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
