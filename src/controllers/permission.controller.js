import { getConnection } from "../database/connection.js";
import sql from 'mssql';

export const getPermissionsByUser = async (req, res) => {
    let pool;
    const { page = 1, limit = 10 } = req.query; // Valores por defecto: página 1 y 10 elementos
    const offset = (page - 1) * limit; // Calcular el desplazamiento (offset)

    try {
        pool = await getConnection();
        const result = await pool
            .request()
            .input('Id', sql.Int, req.params.Id)
            .input('Limit', sql.Int, parseInt(limit))
            .input('Offset', sql.Int, parseInt(offset))
            .query(`
                SELECT * FROM Permission 
                JOIN TypeExit ON Permission.IdTipoSalida = TypeExit.IdTypeExit 
                JOIN LoginUniPass ON Permission.IdUser = LoginUniPass.IdLogin 
                WHERE IdLogin = @Id
                ORDER BY Permission.FechaSolicitada DESC
                OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY
            `);

        // Consulta adicional para contar el total de permisos de usuario
        const totalResult = await pool
            .request()
            .input('Id', sql.Int, req.params.Id)
            .query(`
                SELECT COUNT(*) as TotalPermissions FROM Permission 
                WHERE IdUser = @Id
            `);
        const totalItems = totalResult.recordset[0].TotalPermissions;
        const totalPages = Math.ceil(totalItems / limit);

        // Responder con los datos y los metadatos de paginación
        res.json({
            data: result.recordset,
            pagination: {
                totalItems,
                totalPages,
                currentPage: parseInt(page),
                limit: parseInt(limit)
            }
        });
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


export const getPermission = async (req, res) => {
    let pool;
    try {
        console.log(req.params.Id);
        pool = await getConnection();
        const result = await pool
            .request()
            .input("Id", sql.Int, req.params.Id)
            .query("SELECT * FROM Permission WHERE IdPermission = @Id");

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ message: "Dato no encontrado" });
        }
        return res.json(result.recordset[0]);
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

export const createPermission = async (req, res) => {
    let pool;
    try {
        console.log(req.body);
        pool = await getConnection();

        // Verifica si el IdUsuario existe en dbo.Users
        const userResult = await pool.request()
            .input('IdUser', sql.Int, req.body.IdUser)
            .query('SELECT 1 FROM dbo.LoginUniPass WHERE IdLogin = @IdUser');

        if (userResult.recordset.length > 0) {
            // Resta 6 horas a cada fecha
            const fechaSolicitada = new Date(req.body.FechaSolicitada);
            fechaSolicitada.setHours(fechaSolicitada.getHours() - 6);
            const fechaSalida = new Date(req.body.FechaSalida);
            fechaSalida.setHours(fechaSalida.getHours() - 6);
            const fechaRegreso = new Date(req.body.FechaRegreso);
            fechaRegreso.setHours(fechaRegreso.getHours() - 6);

            // Convertir fechas a UTC
            const fechaSolicitadaUTC = fechaSolicitada.toISOString();
            const fechaSalidaUTC = fechaSalida.toISOString();
            const fechaRegresoUTC = fechaRegreso.toISOString();

            // Inserta en la tabla Permission
            const result = await pool
                .request()
                .input('FechaSolicitada', sql.DateTime, fechaSolicitadaUTC)
                .input('StatusPermission', sql.VarChar, req.body.StatusPermission)
                .input('FechaSalida', sql.DateTime, fechaSalidaUTC)
                .input('FechaRegreso', sql.DateTime, fechaRegresoUTC)
                .input('Motivo', sql.VarChar, req.body.Motivo)
                .input('IdUser', sql.Int, req.body.IdUser)
                .input('IdTipoSalida', sql.Int, req.body.IdTipoSalida)
                .input('Observaciones', sql.VarChar, 'Ninguna')
                .query('INSERT INTO Permission (FechaSolicitada, StatusPermission, FechaSalida, FechaRegreso, Motivo, IdUser, IdTipoSalida, Observaciones) VALUES (@FechaSolicitada, @StatusPermission, @FechaSalida, @FechaRegreso, @Motivo, @IdUser, @IdTipoSalida, @Observaciones); SELECT SCOPE_IDENTITY() AS IdPermission');

            console.log(result);
            res.json({
                Id: result.recordset[0].IdPermission,
                FechaSolicitada: fechaSolicitadaUTC,
                StatusPermission: req.body.StatusPermission,
                FechaSalida: fechaSalidaUTC,
                FechaRegreso: fechaRegresoUTC,
                Motivo: req.body.Motivo,
                MedioSalida: req.body.MedioSalida,
                IdUser: req.body.IdUser,
                IdTipoSalida: req.body.IdTipoSalida,
            });
        } else {
            res.status(400).json({ error: 'El IdUsuario no existe en dbo.Users' });
        }
    } catch (err) {
        console.error('Error en el servidor:', err);
        res.status(500).json({ error: 'Error al crear el permiso' });
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



export const cancelPermission = async (req, res) => {
    let pool;
    try {
        pool = await getConnection();
        const result = await pool
            .request()
            .input("Id", sql.Int, req.params.Id)
            .input("StatusPermission", sql.VarChar, "Cancelado")
            .query("UPDATE Permission SET StatusPermission = @StatusPermission WHERE IdPermission = @Id");

        console.log(result);
        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ message: "Dato no encontrado" });
        }
        res.json("Dato Actualizado");
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

export const deletePermission = async (req, res) => {
    let pool;
    try {
        pool = await getConnection();
        const result = await pool.request()
            .input("Id", sql.Int, req.params.Id)
            .query("DELETE FROM Permission WHERE IdPermission = @Id");

        console.log(result);
        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ message: "Dato no encontrado" });
        }
        return res.json({ message: "Dato Eliminado" });
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

export const getPermissionForAutorizacion = async (req, res) => {
    let pool;
    try {
        pool = await getConnection();
        const result = await pool.request()
            .input("Id", sql.Int, req.params.Id)
            .query(`SELECT Permission.*, TypeExit.*, LoginUniPass.* 
FROM Permission 
INNER JOIN Authorize ON Permission.IdPermission = Authorize.IdPermission 
JOIN TypeExit ON Permission.IdTipoSalida = TypeExit.IdTypeExit 
JOIN LoginUniPass ON Permission.IdUser = LoginUniPass.IdLogin 
WHERE Authorize.IdEmpleado = @Id 
AND Permission.FechaSalida BETWEEN DATEADD(DAY, -30, GETDATE()) AND DATEADD(DAY, 15, GETDATE());
`)

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ message: "Dato no encontrado" });
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

export const getPermissionForAutorizacionPrece = async (req, res) => {
    let pool;
    try {
        pool = await getConnection();
        const result = await pool.request()
            .input("Id", sql.Int, req.params.Id)
            .query(`SELECT Permission.*, TypeExit.*, LoginUniPass.* 
FROM Permission 
INNER JOIN Authorize ON Permission.IdPermission = Authorize.IdPermission 
JOIN TypeExit ON Permission.IdTipoSalida = TypeExit.IdTypeExit 
JOIN LoginUniPass ON Permission.IdUser = LoginUniPass.IdLogin 
WHERE Authorize.IdEmpleado = @Id 
AND Permission.IdPermission IN (
    SELECT A1.IdPermission 
    FROM Authorize A1 
    GROUP BY A1.IdPermission 
    HAVING COUNT(A1.IdAuthorize) = 1
)
AND Permission.FechaSalida BETWEEN DATEADD(DAY, -30, GETDATE()) AND DATEADD(DAY, 15, GETDATE())

UNION

SELECT Permission.*, TypeExit.*, LoginUniPass.* 
FROM Permission 
INNER JOIN Authorize ON Permission.IdPermission = Authorize.IdPermission 
JOIN TypeExit ON Permission.IdTipoSalida = TypeExit.IdTypeExit 
JOIN LoginUniPass ON Permission.IdUser = LoginUniPass.IdLogin 
WHERE Authorize.IdEmpleado = @Id 
AND Permission.IdPermission IN (
    SELECT A1.IdPermission 
    FROM Authorize A1 
    WHERE A1.StatusAuthorize = 'Aprobada' 
    AND A1.IdAuthorize = (
        SELECT TOP 1 A2.IdAuthorize 
        FROM Authorize A2 
        WHERE A2.IdPermission = A1.IdPermission 
        ORDER BY A2.IdAuthorize
    )
)
AND Permission.FechaSalida BETWEEN DATEADD(DAY, -30, GETDATE()) AND DATEADD(DAY, 15, GETDATE());`)

        if (result.rowsAffected[0] === 0) {
            return res.json(null);
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

export const autorizarPermiso = async (req, res) => {
    let pool;
    try {
        pool = await getConnection();
        const respuesta = await pool.request()
            .input('IdPermiso', sql.Int, req.params.Id)
            .input('StatusPermission', sql.VarChar, req.body.StatusPermission)
            .input('Observaciones', sql.VarChar, req.body.Observaciones)
            .query('UPDATE Permission SET StatusPermission = @StatusPermission, Observaciones = @Observaciones WHERE IdPermission = @IdPermiso');
        if (respuesta.rowsAffected[0] === 0) {
            return res.status(404).json({ message: "Dato no actualizado" });
        }
        res.json({ message: "Permiso actualizado correctamente" });
    } catch (error) {
        console.error('Error en el servidor:', error);
        res.status(500).send(error.message);
    } finally {
        if (pool) {
            try {
                await pool.close();
            } catch (error) {
                console.error('Error al cerrar la conexion a la base de datos:', error.message);
            }
        }
    }
}

export const topPermissionStudent = async (req, res) => {
    let pool;
    try {
        pool = await getConnection();
        const respuesta = await pool
            .request()
            .input('IdLogin', sql.Int, req.params.Id)
            .query(`SELECT TOP 10 *
                    FROM Permission 
                    WHERE IdUser = @IdLogin 
                    ORDER BY FechaSolicitada DESC`);

        if (respuesta.rowsAffected[0] === 0) {
            return res.status(404).json({ message: "Dato no encontrado" });
        }

        return res.json(respuesta.recordset); // se devuelven todos
    } catch (error) {
        console.error('Error en el servidor:', error);
        res.status(500).send(error.message);
    } finally {
        if (pool) {
            try {
                await pool.close();
            } catch (error) {
                console.error('Error al cerrar la conexión a la base de datos:', error.message);
            }
        }
    }
};


export const topPermissionEmployee = async (req, res) => {
    let pool;
    try {
        pool = await getConnection();
        const respuesta = await pool
            .request()
            .input('Matricula', sql.Int, req.params.Id) //Se usa el valor de la matricula
            .query(`SELECT TOP 10 Permission.*, TypeExit.*, LoginUniPass.* 
                FROM Permission 
                INNER JOIN Authorize ON Permission.IdPermission = Authorize.IdPermission 
                JOIN TypeExit ON Permission.IdTipoSalida = TypeExit.IdTypeExit 
                JOIN LoginUniPass ON Permission.IdUser = LoginUniPass.IdLogin 
                WHERE Authorize.IdEmpleado = @Matricula 
                ORDER BY Permission.FechaSolicitada DESC`);
        if (respuesta.rowsAffected[0] === 0) {
            return res.status(404).json({ message: "Dato no encontrado" });
        }
        return res.json(respuesta.recordset);
    } catch (error) {
        console.error('Error en el servidor:', error);
        res.status(500).send(error.message);
    } finally {
        if (pool) {
            try {
                await pool.close();
            } catch (error) {
                console.error('Error al cerrar la conexion a la base de datos:', error.message);
            }
        }
    }
}

export const topPermissionPrece = async (req, res) => {
    let pool;
    try {
        pool = await getConnection();
        const respuesta = await pool.request()
            .input('Matricula', sql.Int, req.params.Id) //Se usa el valor de la matricula
            .query(`SELECT TOP 10 *
            FROM (
            SELECT Permission.*, TypeExit.*, LoginUniPass.* FROM Permission 
            INNER JOIN Authorize ON Permission.IdPermission = Authorize.IdPermission 
            JOIN TypeExit ON Permission.IdTipoSalida = TypeExit.IdTypeExit 
            JOIN LoginUniPass ON Permission.IdUser = LoginUniPass.IdLogin 
            WHERE Authorize.IdEmpleado = @Matricula 
            AND Permission.IdPermission IN (
                SELECT A1.IdPermission 
                FROM Authorize A1 
                GROUP BY A1.IdPermission 
                HAVING COUNT(A1.IdAuthorize) = 1
            )

            UNION

            SELECT Permission.*, TypeExit.*, LoginUniPass.* FROM Permission 
            INNER JOIN Authorize ON Permission.IdPermission = Authorize.IdPermission 
            JOIN TypeExit ON Permission.IdTipoSalida = TypeExit.IdTypeExit 
            JOIN LoginUniPass ON Permission.IdUser = LoginUniPass.IdLogin 
            WHERE Authorize.IdEmpleado = @Matricula  
            AND Permission.IdPermission IN (
                SELECT A1.IdPermission 
                FROM Authorize A1 
                WHERE A1.StatusAuthorize = 'Aprobada' 
                AND A1.IdAuthorize = (
                SELECT TOP 1 A2.IdAuthorize 
            FROM Authorize A2 
            WHERE A2.IdPermission = A1.IdPermission 
            ORDER BY A2.IdAuthorize
                )
            )
            ) AS CombinedResults
            ORDER BY FechaSolicitada DESC;`);
        if (respuesta.rowsAffected[0] === 0) {
            return res.status(404).json({ message: "Dato no encontrado" });
        }
        return res.json(respuesta.recordset);
    } catch (error) {
        console.error('Error en el servidor:', error);
        res.status(500).send(error.message);
    } finally {
        if (pool) {
            try {
                await pool.close();
            } catch (error) {
                console.error('Error al cerrar la conexion a la base de datos:', error.message);
            }
        }
    }
}

export const DashboardPermission = async (req, res) => {
    let pool;
    try {
        pool = await getConnection();
        const respuesta = await pool.request()
            .input('Matricula', sql.Int, req.params.IdPreceptor)
            .query(`
                WITH PermisosFiltrados AS (
                    -- Primera parte: Permisos con solo una autorización
                    SELECT P.*, T.*, L.*
                    FROM Permission P
                    INNER JOIN Authorize A ON P.IdPermission = A.IdPermission
                    JOIN TypeExit T ON P.IdTipoSalida = T.IdTypeExit
                    JOIN LoginUniPass L ON P.IdUser = L.IdLogin
                    WHERE A.IdEmpleado = @Matricula
                    AND P.IdPermission IN (
                        SELECT A1.IdPermission
                        FROM Authorize A1
                        GROUP BY A1.IdPermission
                        HAVING COUNT(A1.IdAuthorize) = 1
                    )

                    UNION

                    -- Segunda parte: Permisos donde la primera autorización fue Aprobada
                    SELECT P.*, T.*, L.*
                    FROM Permission P
                    INNER JOIN Authorize A ON P.IdPermission = A.IdPermission
                    JOIN TypeExit T ON P.IdTipoSalida = T.IdTypeExit
                    JOIN LoginUniPass L ON P.IdUser = L.IdLogin
                    WHERE A.IdEmpleado = @Matricula
                    AND P.IdPermission IN (
                        SELECT A1.IdPermission
                        FROM Authorize A1
                        WHERE A1.StatusAuthorize = 'Aprobada'
                        AND A1.IdAuthorize = (
                            SELECT TOP 1 A2.IdAuthorize
                            FROM Authorize A2
                            WHERE A2.IdPermission = A1.IdPermission
                            ORDER BY A2.IdAuthorize
                        )
                    )
                ),
                Conteo AS (
                    SELECT StatusPermission, COUNT(*) AS Cantidad
                    FROM PermisosFiltrados
                    GROUP BY StatusPermission

                    UNION ALL

                    SELECT 'TOTAL', COUNT(*) FROM PermisosFiltrados
                )

                SELECT 
                    ISNULL([Aprobada], 0) AS Aprobadas,
                    ISNULL([Rechazada], 0) AS Rechazadas,
                    ISNULL([Pendiente], 0) AS Pendientes,
                    ISNULL([TOTAL], 0) AS Total
                FROM Conteo
                PIVOT (
                    SUM(Cantidad)
                    FOR StatusPermission IN ([Aprobada], [Rechazada], [Pendiente], [TOTAL])
                ) AS ConteoPivot;
            `);

        const resultados = respuesta.recordset;

        if (!resultados || resultados.length === 0) {
            return res.status(404).json({ message: "Dato no encontrado" });
        }

        return res.json(resultados);
    } catch (error) {
        console.error('Error en el servidor:', error);
        return res.status(500).send(error.message);
    } finally {
        if (pool) {
            try {
                await pool.close();
            } catch (error) {
                console.error('Error al cerrar la conexión a la base de datos:', error.message);
            }
        }
    }
};

export const DashboardDocumentos = async (req, res) => {
    let pool;
    try {
        pool = await getConnection();
        const respuesta = await pool.request()
            .input('Matricula', sql.Int, req.params.IdPreceptor)
            .query(`SELECT
  COUNT(*) AS Total,
  SUM(CASE WHEN d.StatusRevision = 'Aprobado' THEN 1 ELSE 0 END) AS Aprobado,
  SUM(CASE WHEN d.StatusRevision = 'Pendiente' THEN 1 ELSE 0 END) AS Pendiente
FROM Doctos d
JOIN LoginUniPass a ON d.IdLogin = a.IdLogin
WHERE a.TipoUser = 'ALUMNO'
  AND a.Dormitorio = (
    SELECT Dormitorio
    FROM LoginUniPass
    WHERE Matricula = @Matricula AND TipoUser = 'PRECEPTOR'
  );
            `);

        const resultados = respuesta.recordset;

        if (!resultados || resultados.length === 0) {
            return res.status(404).json({ message: "Dato no encontrado" });
        }

        return res.json(resultados);
    } catch (error) {
        console.error('Error en el servidor:', error);
        return res.status(500).send(error.message);
    } finally {
        if (pool) {
            try {
                await pool.close();
            } catch (error) {
                console.error('Error al cerrar la conexión a la base de datos:', error.message);
            }
        }
    }
};

export const filtrarPermisos = async (req, res) => {
    const { fechaInicio, fechaFin, status, nombre, matricula } = req.query;
    const idEmpleado = parseInt(req.params.IdPreceptor); // se asume que el ID del preceptor llega por params

    let pool;
    try {
        pool = await getConnection();
        const result = await pool.request()
            .input('FechaInicio', sql.Date, fechaInicio || null)
            .input('FechaFin', sql.Date, fechaFin || null)
            .input('Status', sql.VarChar(20), status || null)
            .input('Nombre', sql.VarChar(100), nombre || null)
            .input('Matricula', sql.VarChar(20), matricula || null)
            .input('IdEmpleado', sql.Int, idEmpleado)
            .query(`
                WITH PermisosFiltrados AS (
                    SELECT P.*, T.*, L.*
                    FROM Permission P
                    INNER JOIN Authorize A ON P.IdPermission = A.IdPermission
                    JOIN TypeExit T ON P.IdTipoSalida = T.IdTypeExit
                    JOIN LoginUniPass L ON P.IdUser = L.IdLogin
                    WHERE A.IdEmpleado = @IdEmpleado
                    AND P.IdPermission IN (
                        SELECT A1.IdPermission
                        FROM Authorize A1
                        GROUP BY A1.IdPermission
                        HAVING COUNT(A1.IdAuthorize) = 1
                    )

                    UNION

                    SELECT P.*, T.*, L.*
                    FROM Permission P
                    INNER JOIN Authorize A ON P.IdPermission = A.IdPermission
                    JOIN TypeExit T ON P.IdTipoSalida = T.IdTypeExit
                    JOIN LoginUniPass L ON P.IdUser = L.IdLogin
                    WHERE A.IdEmpleado = @IdEmpleado
                    AND P.IdPermission IN (
                        SELECT A1.IdPermission
                        FROM Authorize A1
                        WHERE A1.StatusAuthorize = 'Aprobada'
                        AND A1.IdAuthorize = (
                            SELECT TOP 1 A2.IdAuthorize
                            FROM Authorize A2
                            WHERE A2.IdPermission = A1.IdPermission
                            ORDER BY A2.IdAuthorize
                        )
                    )
                )

                SELECT *
                FROM PermisosFiltrados
                WHERE 
                    (@FechaInicio IS NULL OR FechaSalida >= @FechaInicio AND FechaSalida < DATEADD(DAY, 1, @FechaInicio)) AND
                    (@FechaFin IS NULL OR FechaRegreso >= @FechaFin AND FechaRegreso < DATEADD(DAY, 1, @FechaFin)) AND
                    (@Status IS NULL OR StatusPermission = @Status) AND
                    (@Nombre IS NULL OR Nombre LIKE '%' + @Nombre + '%') AND
                    (@Matricula IS NULL OR Matricula LIKE '%' + @Matricula + '%');
            `);

        if (!result.recordset || result.recordset.length === 0) {
            return res.status(404).json({ message: 'No se encontraron permisos con los filtros aplicados.' });
        }

        return res.json(result.recordset);

    } catch (error) {
        console.error('Error al filtrar permisos:', error);
        res.status(500).send(error.message);
    } finally {
        if (pool) {
            try {
                await pool.close();
            } catch (err) {
                console.error('Error al cerrar la conexión:', err.message);
            }
        }
    }
};
