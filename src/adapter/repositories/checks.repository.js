import { getConnection } from "../../infrastructure/database/connection.js";
import sql from "mssql";
import * as queries from "../../queries/checks.queries.js";

export class ChecksRepository {
    async createChecksPermission({ Accion, IdPoint, IdPermission }) {
        const pool = await getConnection();
        const result = await pool
            .request()
            .input("StatusCheck", sql.VarChar, "Pendiente")
            .input("Accion", sql.VarChar, Accion)
            .input("IdPoint", sql.Int, IdPoint)
            .input("IdPermission", sql.Int, IdPermission)
            .query(queries.createChecksPermissionQuery);
        await pool.close();
        return result.recordset[0];
    }

    async getChecksDormitorio(dormitorioId) {
        const pool = await getConnection();
        const result = await pool
            .request()
            .input("Dormitorio", sql.Int, dormitorioId)
            .query(queries.getChecksDormitorioQuery);
        await pool.close();
        return result.recordset;
    }

    async getChecksDormitorioFinal(dormitorioId) {
        const pool = await getConnection();
        const result = await pool
            .request()
            .input("Dormitorio", sql.Int, dormitorioId)
            .query(queries.getChecksDormitorioFinalQuery);
        await pool.close();
        return result.recordset;
    }

    async getChecksVigilancia() {
        const pool = await getConnection();
        try {
            const result = await pool
                .request()
                .input("StatusPermission", sql.VarChar, "Aprobada")
                .input("PuntoName", sql.VarChar, "Caseta")
                .input("CheckEstado", sql.VarChar, "Pendiente")
                .query(queries.getChecksVigilanciaQuery);
            return result.recordset;
        } finally {
            await pool.close();
        }
    }

    async getChecksVigilanciaRegreso() {
        const pool = await getConnection();
        try {
            const result = await pool
                .request()
                .input("StatusPermission", sql.VarChar, "Aprobada")
                .input("PuntoName", sql.VarChar, "Caseta")
                .input("CheckEstado", sql.VarChar, "Pendiente")
                .query(queries.getChecksVigilanciaRegresoQuery);
            return result.recordset;
        } finally {
            await pool.close();
        }
    }

    async putCheckPoint(idCheck, FechaCheck, Estatus, Observaciones) {
        const pool = await getConnection();
        try {
            const result = await pool
                .request()
                .input("IdCheck", sql.Int, idCheck)
                .input("FechaCheck", sql.DateTime, FechaCheck)
                .input("Estatus", sql.VarChar, Estatus)
                .input("Observaciones", sql.VarChar, Observaciones)
                .query(queries.putCheckPointQuery);
            return result.rowsAffected[0] > 0;
        } finally {
            await pool.close();
        }
    }
}