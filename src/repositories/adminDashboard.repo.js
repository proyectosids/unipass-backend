import sql from 'mssql';
import { withConnection } from '../database/connection.js';

// Dashboard del Coordinador de dormitorios. Todos los conteos se calculan en SQL
// (COUNT/GROUP BY); no se traen filas de detalle al cliente.
// Alcance de tipos: ESPECIAL(2) y A CASA(3) — el ambito del coordinador — salvo
// "alumnos fuera", que es estado fisico actual y considera TODOS los tipos de salida.

export const getAdminDashboardData = ({ idCoordinador, desde, hastaExclusivo }) =>
    withConnection(async (pool) => {
        const base = () => pool.request()
            .input('IdCoordinador', sql.Int, idCoordinador)
            .input('Desde', sql.DateTime, desde)
            .input('HastaEx', sql.DateTime, hastaExclusivo);

        // Pendientes de la bandeja del coordinador: tipo 2/3, StatusPermission
        // 'Pendiente', misma ventana -30/+15 dias que /permissionsEmployee.
        const pendientes = await base().query(`
            SELECT L.Dormitorio AS IdDormitorio, B.Nombre, COUNT(DISTINCT P.IdPermission) AS Total
            FROM Permission P
            INNER JOIN Authorize A ON A.IdPermission = P.IdPermission
            INNER JOIN LoginUniPass L ON L.IdLogin = P.IdUser
            LEFT JOIN Bedroom B ON B.IdBedroom = L.Dormitorio
            WHERE A.IdEmpleado = @IdCoordinador
              AND P.IdTipoSalida IN (2, 3)
              AND P.StatusPermission = 'Pendiente'
              AND P.FechaSalida BETWEEN DATEADD(DAY, -30, GETDATE()) AND DATEADD(DAY, 15, GETDATE())
            GROUP BY L.Dormitorio, B.Nombre
            ORDER BY L.Dormitorio`);

        // Alumnos fisicamente fuera: salida de Caseta confirmada (paso 2) y sin
        // retorno de Caseta confirmado (paso 3). Cuenta alumnos distintos.
        const fuera = await base().query(`
            SELECT L.Dormitorio AS IdDormitorio, B.Nombre, COUNT(DISTINCT L.IdLogin) AS Total
            FROM Permission P
            INNER JOIN LoginUniPass L ON L.IdLogin = P.IdUser
            LEFT JOIN Bedroom B ON B.IdBedroom = L.Dormitorio
            WHERE L.TipoUser = 'ALUMNO'
              AND EXISTS (
                  SELECT 1 FROM CheckPoints CS
                  JOIN Point PS ON PS.IdPoint = CS.IdPoint
                  WHERE CS.IdPermission = P.IdPermission
                    AND CS.Accion = 'SALIDA' AND CS.Estatus = 'Confirmada'
                    AND PS.NombrePunto = 'Caseta')
              AND NOT EXISTS (
                  SELECT 1 FROM CheckPoints CR
                  JOIN Point PR ON PR.IdPoint = CR.IdPoint
                  WHERE CR.IdPermission = P.IdPermission
                    AND CR.Accion = 'RETORNO' AND CR.Estatus = 'Confirmada'
                    AND PR.NombrePunto = 'Caseta')
            GROUP BY L.Dormitorio, B.Nombre
            ORDER BY L.Dormitorio`);

        // Ultimos 10 permisos valorados (Aprobada/Rechazada) del periodo, tipo 2/3.
        // Fecha = FechaAprobacion del ultimo eslabon; si no hay, FechaSolicitada.
        const actividad = await base().query(`
            SELECT TOP 10 P.IdPermission,
                   LTRIM(RTRIM(CONCAT(L.Nombre, ' ', L.Apellidos))) AS Alumno,
                   P.IdTipoSalida, P.StatusPermission,
                   COALESCE(MAX(A.FechaAprobacion), P.FechaSolicitada) AS Fecha
            FROM Permission P
            INNER JOIN LoginUniPass L ON L.IdLogin = P.IdUser
            LEFT JOIN Authorize A ON A.IdPermission = P.IdPermission AND A.FechaAprobacion IS NOT NULL
            WHERE P.StatusPermission IN ('Aprobada', 'Rechazada')
              AND P.IdTipoSalida IN (2, 3)
              AND P.FechaSolicitada >= @Desde AND P.FechaSolicitada < @HastaEx
            GROUP BY P.IdPermission, L.Nombre, L.Apellidos, P.IdTipoSalida, P.StatusPermission, P.FechaSolicitada
            ORDER BY Fecha DESC`);

        // Totales del periodo por dormitorio (solicitudes tipo 2/3 y su resolucion).
        const totales = await base().query(`
            SELECT L.Dormitorio AS IdDormitorio, B.Nombre,
                   COUNT(*) AS Solicitudes,
                   SUM(CASE WHEN P.StatusPermission = 'Aprobada' THEN 1 ELSE 0 END) AS Aprobadas,
                   SUM(CASE WHEN P.StatusPermission = 'Rechazada' THEN 1 ELSE 0 END) AS Rechazadas
            FROM Permission P
            INNER JOIN LoginUniPass L ON L.IdLogin = P.IdUser
            LEFT JOIN Bedroom B ON B.IdBedroom = L.Dormitorio
            WHERE P.IdTipoSalida IN (2, 3)
              AND P.FechaSolicitada >= @Desde AND P.FechaSolicitada < @HastaEx
            GROUP BY L.Dormitorio, B.Nombre
            ORDER BY L.Dormitorio`);

        return {
            pendientes: pendientes.recordset,
            fuera: fuera.recordset,
            actividad: actividad.recordset,
            totales: totales.recordset
        };
    });
