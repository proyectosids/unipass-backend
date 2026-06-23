import { getConnection } from "../database/connection.js";
import { hashData, VerifyHashData } from '../util/hashData.js';
import sql from 'mssql';

export const newUser = async (req, res) => {
  let pool;

  try {
    console.log('Solicitud recibida:', req.body);  // Depuración

    // El modelo de "checker como cuenta dedicada" (TipoUser='DEPARTAMENTO') fue
    // retirado. Un checker ahora es una capability (CheckerGrant) sobre una cuenta
    // real existente. Se rechaza la creacion de nuevas cuentas DEPARTAMENTO.
    if (req.body.TipoUser === 'DEPARTAMENTO') {
      return res.status(400).json({
        message: 'El rol DEPARTAMENTO fue retirado. Asigna la capability de checker con POST /checkerGrant.',
        code: 'DEPARTAMENTO_RETIRED'
      });
    }

    // Encripta la contraseña antes de enviarla a la base de datos
    const hashedPassword = await hashData(req.body.Contraseña);

    pool = await getConnection();
    
    // Verificar si el usuario ya existe
    const checkUser = await pool.request()
      .input('Matricula', sql.VarChar, req.body.Matricula)
      .query('SELECT * FROM LoginUniPass WHERE Matricula = @Matricula');
    
    if (checkUser.recordset.length > 0) {
      return res.status(400).json({ message: 'Usuario ya registrado' });
    }
    
    // Insertar nuevo usuario
    const respuesta = await pool.request()
      .input('Matricula', sql.VarChar, req.body.Matricula)
      .input('Contraseña', sql.VarChar, hashedPassword)
      .input('Correo', sql.VarChar, req.body.Correo)
      .input('Nombre', sql.VarChar, req.body.Nombre)
      .input('Apellidos', sql.VarChar, req.body.Apellidos)
      .input('TipoUser', sql.VarChar, req.body.TipoUser)
      .input('Sexo', sql.VarChar, req.body.Sexo)
      .input('FechaNacimiento', sql.DateTime, req.body.FechaNacimiento)
      .input('Celular', sql.VarChar, req.body.Celular)
      .input('StatusActividad', sql.Int, 1)
      .input('Dormitorio', sql.Int, req.body.Dormitorio)
      .query(`
        INSERT INTO LoginUniPass (Matricula, Contraseña, Correo, Nombre, Apellidos, TipoUser, Sexo, FechaNacimiento, Celular, StatusActividad, Dormitorio)
        VALUES (@Matricula, @Contraseña, @Correo, @Nombre, @Apellidos, @TipoUser, @Sexo, @FechaNacimiento, @Celular, @StatusActividad, @Dormitorio);
        SELECT SCOPE_IDENTITY() AS IdLogin
      `);

    if (respuesta.recordset.length > 0) {
      const insertedUser = respuesta.recordset[0];
      res.json({
        IdLogin: insertedUser.IdLogin,
        Matricula: req.body.Matricula,
        Contraseña: hashedPassword,
        Correo: req.body.Correo,
        Nombre: req.body.Nombre,
        Apellidos: req.body.Apellidos,
        TipoUser: req.body.TipoUser,
        Sexo: req.body.Sexo,
        FechaNacimiento: req.body.FechaNacimiento,
        Celular: req.body.Celular,
        StatusActividad: 1,
        Dormitorio: req.body.Dormitorio
      });
    } else {
      res.status(500).send('Error al insertar el usuario');
    }
  } catch (error) {
    console.error('Error en el servidor:', error);  // Depuración
    res.status(500).send(error.message);
  } finally {
    // Cierra la conexión a la base de datos
    if (pool) {
      try {
        await pool.close();
      } catch (closeError) {
        console.error('Error al cerrar la conexión a la base de datos:', closeError);
      }
    }
  }
};
