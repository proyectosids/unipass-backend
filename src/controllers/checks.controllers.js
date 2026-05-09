import { getConnection } from "../database/connection.js";
import sql from 'mssql';
import { emitToUser } from "../util/socketHelpers.js";

export const createChecksPermission = async (req, res) => {
    let pool;
    try {
        pool = await getConnection();
        const result = await pool
            .request()
            //.input('FechaCheck', sql.DateTime, req.body.FechaCheck)
            .input('StatusCheck', sql.VarChar, 'Pendiente')
            .input('Accion', sql.VarChar, req.body.Accion)
            .input('IdPoint', sql.Int, req.body.IdPoint)
            .input('IdPermission', sql.Int, req.body.IdPermission)
            .input('Observaciones', sql.VarChar, 'Ninguna')
            .query('INSERT INTO CheckPoints (Estatus, Accion, IdPoint, IdPermission) VALUES (@StatusCheck, @Accion, @IdPoint, @IdPermission); SELECT SCOPE_IDENTITY() AS IdCheck;')

        console.log(result);
        res.json({
            Id: result.recordset[0].IdCheck,
            //FechaCheck: req.body.FechaCheck,
            StatusCheck: 'Pendiente',
            Accion: req.body.Accion,
            IdPoint: req.body.IdPoint,
            IdPermission: req.body.IdPermission,
            Observaciones: 'Ninguna'
        })
    } catch (error) {
        console.error('Error en el servidor');
        res.status(500).json({error: 'Error al crear el servico'})
    } finally {
        if(pool){
            try {
                await pool.close();
            } catch (closeError) {
                console.error('Error al cerrar la conexion a la base de datos:, closeError')
            }
        }
    }
}

export const getChecksDormitorio = async (req, res) => {
    let pool;
    try {
        pool = await getConnection();
        const result = await pool
            .request()
            .input('StatusPermission', sql.VarChar, 'Aprobada')
            .input('PuntoName', sql.VarChar, 'Dormitorio')
            .input('Dormitorio', sql.Int, req.params.Id)
            .input('CheckEstado', sql.VarChar, 'Pendiente')
            .query(`SELECT Permission.*, TypeExit.*, LoginUniPass.*, CheckPoints.*, Point.*
FROM Permission
JOIN TypeExit ON Permission.IdTipoSalida = TypeExit.IdTypeExit
JOIN LoginUniPass ON Permission.IdUser = LoginUniPass.IdLogin
JOIN CheckPoints ON Permission.IdPermission = CheckPoints.IdPermission
JOIN Point ON CheckPoints.IdPoint = Point.IdPoint
WHERE Permission.StatusPermission = 'Aprobada'
  AND Point.NombrePunto = 'Dormitorio'
  AND CheckPoints.Estatus = 'Pendiente'
  AND Accion = 'SALIDA'
  AND LoginUniPass.Dormitorio = @Dormitorio
  AND CONVERT(DATE, Permission.FechaSalida) <= CONVERT(DATE, GETDATE());`);
        if (result.rowsAffected[0] === 0) {
            return res.status(200).json(null); // Retorna null si no hay datos
        }
        return res.json(result.recordset);
    } catch (error) {
        console.error('Error en el servidor:', error);
        res.status(500).send(error.message);
    } finally {
        if (pool) {
            try {
                await pool.close();
            } catch (closeError) {
                console.error('Error al cerrar la conexión a la base de datos:', closeError);
            }
        }
    }
};

export const getChecksDormitorioFinal = async (req, res) => {
    let pool;
    try {
        pool = await getConnection();
        const result = await pool
            .request()
            .input('StatusPermission', sql.VarChar, 'Aprobada')
            .input('PuntoName', sql.VarChar, 'Dormitorio')
            .input('Dormitorio', sql.Int, req.params.Id)
            .input('CheckEstado', sql.VarChar, 'Pendiente')
            .query(`WITH OrderedCheckPoints AS (
                        SELECT 
                            CheckPoints.*,
                            ROW_NUMBER() OVER (PARTITION BY IdPermission ORDER BY FechaCheck) AS CheckNumber
                        FROM CheckPoints
                    )
                    SELECT 
                        Permission.*, 
                        TypeExit.*, 
                        LoginUniPass.*, 
                        CheckPoints.*, 
                        Point.*
                    FROM Permission
                    JOIN TypeExit ON Permission.IdTipoSalida = TypeExit.IdTypeExit
                    JOIN LoginUniPass ON Permission.IdUser = LoginUniPass.IdLogin
                    JOIN CheckPoints ON Permission.IdPermission = CheckPoints.IdPermission
                    JOIN Point ON CheckPoints.IdPoint = Point.IdPoint
                    WHERE Permission.StatusPermission = 'Aprobada'
                      AND Point.NombrePunto = 'Dormitorio'
                      AND LoginUniPass.Dormitorio = @Dormitorio
                      AND CheckPoints.Estatus = 'Pendiente'
                      AND CheckPoints.Accion = 'RETORNO'
                      AND EXISTS (
                          SELECT 1
                          FROM OrderedCheckPoints AS SubCheck
                          WHERE SubCheck.IdPermission = Permission.IdPermission
                            AND SubCheck.CheckNumber = 2
                            AND SubCheck.Estatus = 'Confirmada'
                      )
                      AND EXISTS (
                          SELECT 1
                          FROM OrderedCheckPoints AS SubCheck
                          WHERE SubCheck.IdPermission = Permission.IdPermission
                            AND SubCheck.CheckNumber = 3
                            AND SubCheck.Estatus = 'Confirmada'
                      );`);
        if (result.rowsAffected[0] === 0) {
            return res.status(200).json(null); // Retorna null si no hay datos
        }
        return res.json(result.recordset);
    } catch (error) {
        console.error('Error en el servidor:', error);
        res.status(500).send(error.message);
    } finally {
        if (pool) {
            try {
                await pool.close();
            } catch (closeError) {
                console.error('Error al cerrar la conexión a la base de datos:', closeError);
            }
        }
    }
};


export const getChecksVigilancia = async (req, res) => {
    let pool;
    try {
        pool = await getConnection();
        const result = await pool
            .request()
            .input('StatusPermission', sql.VarChar, 'Aprobada')
            .input('PuntoName', sql.VarChar, 'Caseta')
            .input('CheckEstado', sql.VarChar, 'Pendiente')
            .query(`SELECT Permission.*, TypeExit.*, LoginUniPass.*, CheckPoints.*, Point.*
                    FROM Permission
                    JOIN TypeExit ON Permission.IdTipoSalida = TypeExit.IdTypeExit
                    JOIN LoginUniPass ON Permission.IdUser = LoginUniPass.IdLogin
                    JOIN CheckPoints ON Permission.IdPermission = CheckPoints.IdPermission
                    JOIN Point ON CheckPoints.IdPoint = Point.IdPoint
                    WHERE 
                      Permission.StatusPermission = @StatusPermission
                      AND Point.NombrePunto = @PuntoName
                      AND CheckPoints.Estatus = @CheckEstado
                      AND CheckPoints.Accion = 'SALIDA'
                      AND EXISTS (
                          SELECT 1
                          FROM CheckPoints AS SubCheck
                          WHERE SubCheck.IdPermission = Permission.IdPermission
                            AND SubCheck.Estatus = 'Confirmada'
                            AND SubCheck.FechaCheck = (
                                SELECT MIN(FechaCheck)
                                FROM CheckPoints AS FirstCheck
                                WHERE FirstCheck.IdPermission = SubCheck.IdPermission
                            )
                      );`);
        if (result.rowsAffected[0] === 0) {
            return res.status(200).json(null); // Retorna null si no hay datos
        }
        return res.json(result.recordset);
    } catch (error) {
        console.error('Error en el servidor:', error);
        res.status(500).send(error.message);
    } finally {
        if (pool) {
            try {
                await pool.close();
            } catch (closeError) {
                console.error('Error al cerrar la conexión a la base de datos:', closeError);
            }
        }
    }
};
export const getChecksVigilanciaRegreso = async (req, res) => {
    let pool;
    try {
        pool = await getConnection();
        const result = await pool
            .request()
            .input('StatusPermission', sql.VarChar, 'Aprobada')
            .input('PuntoName', sql.VarChar, 'Caseta')
            .input('CheckEstado', sql.VarChar, 'Pendiente')
            .query(`SELECT 
    Permission.*, 
    TypeExit.*, 
    LoginUniPass.*, 
    CheckPoints.*, 
    Point.*
FROM Permission
JOIN TypeExit ON Permission.IdTipoSalida = TypeExit.IdTypeExit
JOIN LoginUniPass ON Permission.IdUser = LoginUniPass.IdLogin
JOIN CheckPoints ON Permission.IdPermission = CheckPoints.IdPermission
JOIN Point ON CheckPoints.IdPoint = Point.IdPoint
WHERE 
    Permission.StatusPermission = @StatusPermission
    AND Point.NombrePunto = @PuntoName
    AND CheckPoints.Estatus = @CheckEstado
    AND CheckPoints.Accion = 'RETORNO'
    AND EXISTS (
        SELECT 1
        FROM CheckPoints AS SubCheck
        JOIN Point AS SubPoint ON SubCheck.IdPoint = SubPoint.IdPoint
        WHERE 
            SubCheck.IdPermission = Permission.IdPermission
            AND SubPoint.NombrePunto = 'Caseta'
            AND SubCheck.Estatus = 'Confirmada'
            AND SubCheck.Accion = 'SALIDA'
    );`);
        if (result.rowsAffected[0] === 0) {
            return res.status(200).json(null); // Retorna null si no hay datos
        }
        return res.json(result.recordset);
    } catch (error) {
        console.error('Error en el servidor:', error);
        res.status(500).send(error.message);
    } finally {
        if (pool) {
            try {
                await pool.close();
            } catch (closeError) {
                console.error('Error al cerrar la conexión a la base de datos:', closeError);
            }
        }
    }
};


// Controlador para actualizar el estado y la fecha/hora de un CheckPoint
export const putCheckPoint = async (req, res) => {
    let pool;
    try {
        const { id } = req.params; // El ID del checkpoint a actualizar
        const { FechaCheck, Estatus, Observaciones} = req.body; // Los datos enviados en la petición
        
        pool = await getConnection();
        const result = await pool
            .request()
            .input('IdCheck', sql.Int, id)
            .input('FechaCheck', sql.DateTime, FechaCheck) // La fecha y hora que quieres asignar
            .input('Estatus', sql.VarChar, Estatus) // El nuevo estado
            .input('Observacion', sql.VarChar, Observaciones) // El nuevo estado
            .query('UPDATE CheckPoints SET FechaCheck = @FechaCheck, Estatus = @Estatus, Observaciones = @Observacion WHERE IdCheck = @IdCheck');

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ message: "CheckPoint no encontrado" });
        }

        // Socket.IO: obtener info del checkpoint para notificar al alumno
        let checkInfo = null;
        try {
            const checkResult = await pool.request()
                .input('IdCheckSocket', sql.Int, id)
                .query(`SELECT L.Matricula, CP.IdPermission, CP.Accion
                        FROM CheckPoints CP
                        JOIN Permission P ON CP.IdPermission = P.IdPermission
                        JOIN LoginUniPass L ON P.IdUser = L.IdLogin
                        WHERE CP.IdCheck = @IdCheckSocket`);
            if (checkResult.recordset.length > 0) {
                checkInfo = checkResult.recordset[0];
            }
        } catch (queryError) {
            console.error('Error obteniendo info check para socket:', queryError);
        }

        res.json({ message: "CheckPoint actualizado correctamente" });

        // Emitir check_updated al alumno
        try {
            const io = req.app.get('io');
            if (checkInfo) {
                emitToUser(io, checkInfo.Matricula, 'check_updated', {
                    idCheck: parseInt(id),
                    idPermission: checkInfo.IdPermission,
                    estatus: Estatus,
                    accion: checkInfo.Accion,
                    timestamp: new Date().toISOString()
                });
            }
        } catch (socketError) {
            console.error('[Socket] Error en putCheckPoint:', socketError.message);
        }
    } catch (error) {
        console.error('Error al actualizar el CheckPoint:', error);
        res.status(500).json({ error: 'Error al actualizar el CheckPoint' });
    } finally {
        if (pool) {
            try {
                await pool.close();
            } catch (closeError) {
                console.error('Error al cerrar la conexión a la base de datos:', closeError);
            }
        }
    }
}

