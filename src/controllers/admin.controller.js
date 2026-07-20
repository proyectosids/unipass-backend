import { findConfigValue } from '../repositories/config.repo.js';
import { findCoordinadorActivo } from '../repositories/user.repo.js';
import { getAdminDashboardData } from '../repositories/adminDashboard.repo.js';

// Controlador del panel del Coordinador de dormitorios (conteos agregados).

const enteroPositivoONull = (valor) => {
    const n = Number(valor);
    return Number.isInteger(n) && n > 0 ? n : null;
};

// 'YYYY-MM-DD' -> Date local a las 00:00, o null si es invalida.
const parseFecha = (s) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s))) return null;
    const d = new Date(`${s}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
};

const nombreDormitorio = (r) => r.Nombre ?? `Dormitorio ${r.IdDormitorio}`;

// GET /admin/dashboard?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
// Periodo default: semana actual (lunes 00:00 -> hoy inclusive). El periodo aplica a
// actividadReciente y totalesPorDormitorio (por FechaSolicitada); pendientes usa la
// misma ventana que la bandeja (-30/+15 dias) y alumnosFuera es estado actual.
// El coordinador se resuelve con el mismo hibrido que /autorizadorSalida:
// override en Configuracion o ADMINISTRATIVO activo de Coordinacion.
export const getAdminDashboard = async (req, res) => {
    try {
        const { desde, hasta } = req.query;

        let dDesde, dHastaEx;
        if (desde !== undefined || hasta !== undefined) {
            const dHasta = parseFecha(hasta);
            dDesde = parseFecha(desde);
            if (!dDesde || !dHasta || dHasta < dDesde) {
                return res.status(400).json({ message: 'Rango invalido: desde y hasta van juntos en formato YYYY-MM-DD, con desde <= hasta' });
            }
            dHastaEx = new Date(dHasta);
            dHastaEx.setDate(dHastaEx.getDate() + 1); // hasta inclusive
        } else {
            const hoy = new Date();
            const offsetLunes = (hoy.getDay() + 6) % 7; // 0 = lunes
            dDesde = new Date(hoy);
            dDesde.setDate(hoy.getDate() - offsetLunes);
            dDesde.setHours(0, 0, 0, 0);
            dHastaEx = new Date(hoy);
            dHastaEx.setDate(hoy.getDate() + 1);
            dHastaEx.setHours(0, 0, 0, 0);
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
