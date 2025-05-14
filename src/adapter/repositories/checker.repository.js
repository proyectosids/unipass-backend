import { getConnection } from "../../infrastructure/database/connection.js";
import sql from "mssql";
import * as queries from "../../queries/checker.queries.js";

export class CheckerRepository {
    async buscarCheckers(correoEmpleado) {
      const pool = await getConnection();
      const result = await pool
        .request()
        .input("CorreoCheck", sql.VarChar, correoEmpleado)
        .input("User", sql.VarChar, "DEPARTAMENTO")
        .input("Activo", sql.Int, 1)
        .query(queries.buscarCheckersQuery);
      return result.recordset;
    }
  
    async cambiarActividad(idLogin, status, matricula) {
      const pool = await getConnection();
      const result = await pool
        .request()
        .input("IdLogin", sql.Int, idLogin)
        .input("Actividad", sql.Int, status)
        .input("Credencial", sql.VarChar, matricula)
        .query(queries.cambiarActividadQuery);
      return result.rowsAffected[0] > 0;
    }
  
    async eliminarChecker(idLogin) {
      const pool = await getConnection();
      const result = await pool
        .request()
        .input("IdLogin", sql.Int, idLogin)
        .query(queries.eliminarCheckerQuery);
      return result.rowsAffected[0] > 0;
    }
  }
  

