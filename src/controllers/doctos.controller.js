import { getConnection } from "../database/connection.js";
import sql from 'mssql';
import { deleteUploadedFile } from "../util/fileStorage.js";


export const getProfile = async (req, res) => {
    let pool;
    try {
        pool = await getConnection();
        const result = await pool
            .request()
            .input('id', sql.Int, req.params.id)
            .input('IdDocumento', sql.Int, req.query.IdDocumento) // Cambio de body a query
            .query('SELECT Archivo FROM Doctos WHERE IdLogin = @id AND IdDocumento = @IdDocumento');
        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ message: "Archivo no encontrado" });
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

export const getDocumentsByUser = async (req, res) => {
    let pool;
    try {
        pool = await getConnection();
        const result = await pool.request()
            .input('Id', sql.Int, req.params.Id)
            .query('SELECT * FROM Doctos WHERE IdLogin = @Id');
        if (result.recordset.length === 0) {
            return res.status(404).json({ message: "No se encontraron archivos para el usuario" });
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

export const saveDocument = async (req, res) => {
    let pool;
    let filePath = null;
    let insertOk = false;
    try {
        if (!req.file) {
            return res.status(400).json({ message: "Archivo no cargado" });
        }
        filePath = '/uploads/' + req.file.filename;

        pool = await getConnection();
        const result = await pool.request()
            .input('IdDocumento', sql.Int, req.body.IdDocumento)
            .input('Archivo', sql.VarChar, filePath)
            .input('StatusDoctos', sql.VarChar, 'Adjunto')
            .input('IdLogin', sql.Int, req.body.IdLogin)
            .query('INSERT INTO Doctos (IdDocumento, Archivo, StatusDoctos, IdLogin) VALUES (@IdDocumento, @Archivo, @StatusDoctos, @IdLogin); SELECT SCOPE_IDENTITY() AS IdDoctos');
        if (result.recordset.length === 0) {
            return res.status(404).json({ message: "No se puede guardar el archivo" });
        }
        insertOk = true;
        return res.json({
            Id: result.recordset[0].IdDoctos,
            IdDocumento: req.body.IdDocumento,
            Archivo: filePath,
            StatusDoctos: 'Adjunto',
            IdLogin: req.body.IdLogin
        });
    } catch (error) {
        console.error('Error en el servidor:', error);
        return res.status(500).json({ message: 'Error en el proceso de carga' });
    } finally {
        // Rollback: si el INSERT no termino bien y ya habia archivo subido, borrarlo.
        if (!insertOk && filePath) {
            await deleteUploadedFile(filePath);
        }
        if (pool) {
            try {
                await pool.close();
            } catch (closeError) {
                console.error('Error al cerrar la conexión a la base de datos:', closeError);
            }
        }
    }
};

export const uploadProfile = async (req, res) => {
    let pool;
    let newFilePath = null;
    let updateOk = false;
    let oldFilePath = null;
    try {
        if (!req.file) {
            return res.status(400).json({ message: "Archivo no cargado" });
        }
        newFilePath = '/uploads/' + req.file.filename;

        pool = await getConnection();

        // 1) Obtener path anterior para poder borrarlo despues
        const oldResult = await pool.request()
            .input('IdDocumento', sql.Int, req.body.IdDocumento)
            .input('IdLogin', sql.Int, req.body.IdLogin)
            .query('SELECT Archivo FROM Doctos WHERE IdLogin = @IdLogin AND IdDocumento = @IdDocumento');

        if (oldResult.recordset.length > 0) {
            oldFilePath = oldResult.recordset[0].Archivo;
        }

        // 2) Actualizar BD con el nuevo path
        const result = await pool.request()
            .input('IdDocumento', sql.Int, req.body.IdDocumento)
            .input('Archivo', sql.VarChar, newFilePath)
            .input('IdLogin', sql.Int, req.body.IdLogin)
            .query('UPDATE Doctos SET Archivo = @Archivo WHERE IdDocumento = @IdDocumento AND IdLogin = @IdLogin;');

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ message: "No se puede actualizar el archivo" });
        }
        updateOk = true;

        const updatedRecord = await pool.request()
            .input('IdDocumento', sql.Int, req.body.IdDocumento)
            .input('IdLogin', sql.Int, req.body.IdLogin)
            .query('SELECT Archivo FROM Doctos WHERE IdLogin = @IdLogin AND IdDocumento = @IdDocumento');

        res.json(updatedRecord.recordset[0]);

        // 3) Borrar el archivo viejo (si existia y es distinto al nuevo)
        if (oldFilePath && oldFilePath !== newFilePath) {
            await deleteUploadedFile(oldFilePath);
        }
    } catch (error) {
        console.error('Error en el servidor:', error);
        if (!res.headersSent) {
            return res.status(500).json({ message: 'Error en el proceso de carga' });
        }
    } finally {
        // Rollback: si el UPDATE no se concreto pero ya subimos el archivo nuevo, borrarlo.
        if (!updateOk && newFilePath) {
            await deleteUploadedFile(newFilePath);
        }
        if (pool) {
            try {
                await pool.close();
            } catch (closeError) {
                console.error('Error al cerrar la conexión a la base de datos:', closeError);
            }
        }
    }
};

export const deleteFileDoc = async (req, res) => {
    let pool;
    try {
        pool = await getConnection();

        // 1) Obtener path del archivo (si existe el registro)
        const fileResult = await pool.request()
            .input("Id", sql.Int, req.params.Id)
            .input("IdDocumento", sql.Int, req.body.IdDocumento)
            .query("SELECT Archivo FROM Doctos WHERE IdLogin = @Id AND IdDocumento = @IdDocumento");

        if (fileResult.recordset.length === 0) {
            return res.status(404).json({ message: "Dato no encontrado" });
        }
        const archivoPath = fileResult.recordset[0].Archivo;

        // 2) Borrar el registro PRIMERO (la BD es la fuente de verdad).
        //    Si esto falla, no tocamos el disco.
        const deleteResult = await pool.request()
            .input("Id", sql.Int, req.params.Id)
            .input("IdDocumento", sql.Int, req.body.IdDocumento)
            .query("DELETE FROM Doctos WHERE IdLogin = @Id AND IdDocumento = @IdDocumento");

        if (deleteResult.rowsAffected[0] === 0) {
            return res.status(404).json({ message: "Dato no encontrado" });
        }

        res.status(200).json({ message: "DATO ELIMINADO" });

        // 3) Borrar el archivo despues. Si falla, queda huerfano (lo barre cleanOrphans),
        //    pero el registro ya se fue, que es lo que el cliente espera.
        if (archivoPath) {
            await deleteUploadedFile(archivoPath);
        }
    } catch (error) {
        console.error('Error en el servidor:', error);
        if (!res.headersSent) {
            return res.status(500).json({ message: 'Error en el proceso de eliminación' });
        }
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

export const getExpedientesAlumnos = async (req, res) => {
    let pool;
    try {
        pool = await getConnection();
        const result = await pool.request()
        .input('IdDormitorio', sql.Int, req.params.IdDormi)
        .query(`
            SELECT DISTINCT 
    L.Matricula, 
    L.Nombre, 
    L.Apellidos
FROM Doctos D
INNER JOIN DocumentCatalog DC 
    ON DC.IdDocument = D.IdDocumento
INNER JOIN LoginUniPass L 
    ON L.IdLogin    = D.IdLogin
WHERE 
    L.TipoUser = 'ALUMNO'
    AND (
        -- si es 5, dormitorio entre 1 y 4
        (@IdDormitorio = 5 AND L.Dormitorio BETWEEN 1 AND 4)
        OR
        -- si no es 5, dormitorio igual al parámetro
        (@IdDormitorio <> 5 AND L.Dormitorio = @IdDormitorio)
    );

            `)
        if (result.recordset.length === 0) {
            return res.status(404).json({ message: "No se encontraron experientes"})
        }
        return res.json(result.recordset);
    } catch (error){
        console.error('Error en el servidor:', error);
        res.status(580).send(error.message);
    } finally {
        if (pool) {
            try {
                await pool.close();
            } catch (closeError) {
                console.error('Error al cerrar la conexion a la base datos:', closeError);
            }
        }
    }
}

export const getArchivosAlumno = async (req, res) => {
    console.log(req.params);
    let pool;
    try {
        const { Dormitorio, Nombre, Apellidos, Matricula } = req.params;

        if (!Dormitorio) {
            return res.status(400).json({ message: "El parámetro Dormitorio es obligatorio" });
        }

        pool = await getConnection();
        const request = pool.request()
            .input('Dormitorio', sql.Int, Dormitorio)
            .input('Nombre', sql.VarChar, Nombre || null)
            .input('Apellidos', sql.VarChar, Apellidos || null)
            .input('Matricula', sql.VarChar, Matricula || null);

        const result = await request.query(`
            SELECT Doctos.*, DocumentCatalog.*
            FROM Doctos
            INNER JOIN DocumentCatalog ON DocumentCatalog.IdDocument = Doctos.IdDocumento
            INNER JOIN LoginUniPass ON LoginUniPass.IdLogin = Doctos.IdLogin
            WHERE DocumentCatalog.Estado = 'Activo'
            AND (
                -- ADMINISTRATIVO: buscar por matrícula
                (@Dormitorio = 5 AND LoginUniPass.Matricula = @Matricula)

                -- PRECEPTOR: buscar por nombre y apellidos
                OR (@Dormitorio <> 5 AND 
                    LoginUniPass.Dormitorio = @Dormitorio AND
                    (@Nombre IS NULL OR LoginUniPass.Nombre = @Nombre) AND
                    (@Apellidos IS NULL OR LoginUniPass.Apellidos = @Apellidos)
                )
            );
        `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ message: "No se encontraron expedientes para el alumno especificado" });
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


export const aprobarDocumento = async (req, res) => {
    let pool;
    try {
        const { IdDocumento } = req.body;
        const { Id } = req.params;

        pool = await getConnection();
        const result = await pool.request()
            .input("Id", sql.Int, Id)
            .input("IdDocumento", sql.Int, IdDocumento)
            .query("UPDATE Doctos SET StatusRevision = 'Aprobado' WHERE IdLogin = @Id AND IdDocumento = @IdDocumento");

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ message: "Documento no encontrado" });
        }

        return res.status(200).json({ message: "Documento aprobado correctamente" });
    } catch (error) {
        console.error('Error actualizando estado de revisión:', error);
        return res.status(500).json({ message: 'Error en el servidor' });
    } finally {
        if (pool) {
            try {
                await pool.close();
            } catch (closeError) {
                console.error('Error al cerrar conexión a la base de datos:', closeError);
            }
        }
    }
};
