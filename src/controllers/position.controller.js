// Controlador de Position (cargos delegados / suplencias entre empleados): mientras
// el cargo esta Activo, el suplente recibe sockets y push del encargado. Mecanismo
// independiente de CheckerGrant (no confundir con el checador).
import {
    findPositionByMatricula,
    findPositionsByMatriculaEncargado,
    createPosition as createPositionRepo,
    updatePositionActivo
} from '../repositories/position.repo.js';

export const getInfoCargo = async (req, res) => {
    try {
        const position = await findPositionByMatricula(req.params.Id);
        return res.json(position);
    } catch (error) {
        console.error('Error en el servidor:', error);
        res.status(500).send(error.message);
    }
};

export const getInfoDelegado = async (req, res) => {
    try {
        const positions = await findPositionsByMatriculaEncargado(req.params.Id);
        return res.json(positions);
    } catch (error) {
        console.error('Error en el servidor:', error);
        res.status(500).send(error.message);
    }
};

export const createPosition = async (req, res) => {
    try {
        const created = await createPositionRepo({
            matriculaEncargado: req.body.MatriculaEncargado,
            classUser: req.body.ClassUser,
            asignado: req.body.Asignado
        });

        if (!created) {
            return res.status(400).json({ message: 'No se pudo crear el registro' });
        }

        return res.status(201).json({
            message: 'Registro creado exitosamente',
            data: created
        });
    } catch (error) {
        console.error('Error en el servidor:', error);
        res.status(500).send(error.message);
    }
};

export const cambiarActivo = async (req, res) => {
    if (!req.params.Id) {
        return res.status(400).json({ message: "El parámetro 'Id' es obligatorio" });
    }

    if (typeof req.body.Activo !== 'number') {
        return res.status(400).json({ message: "El valor de 'Activo' debe ser un número" });
    }

    try {
        const updated = await updatePositionActivo(req.params.Id, req.body.Activo);

        if (!updated) {
            return res.status(404).json({ message: 'No se encontró el IdCargo o no se actualizó' });
        }

        return res.status(200).json({ message: 'Estado actualizado exitosamente' });
    } catch (error) {
        console.error('Error en el servidor:', error);
        res.status(500).send(error.message);
    }
};
