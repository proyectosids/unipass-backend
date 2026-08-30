import { getConnection } from "../database/connection.js";
import { hashData, VerifyHashData } from '../util/hashData.js';
import sql from 'mssql';

// Allowlist server-side de TipoUser que un ADMIN puede crear por este endpoint.
// NO incluye 'ADMINISTRATIVO' a proposito: crear una cuenta ADMINISTRATIVO otorga la
// capability ADMIN (requireCapability deriva ADMINISTRATIVO -> ADMIN), asi que ese alta
// NO debe ser self-serve por API ni siquiera para un ADMIN (aprovisionar por BD/DBA).
// 'DEPARTAMENTO' esta retirado. Cambiar esta lista es una decision de dominio.
const TIPOS_PERMITIDOS = new Set(['ALUMNO', 'EMPLEADO', 'PRECEPTOR', 'VIGILANCIA']);

export const newUser = async (req, res) => {
  let pool;

  try {
    // Nota: la ruta ya exige verifyToken + requireCapability(['ADMIN']); aqui solo se
    // valida el TipoUser contra la allowlist (no se confia en el body para el tipo).
    const tipo = req.body.TipoUser;

    // El modelo de checker dedicado (TipoUser='DEPARTAMENTO') fue retirado.
    if (tipo === 'DEPARTAMENTO') {
      return res.status(400).json({
        message: 'El rol DEPARTAMENTO fue retirado. Asigna la capability de checker con POST /checkerGrant.',
        code: 'DEPARTAMENTO_RETIRED'
      });
    }

    // Allowlist: cualquier TipoUser fuera de la lista (incluido ADMINISTRATIVO) se rechaza.
    if (!TIPOS_PERMITIDOS.has(tipo)) {
      return res.status(403).json({
        message: `TipoUser no permitido para creacion de cuenta: ${tipo ?? '(vacío)'}`,
        code: 'TIPOUSER_NOT_ALLOWED'
      });
    }

    // Encripta la contraseña antes de enviarla a la base de datos
    const hashedPassword = await hashData(req.body.Contraseña);

    pool = await getConnection();
    
    // Verificar si el usuario ya existe
    const checkUser = await pool.request()
      .input('Matricula', sql.VarChar, req.body.Matricula)
      .query('SELECT * FROM UNIPASS.LoginUniPass WHERE Matricula = @Matricula');
    
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
        INSERT INTO UNIPASS.LoginUniPass (Matricula, Contraseña, Correo, Nombre, Apellidos, TipoUser, Sexo, FechaNacimiento, Celular, StatusActividad, Dormitorio)
        VALUES (@Matricula, @Contraseña, @Correo, @Nombre, @Apellidos, @TipoUser, @Sexo, @FechaNacimiento, @Celular, @StatusActividad, @Dormitorio);
        SELECT SCOPE_IDENTITY() AS IdLogin
      `);

    if (respuesta.recordset.length > 0) {
      const insertedUser = respuesta.recordset[0];
      // Respuesta saneada: NO se devuelve el hash de contraseña (ni TokenCFM/tokens).
      res.status(201).json({
        IdLogin: insertedUser.IdLogin,
        Matricula: req.body.Matricula,
        Correo: req.body.Correo,
        Nombre: req.body.Nombre,
        Apellidos: req.body.Apellidos,
        TipoUser: tipo,
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
