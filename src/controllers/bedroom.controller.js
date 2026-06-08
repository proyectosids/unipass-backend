import { findBedroomBySexoYNivel } from '../repositories/bedroom.repo.js';

export const getBedroomStudent = async (req, res) => {
    try {
        const bedroom = await findBedroomBySexoYNivel(req.params.Sexo, req.params.NivelAcademico);
        res.json(bedroom);
    } catch (error) {
        console.error('Error en el servidor:', error);
        res.status(500).send(error.message);
    }
};
