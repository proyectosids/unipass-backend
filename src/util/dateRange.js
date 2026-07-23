// Parseo/validacion de rango de fechas para endpoints de reportes admin.
// desde/hasta en 'YYYY-MM-DD'; si ambos faltan -> semana actual (lunes 00:00 -> hoy).
// Devuelve { desde: Date, hastaEx: Date } con hastaEx EXCLUSIVO (hasta es inclusivo).
// Lanza RangoInvalidoError si el formato es invalido, falta uno de los dos, o desde > hasta.

export class RangoInvalidoError extends Error {}

// 'YYYY-MM-DD' -> Date local a las 00:00, o null si es invalida.
const parseFecha = (s) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s))) return null;
    const d = new Date(`${s}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
};

export const parseRangoFechas = ({ desde, hasta }) => {
    if (desde === undefined && hasta === undefined) {
        const hoy = new Date();
        const offsetLunes = (hoy.getDay() + 6) % 7; // 0 = lunes
        const dDesde = new Date(hoy);
        dDesde.setDate(hoy.getDate() - offsetLunes);
        dDesde.setHours(0, 0, 0, 0);
        const hastaEx = new Date(hoy);
        hastaEx.setDate(hoy.getDate() + 1);
        hastaEx.setHours(0, 0, 0, 0);
        return { desde: dDesde, hastaEx };
    }

    const dDesde = parseFecha(desde);
    const dHasta = parseFecha(hasta);
    if (!dDesde || !dHasta || dHasta < dDesde) {
        throw new RangoInvalidoError();
    }
    const hastaEx = new Date(dHasta);
    hastaEx.setDate(hastaEx.getDate() + 1); // hasta inclusivo
    return { desde: dDesde, hastaEx };
};
