// Parseo/validacion de rango de fechas para endpoints de reportes admin.
// desde/hasta en 'YYYY-MM-DD'; si ambos faltan -> semana actual (lunes -> hoy).
//
// Devuelve { desde, hastaEx } como cadenas 'YYYY-MM-DD', con hastaEx EXCLUSIVO
// (= dia siguiente al 'hasta', de modo que 'hasta' es INCLUSIVO). La comparacion en
// SQL debe hacerse por FECHA DE CALENDARIO:
//     CAST(col AS DATE) >= @Desde AND CAST(col AS DATE) < @HastaEx
// Esto evita el bug de zona horaria: los params JS Date se enviaban en UTC y las
// fechas se guardan con shift de -6h, corriendo la ventana ~6h y excluyendo la
// madrugada del dia; comparar por dia de calendario incluye el dia completo.
//
// Lanza RangoInvalidoError si el formato es invalido, falta uno de los dos, o desde > hasta.

export class RangoInvalidoError extends Error {}

const RE_YMD = /^\d{4}-\d{2}-\d{2}$/;

// Valida 'YYYY-MM-DD' real (rechaza 2026-13-40); devuelve la cadena o null.
const toYmdOrNull = (s) => {
    if (!RE_YMD.test(String(s))) return null;
    const [y, m, d] = String(s).split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
    return String(s);
};

// Suma dias a un 'YYYY-MM-DD' (calendario puro) -> 'YYYY-MM-DD'.
const addDays = (ymd, n) => {
    const [y, m, d] = ymd.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + n);
    return dt.toISOString().slice(0, 10);
};

// 'YYYY-MM-DD' del dia local (segun reloj del proceso).
const ymdLocal = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

export const parseRangoFechas = ({ desde, hasta } = {}) => {
    if (desde === undefined && hasta === undefined) {
        const hoy = new Date();
        const offsetLunes = (hoy.getDay() + 6) % 7; // 0 = lunes
        const lunes = new Date(hoy);
        lunes.setDate(hoy.getDate() - offsetLunes);
        return { desde: ymdLocal(lunes), hastaEx: addDays(ymdLocal(hoy), 1) }; // hoy inclusive
    }

    const dDesde = toYmdOrNull(desde);
    const dHasta = toYmdOrNull(hasta);
    if (!dDesde || !dHasta || dHasta < dDesde) { // comparacion lexicografica = cronologica en ISO
        throw new RangoInvalidoError();
    }
    return { desde: dDesde, hastaEx: addDays(dHasta, 1) }; // hasta inclusive
};
