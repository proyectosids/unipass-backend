import { getConnection } from "../../infrastructure/database/connection.js";
import sql from "mssql";
import User from "../../domain/models/user.js";
import * as queries from "../../queries/auth.queries.js";

export class AuthRepository {
    async getUserByMatriculaOrCorreo(matricula, correo) {
        const pool = await getConnection();
        let result;

        if (matricula) {
            result = await pool.request()
                .input('Matricula', sql.VarChar, matricula)
                .query(queries.getUserByMatriculaQuery);
        } else if (correo) {
            result = await pool.request()
                .input('Correo', sql.VarChar, correo)
                .query(queries.getUserByCorreoQuery);
        } else {
            return null;
        }

        return result.recordset.length === 0 
            ? null 
            : User.fromRecord(result.recordset[0]);
    }

    async updatePassword(correo, hashedPassword) {
        const pool = await getConnection();
        const result = await pool.request()
            .input("Correo", sql.VarChar, correo)
            .input("Password", sql.VarChar, hashedPassword)
            .input("TipoUser", sql.VarChar, "DEPARTAMENTO")
            .query(queries.updatePasswordQuery);

        return result.rowsAffected[0] > 0;
    }
}