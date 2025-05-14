import { getConnection } from "../../infrastructure/database/connection.js";
import sql from "mssql";
import * as queries from "../../queries/permission.queries.js";

export class PermissionRepository {
    async getPermissionsByUser(id, page, limit) {
        const offset = (page - 1) * limit;
        const pool = await getConnection();

        const data = await pool.request()
            .input("Id", sql.Int, id)
            .input("Limit", sql.Int, parseInt(limit))
            .input("Offset", sql.Int, parseInt(offset))
            .query(queries.getPermissionsByUserQuery);

        const total = await pool.request()
            .input("Id", sql.Int, id)
            .query(queries.countPermissionsByUserQuery);

        await pool.close();

        return {
            data: data.recordset,
            total: total.recordset[0].TotalPermissions
        };
    }

    async getPermissionForAutorizacionPrece(id) {
        const pool = await getConnection();
        const result = await pool.request()
            .input("Id", sql.Int, id)
            .query(queries.getPermissionForAutorizacionPreceQuery);
        await pool.close();
        return result.recordset;
    }

    async getPermissionForAutorizacion(id) {
        const pool = await getConnection();
        const result = await pool.request()
            .input("Id", sql.Int, id)
            .query(queries.getPermissionForAutorizacionQuery);
        await pool.close();
        return result.recordset;
    }

    async createPermission(data) {
        const pool = await getConnection();

        const userCheck = await pool.request()
            .input("IdUser", sql.Int, data.IdUser)
            .query(queries.checkUserExistsQuery);

        if (userCheck.recordset.length === 0) {
            await pool.close();
            return null;
        }

        const fechaSolicitada = new Date(data.FechaSolicitada);
        fechaSolicitada.setHours(fechaSolicitada.getHours() - 6);
        const fechaSalida = new Date(data.FechaSalida);
        fechaSalida.setHours(fechaSalida.getHours() - 6);
        const fechaRegreso = new Date(data.FechaRegreso);
        fechaRegreso.setHours(fechaRegreso.getHours() - 6);

        const result = await pool.request()
            .input("FechaSolicitada", sql.DateTime, fechaSolicitada.toISOString())
            .input("StatusPermission", sql.VarChar, data.StatusPermission)
            .input("FechaSalida", sql.DateTime, fechaSalida.toISOString())
            .input("FechaRegreso", sql.DateTime, fechaRegreso.toISOString())
            .input("Motivo", sql.VarChar, data.Motivo)
            .input("IdUser", sql.Int, data.IdUser)
            .input("IdTipoSalida", sql.Int, data.IdTipoSalida)
            .input("Observaciones", sql.VarChar, "Ninguna")
            .query(queries.createPermissionQuery);

        await pool.close();

        return {
            Id: result.recordset[0].IdPermission,
            FechaSolicitada: fechaSolicitada.toISOString(),
            FechaSalida: fechaSalida.toISOString(),
            FechaRegreso: fechaRegreso.toISOString(),
            ...data
        };
    }
    
    async deletePermission(id) {
        const pool = await getConnection();
        const result = await pool.request()
            .input("Id", sql.Int, id)
            .query(queries.deletePermissionQuery);
        await pool.close();
        return result.rowsAffected[0] > 0;
    }

    async cancelPermission(id) {
        const pool = await getConnection();
        const result = await pool.request()
            .input("Id", sql.Int, id)
            .input("StatusPermission", sql.VarChar, "Cancelado")
            .query(queries.cancelPermissionQuery);
        await pool.close();
        return result.rowsAffected[0] > 0;
    }

    async autorizarPermiso(id, status, observaciones) {
        const pool = await getConnection();
        const result = await pool.request()
            .input("IdPermiso", sql.Int, id)
            .input("StatusPermission", sql.VarChar, status)
            .input("Observaciones", sql.VarChar, observaciones)
            .query(queries.autorizarPermisoQuery);
        await pool.close();
        return result.rowsAffected[0] > 0;
    }
    
    async topPermissionStudent(idLogin) {
        const pool = await getConnection();
        const result = await pool.request()
            .input("IdLogin", sql.Int, idLogin)
            .query(queries.topPermissionStudentQuery);
        await pool.close();
        return result.recordset;
    }
    
    async topPermissionEmployee(matricula) {
        const pool = await getConnection();
        const result = await pool.request()
            .input("Matricula", sql.Int, matricula)
            .query(queries.topPermissionEmployeeQuery);
        await pool.close();
        return result.recordset;
    }

    async topPermissionPrece(matricula) {
        const pool = await getConnection();
        const result = await pool.request()
            .input("Matricula", sql.Int, matricula)
            .query(queries.topPermissionPreceQuery);
        await pool.close();
        return result.recordset;
    }

    async dashboardPermission(matricula) {
        const pool = await getConnection();
        const result = await pool.request()
            .input("Matricula", sql.Int, matricula)
            .query(queries.dashboardPermissionQuery);
        await pool.close();
        return result.recordset;
    }
    
    async dashboardDocumentos(matricula) {
        const pool = await getConnection();
        const result = await pool.request()
            .input("Matricula", sql.Int, matricula)
            .query(queries.dashboardDocumentosQuery);
        await pool.close();
        return result.recordset;
    }

    async filtrarPermisos({ idEmpleado, fechaInicio, fechaFin, status, nombre, matricula }) {
        const pool = await getConnection();
        const result = await pool.request()
            .input("FechaInicio", sql.Date, fechaInicio || null)
            .input("FechaFin", sql.Date, fechaFin || null)
            .input("Status", sql.VarChar(20), status || null)
            .input("Nombre", sql.VarChar(100), nombre || null)
            .input("Matricula", sql.VarChar(20), matricula || null)
            .input("IdEmpleado", sql.Int, idEmpleado)
            .query(queries.filtrarPermisosQuery);
        await pool.close();
        return result.recordset;
    }
    
}
