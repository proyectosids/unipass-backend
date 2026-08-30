import sql from 'mssql';
import { withConnection } from '../database/connection.js';

// Persistencia de AuditLog. Nunca recibe/guarda secretos (eso lo garantiza el servicio).
export const insertAuditLog = (e) =>
    withConnection(async (pool) => {
        await pool.request()
            .input('ActorIdLogin', sql.Int, e.actorIdLogin ?? null)
            .input('ActorMatricula', sql.VarChar(15), e.actorMatricula ?? null)
            .input('Capability', sql.NVarChar(20), e.capability ?? null)
            .input('Permission', sql.NVarChar(40), e.permission ?? null)
            .input('Accion', sql.NVarChar(60), e.accion)
            .input('Recurso', sql.NVarChar(40), e.recurso ?? null)
            .input('RecursoId', sql.NVarChar(40), e.recursoId != null ? String(e.recursoId) : null)
            .input('Resultado', sql.NVarChar(12), e.resultado)
            .input('DatosAntes', sql.NVarChar(sql.MAX), e.datosAntes ?? null)
            .input('DatosDespues', sql.NVarChar(sql.MAX), e.datosDespues ?? null)
            .input('Ip', sql.VarChar(45), e.ip ?? null)
            .input('Endpoint', sql.NVarChar(120), e.endpoint ?? null)
            .input('Metodo', sql.VarChar(10), e.metodo ?? null)
            .input('Contexto', sql.NVarChar(300), e.contexto ?? null)
            .query(`INSERT INTO UNIPASS.AuditLog
                    (ActorIdLogin, ActorMatricula, Capability, Permission, Accion, Recurso, RecursoId,
                     Resultado, DatosAntes, DatosDespues, Ip, Endpoint, Metodo, Contexto)
                    VALUES
                    (@ActorIdLogin, @ActorMatricula, @Capability, @Permission, @Accion, @Recurso, @RecursoId,
                     @Resultado, @DatosAntes, @DatosDespues, @Ip, @Endpoint, @Metodo, @Contexto)`);
    });
