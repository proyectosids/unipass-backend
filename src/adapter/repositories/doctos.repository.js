import { getConnection } from "../../infrastructure/database/connection.js";
import sql from "mssql";
import * as queries from "../../queries/doctos.queries.js";

export class DoctosRepository {
    async getProfile(idLogin, idDocumento) {
        const pool = await getConnection();
        const result = await pool.request()
            .input("id", sql.Int, idLogin)
            .input("IdDocumento", sql.Int, idDocumento)
            .query(queries.getProfileQuery);
        await pool.close();
        return result.recordset[0];
    }

    async getDocumentsByUser(idLogin) {
        const pool = await getConnection();
        const result = await pool.request()
            .input("Id", sql.Int, idLogin)
            .query(queries.getDocumentsByUserQuery);
        await pool.close();
        return result.recordset;
    }

    async saveDocument({ IdDocumento, Archivo, IdLogin }) {
        const pool = await getConnection();
        const result = await pool.request()
            .input("IdDocumento", sql.Int, IdDocumento)
            .input("Archivo", sql.VarChar, Archivo)
            .input("StatusDoctos", sql.VarChar, "Adjunto")
            .input("IdLogin", sql.Int, IdLogin)
            .query(queries.saveDocumentQuery);
        await pool.close();
        return result.recordset[0];
    }

    async uploadProfile({ IdDocumento, Archivo, IdLogin }) {
        const pool = await getConnection();
        const result = await pool.request()
            .input("Archivo", sql.VarChar, Archivo)
            .input("IdDocumento", sql.Int, IdDocumento)
            .input("IdLogin", sql.Int, IdLogin)
            .query(queries.uploadProfileQuery);

        if (result.rowsAffected[0] === 0) {
            await pool.close();
            return null;
        }

        const updated = await pool.request()
            .input("IdDocumento", sql.Int, IdDocumento)
            .input("IdLogin", sql.Int, IdLogin)
            .query(queries.getProfileQuery);

        await pool.close();
        return updated.recordset[0];
    }

    async deleteFileDoc(IdLogin, IdDocumento, deleteCallback) {
        const pool = await getConnection();

        const fileResult = await pool.request()
            .input("Id", sql.Int, IdLogin)
            .input("IdDocumento", sql.Int, IdDocumento)
            .query(queries.getFilePathQuery);

        if (fileResult.recordset.length === 0) {
            await pool.close();
            return false;
        }

        const Archivo = fileResult.recordset[0].Archivo;
        if (typeof Archivo === "string") {
            deleteCallback(Archivo);
        }

        const deleteResult = await pool.request()
            .input("Id", sql.Int, IdLogin)
            .input("IdDocumento", sql.Int, IdDocumento)
            .query(queries.deleteDocumentQuery);

        await pool.close();
        return deleteResult.rowsAffected[0] > 0;
    }

    async getExpedientesAlumnos(idDormitorio) {
        const pool = await getConnection();
        const result = await pool.request()
            .input("IdDormitorio", sql.Int, idDormitorio)
            .query(queries.getExpedientesAlumnosQuery);
        await pool.close();
        return result.recordset;
    }

    async getArchivosAlumno(dormitorio, nombre, apellidos) {
        const pool = await getConnection();
        const result = await pool.request()
            .input("Dormitorio", sql.Int, dormitorio)
            .input("Nombre", sql.VarChar, nombre)
            .input("Apellidos", sql.VarChar, apellidos)
            .query(queries.getArchivosAlumnoQuery);
        await pool.close();
        return result.recordset;
    }

    async aprobarDocumento(idLogin, idDocumento) {
        const pool = await getConnection();
        const result = await pool.request()
            .input("Id", sql.Int, idLogin)
            .input("IdDocumento", sql.Int, idDocumento)
            .query(queries.aprobarDocumentoQuery);
        await pool.close();
        return result.rowsAffected[0] > 0;
    }
}
