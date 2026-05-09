import { getConnection } from "../database/connection.js";
import sql from 'mssql';
import { emitToUser, emitToEmpleado } from "../util/socketHelpers.js";

export const createAuthorize = async (req, res) => {
    let pool;
    try {
        
        pool = await getConnection();
        const respuesta = await pool
            .request()
            .input('IdEmpleado', sql.Int, req.body.IdEmpleado)
            .input('NoDepto', sql.Int, req.body.NoDepto)
            .input('IdPermission', sql.Int, req.body.IdPermission)
            .input('StatusAuthorize', sql.VarChar, req.body.StatusAuthorize)
            .query('INSERT INTO Authorize (IdEmpleado, NoDepto, IdPermission, StatusAuthorize) VALUES (@IdEmpleado, @NoDepto, @IdPermission, @StatusAuthorize); SELECT SCOPE_IDENTITY() AS IdAuthorize');
        if (respuesta.recordset.length === 0) {
            return res.status(404).json({ message: "No se puede guardar el archivo" });
        }
        console.log(respuesta);
        res.json({
            Id: respuesta.recordset[0].IdAuthorize,
            IdEmpleado: req.body.IdEmpleado,
            NoDepto: req.body.NoDepto,
            IdPermission: req.body.IdPermission,
            StatusAuthorize: req.body.StatusAuthorize,
        });

        // Socket.IO: notificar al empleado asignado (+ cobertura)
        try {
            const io = req.app.get('io');
            await emitToEmpleado(io, pool, req.body.IdEmpleado, 'new_authorization_assigned', {
                idPermission: req.body.IdPermission,
                status: req.body.StatusAuthorize,
                timestamp: new Date().toISOString()
            });
        } catch (socketError) {
            console.error('[Socket] Error en createAuthorize:', socketError.message);
        }
    } catch (error) {
        if (error.code === 'ECONNCLOSED') {
            console.error('La conexión se cerró, reintentando...');
            return createAuthorize(req, res); // Intento de reconexión
        }
        console.error('Error en el servidor');
        res.status(500).json({ error: 'Error al crear el servicio'});
    } finally {
        if (pool) {
            try {
                await pool.close();
            } catch (closeError) {
                console.error('Error al cerrar la conexion a la base de datos:', closeError);
            }
            
        }
    }
}

export const asignarPreceptor = async (req, res) => {
    let pool;
    try {
        pool = await getConnection();
        const respuesta = await pool
            .request()
            .input('NivelDormitorio', sql.VarChar, req.params.Nivel)
            .input('Sexo', sql.VarChar, req.query.Sexo)
            .query('SELECT * FROM Bedroom WHERE NivelDormitorio = @NivelDormitorio AND Sexo = @Sexo')
        if (respuesta.rowsAffected[0] === 0) {
            return res.status(404).json({ message: "Dato no encontrado"});
        }
        return res.json(respuesta.recordset[0]);
    } catch (error) {
        if (error.code === 'ECONNCLOSED') {
            console.error('La conexión se cerró, reintentando...');
            return definirAutorizacion(req, res); // Intento de reconexión
        }
        console.error('Error en el servidor:', error);
        res.status(500).send(error.message);
    }finally {
        if (pool) {
            try {
                await pool.close();
            } catch (closeError) {
                console.error('Error al cerrar la conexion a la base de datos', closeError);
            }
        }
    }
}

export const definirAutorizacion = async (req, res) => {
    let pool;
    try {
        console.log(req.body);
        pool = await getConnection();
        const respuesta = await pool
            .request()
            .input('IdPermiso', sql.Int, req.params.Id)
            .input('IdEmpleado', sql.Int, req.body.IdEmpleado)
            .input('StatusAuthorize', sql.VarChar, req.body.StatusAuthorize)
            .query('UPDATE Authorize SET StatusAuthorize = @StatusAuthorize WHERE IdAuthorize = (SELECT TOP 1 IdAuthorize FROM Authorize WHERE IdPermission = @IdPermiso AND IdEmpleado = @IdEmpleado ORDER BY IdAuthorize)');

        if (respuesta.rowsAffected[0] === 0) {
            return res.status(404).json({ message: "Dato no actualizado" });
        }

        // Para devolver el registro actualizado
        const updatedRecord = await pool
            .request()
            .input('IdPermiso', sql.Int, req.params.Id)
            .input('IdEmpleado', sql.Int, req.body.IdEmpleado)
            .input('StatusAuthorize', sql.VarChar, req.body.StatusAuthorize) // Aquí se agrega el parámetro StatusAuthorize
            .query(`SELECT * FROM Authorize 
                    WHERE IdPermission = @IdPermiso 
                    AND IdEmpleado = @IdEmpleado 
                    AND StatusAuthorize = @StatusAuthorize 
                    ORDER BY IdAuthorize DESC`);

        // Socket.IO: obtener matricula del alumno y siguiente eslabon en cadena
        let matriculaAlumno = null;
        let nextEmpleado = null;
        try {
            const alumnoResult = await pool.request()
                .input('IdPermisoSocket', sql.Int, req.params.Id)
                .query('SELECT L.Matricula FROM Permission P JOIN LoginUniPass L ON P.IdUser = L.IdLogin WHERE P.IdPermission = @IdPermisoSocket');
            if (alumnoResult.recordset.length > 0) {
                matriculaAlumno = alumnoResult.recordset[0].Matricula;
            }

            // Si fue aprobada, buscar el siguiente Authorize Pendiente en la cadena
            if (req.body.StatusAuthorize === 'Aprobada') {
                const chainResult = await pool.request()
                    .input('IdPermisoChain', sql.Int, req.params.Id)
                    .query(`SELECT TOP 1 IdEmpleado
                            FROM Authorize
                            WHERE IdPermission = @IdPermisoChain
                              AND StatusAuthorize = 'Pendiente'
                            ORDER BY IdAuthorize`);
                if (chainResult.recordset.length > 0) {
                    nextEmpleado = chainResult.recordset[0].IdEmpleado;
                }
            }
        } catch (queryError) {
            console.error('[Socket] Error obteniendo datos para emit:', queryError.message);
        }

        res.json(updatedRecord.recordset[0]);

        // Emitir eventos
        try {
            const io = req.app.get('io');

            // 1) Notificar al alumno del cambio de estado
            emitToUser(io, matriculaAlumno, 'permission_status_changed', {
                idPermission: parseInt(req.params.Id),
                status: req.body.StatusAuthorize,
                updatedBy: req.body.IdEmpleado,
                timestamp: new Date().toISOString()
            });

            // 2) Si hay siguiente eslabon (jefe aprobo -> preceptor), notificarlo
            if (nextEmpleado) {
                await emitToEmpleado(io, pool, nextEmpleado, 'new_authorization_assigned', {
                    idPermission: parseInt(req.params.Id),
                    status: 'Pendiente',
                    timestamp: new Date().toISOString()
                });
            }
        } catch (socketError) {
            console.error('[Socket] Error en definirAutorizacion:', socketError.message);
        }
    } catch (error) {
        if (error.code === 'ECONNCLOSED') {
            console.error('La conexión se cerró, reintentando...');
            return definirAutorizacion(req, res); // Intento de reconexión
        }
        console.error('Error en el servidor:', error);
        res.status(500).send(error.message);
    } finally {
        if (pool) {
            try {
                await pool.close();
            } catch (error) {
                console.error('Error al cerrar la conexión a la base de datos', error);
            }
        }
    }
};

export const verificarValidacion = async (req, res) => {
    let pool
    try {
        pool = await getConnection();
        const respuesta = await pool.request()
        .input('IdEmpleado', sql.Int, req.params.Id)
        .input('IdPermiso', sql.Int, req.query.IdPermiso)
        .query('SELECT * FROM Authorize WHERE IdEmpleado = @IdEmpleado AND IdPermission = @IdPermiso')
        if (respuesta.rowsAffected[0] === 0) {
            return res.status(404).json({ message: "Dato no encontrado"});
        }
        return res.json(respuesta.recordset[0]);
    } catch (error) {
        if (error.code === 'ECONNCLOSED') {
            console.error('La conexión se cerró, reintentando...');
            return verificarValidacion(req, res); // Intento de reconexión
        }
        console.error('Error en el servidor:', error);
        res.status(500).send(error.message);
    } finally {
        if (pool) {
            try {
                await pool.close();
            } catch (error) {
                console.error('Error al cerrar la conexion a la base de datos:');
            }
        }
    }
}

export const AdvancePermission = async (req, res) => {
    let pool
    try {
        console.log(req.params.Id);
        pool = await getConnection();
        const respuesta = await pool.request()
        .input('Id', sql.Int, req.params.Id)
        .query('SELECT * FROM Authorize WHERE IdPermission = @Id');
        // Verifica si hay resultados.
        if (respuesta.recordset.length === 0) {
            return res.status(404).json({ message: "Dato no encontrado" });
        }
        return res.json(respuesta.recordset);
    } catch (error) {
        res.status(500).json({ error: error.message });
    } finally {
        if (pool) {
            try {
                await pool.close();
            } catch (error) {
                console.error('Error al cerrar la conexion a la base de datos:');
            }
        }
    }
}
