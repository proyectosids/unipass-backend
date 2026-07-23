import { findConfigValue } from '../repositories/config.repo.js';
import { findCoordinadorActivo } from '../repositories/user.repo.js';
import {
    getAdminDashboardData,
    findReporteSalidas,
    findObservacionesChecadores
} from '../repositories/adminDashboard.repo.js';
import { parseRangoFechas, RangoInvalidoError } from '../util/dateRange.js';

// Controlador del panel del Coordinador de dormitorios (conteos agregados + reportes).

const enteroPositivoONull = (valor) => {
    const n = Number(valor);
    return Number.isInteger(n) && n > 0 ? n : null;
};

const nombreDormitorio = (r) => r.Nombre ?? `Dormitorio ${r.IdDormitorio}`;

const toISO = (f) => (f instanceof Date ? f.toISOString() : f);

// GET /admin/dashboard?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
// Periodo default: semana actual (lunes 00:00 -> hoy inclusive). El periodo aplica a
// actividadReciente y totalesPorDormitorio (por FechaSolicitada); pendientes usa la
// misma ventana que la bandeja (-30/+15 dias) y alumnosFuera es estado actual.
// El coordinador se resuelve con el mismo hibrido que /autorizadorSalida:
// override en Configuracion o ADMINISTRATIVO activo de Coordinacion.
export const getAdminDashboard = async (req, res) => {
    try {
        let dDesde, dHastaEx;
        try {
            ({ desde: dDesde, hastaEx: dHastaEx } = parseRangoFechas(req.query));
        } catch (e) {
            if (e instanceof RangoInvalidoError) {
                return res.status(400).json({ message: 'Rango invalido: desde y hasta van juntos en formato YYYY-MM-DD, con desde <= hasta' });
            }
            throw e;
        }

        // Coordinador: override en Configuracion o resolucion por rol (hibrido).
        let idCoordinador = enteroPositivoONull(await findConfigValue('COORDINADOR_IDEMPLEADO'));
        if (idCoordinador == null) {
            const coord = await findCoordinadorActivo();
            idCoordinador = enteroPositivoONull(coord?.IdEmpleado);
        }
        if (idCoordinador == null) {
            return res.status(400).json({ message: 'Coordinador de dormitorios no configurado ni resoluble' });
        }

        const data = await getAdminDashboardData({ idCoordinador, desde: dDesde, hastaExclusivo: dHastaEx });

        const porDormitorio = data.pendientes.map((r) => ({
            idDormitorio: r.IdDormitorio,
            nombre: nombreDormitorio(r),
            total: r.Total
        }));

        return res.json({
            pendientes: {
                total: porDormitorio.reduce((suma, d) => suma + d.total, 0),
                porDormitorio
            },
            alumnosFuera: data.fuera.map((r) => ({
                idDormitorio: r.IdDormitorio,
                nombre: nombreDormitorio(r),
                total: r.Total
            })),
            actividadReciente: data.actividad.map((r) => ({
                idPermiso: r.IdPermission,
                alumno: r.Alumno,
                tipo: r.IdTipoSalida,
                status: r.StatusPermission,
                fecha: r.Fecha instanceof Date ? r.Fecha.toISOString() : r.Fecha
            })),
            totalesPorDormitorio: data.totales.map((r) => ({
                idDormitorio: r.IdDormitorio,
                nombre: nombreDormitorio(r),
                solicitudes: r.Solicitudes,
                aprobadas: r.Aprobadas,
                rechazadas: r.Rechazadas
            }))
        });
    } catch (error) {
        console.error('Error generando dashboard admin:', error);
        return res.status(500).json({ message: 'Error generando dashboard' });
    }
};

const MENSAJE_RANGO = 'Rango invalido: desde y hasta en formato YYYY-MM-DD, desde <= hasta';

// GET /admin/reporte?desde=&hasta=  -> salidas valoradas (Aprobada/Rechazada) tipo 2/3
// con FechaSalida en el rango (hasta inclusivo). Sin params -> semana actual. [] si vacio.
export const getReporteSalidas = async (req, res) => {
    try {
        let rango;
        try {
            rango = parseRangoFechas(req.query);
        } catch (e) {
            if (e instanceof RangoInvalidoError) return res.status(400).json({ message: MENSAJE_RANGO });
            throw e;
        }

        const filas = await findReporteSalidas(rango);
        return res.json(filas.map((r) => ({
            idPermiso: r.IdPermission,
            alumno: r.Alumno,
            matricula: r.Matricula,
            dormitorio: r.Dormitorio,
            tipo: r.IdTipoSalida,
            fechaSalida: toISO(r.FechaSalida),
            fechaRegreso: toISO(r.FechaRegreso),
            autorizadoPor: r.AutorizadoPor,
            status: r.StatusPermission
        })));
    } catch (error) {
        console.error('Error generando reporte de salidas:', error);
        return res.status(500).json({ message: 'Error generando reporte' });
    }
};

// GET /admin/observaciones?desde=&hasta=  -> observaciones no vacias de checadores
// (una por check) con FechaCheck en el rango (hasta inclusivo). [] si vacio.
export const getObservacionesChecadores = async (req, res) => {
    try {
        let rango;
        try {
            rango = parseRangoFechas(req.query);
        } catch (e) {
            if (e instanceof RangoInvalidoError) return res.status(400).json({ message: MENSAJE_RANGO });
            throw e;
        }

        const filas = await findObservacionesChecadores(rango);
        return res.json(filas.map((r) => ({
            idCheck: r.IdCheck,
            idPermiso: r.IdPermission,
            alumno: r.Alumno,
            dormitorio: r.Dormitorio,
            paso: r.Paso,
            checador: r.Checador,
            fecha: toISO(r.FechaCheck),
            observacion: r.Observaciones
        })));
    } catch (error) {
        console.error('Error generando observaciones:', error);
        return res.status(500).json({ message: 'Error generando observaciones' });
    }
};
