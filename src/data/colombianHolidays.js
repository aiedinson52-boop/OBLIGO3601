/**
 * Festivos Colombianos 2026-2050
 * Incluye festivos fijos y móviles según la Ley Emiliani (Ley 51 de 1983)
 * Zona horaria: America/Bogota (UTC-5)
 */

// Festivos fijos que NO se trasladan
const FESTIVOS_FIJOS = [
    { mes: 1, dia: 1, nombre: 'Año Nuevo' },
    { mes: 5, dia: 1, nombre: 'Día del Trabajo' },
    { mes: 7, dia: 20, nombre: 'Día de la Independencia' },
    { mes: 8, dia: 7, nombre: 'Batalla de Boyacá' },
    { mes: 12, dia: 8, nombre: 'Inmaculada Concepción' },
    { mes: 12, dia: 25, nombre: 'Navidad' }
];

// Festivos fijos que SE TRASLADAN al lunes (Ley Emiliani)
const FESTIVOS_EMILIANI = [
    { mes: 1, dia: 6, nombre: 'Día de los Reyes Magos' },
    { mes: 3, dia: 19, nombre: 'Día de San José' },
    { mes: 6, dia: 29, nombre: 'San Pedro y San Pablo' },
    { mes: 8, dia: 15, nombre: 'Asunción de la Virgen' },
    { mes: 10, dia: 12, nombre: 'Día de la Raza' },
    { mes: 11, dia: 1, nombre: 'Día de Todos los Santos' },
    { mes: 11, dia: 11, nombre: 'Independencia de Cartagena' }
];

/**
 * Calcula la fecha del Domingo de Pascua usando el algoritmo de Computus
 * @param {number} year - Año para calcular
 * @returns {Date} Fecha del Domingo de Pascua
 */
function calcularPascua(year) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;

    return new Date(year, month - 1, day);
}

/**
 * Traslada una fecha al siguiente lunes si no cae en lunes (Ley Emiliani)
 * @param {Date} fecha - Fecha original
 * @returns {Date} Fecha trasladada al lunes
 */
function trasladarAlLunes(fecha) {
    const diaSemana = fecha.getDay();
    if (diaSemana === 1) return new Date(fecha); // Ya es lunes

    const diasHastaLunes = diaSemana === 0 ? 1 : 8 - diaSemana;
    const nuevaFecha = new Date(fecha);
    nuevaFecha.setDate(nuevaFecha.getDate() + diasHastaLunes);
    return nuevaFecha;
}

/**
 * Agrega días a una fecha
 * @param {Date} fecha - Fecha base
 * @param {number} dias - Días a agregar
 * @returns {Date} Nueva fecha
 */
function agregarDias(fecha, dias) {
    const nueva = new Date(fecha);
    nueva.setDate(nueva.getDate() + dias);
    return nueva;
}

/**
 * Calcula los festivos móviles basados en Pascua
 * @param {number} year - Año para calcular
 * @returns {Array} Array de festivos móviles
 */
function calcularFestivosMoviles(year) {
    const pascua = calcularPascua(year);
    const festivos = [];

    // Jueves Santo (3 días antes de Pascua)
    const juevesSanto = agregarDias(pascua, -3);
    festivos.push({
        fecha: juevesSanto,
        nombre: 'Jueves Santo'
    });

    // Viernes Santo (2 días antes de Pascua)
    const viernesSanto = agregarDias(pascua, -2);
    festivos.push({
        fecha: viernesSanto,
        nombre: 'Viernes Santo'
    });

    // Ascensión del Señor (39 días después de Pascua, trasladado al lunes)
    const ascension = trasladarAlLunes(agregarDias(pascua, 39));
    festivos.push({
        fecha: ascension,
        nombre: 'Ascensión del Señor'
    });

    // Corpus Christi (60 días después de Pascua, trasladado al lunes)
    const corpusChristi = trasladarAlLunes(agregarDias(pascua, 60));
    festivos.push({
        fecha: corpusChristi,
        nombre: 'Corpus Christi'
    });

    // Sagrado Corazón de Jesús (68 días después de Pascua, trasladado al lunes)
    const sagradoCorazon = trasladarAlLunes(agregarDias(pascua, 68));
    festivos.push({
        fecha: sagradoCorazon,
        nombre: 'Sagrado Corazón de Jesús'
    });

    return festivos;
}

/**
 * Genera todos los festivos para un año específico
 * @param {number} year - Año para generar festivos
 * @returns {Array} Array de objetos festivo con fecha y nombre
 */
export function generarFestivosAnuales(year) {
    const festivos = [];

    // Agregar festivos fijos
    FESTIVOS_FIJOS.forEach(festivo => {
        festivos.push({
            fecha: new Date(year, festivo.mes - 1, festivo.dia),
            nombre: festivo.nombre,
            tipo: 'fijo'
        });
    });

    // Agregar festivos Emiliani (trasladados al lunes)
    FESTIVOS_EMILIANI.forEach(festivo => {
        const fechaOriginal = new Date(year, festivo.mes - 1, festivo.dia);
        const fechaTrasladada = trasladarAlLunes(fechaOriginal);
        festivos.push({
            fecha: fechaTrasladada,
            nombre: festivo.nombre,
            tipo: 'emiliani'
        });
    });

    // Agregar festivos móviles (basados en Pascua)
    const moviles = calcularFestivosMoviles(year);
    moviles.forEach(festivo => {
        festivos.push({
            fecha: festivo.fecha,
            nombre: festivo.nombre,
            tipo: 'movil'
        });
    });

    // Ordenar por fecha
    festivos.sort((a, b) => a.fecha - b.fecha);

    return festivos;
}

/**
 * Verifica si una fecha es festivo
 * @param {Date} fecha - Fecha a verificar
 * @param {Array} festivos - Array de festivos del año
 * @returns {Object|null} Objeto festivo si es festivo, null si no
 */
export function esFestivo(fecha, festivos) {
    return festivos.find(f =>
        f.fecha.getFullYear() === fecha.getFullYear() &&
        f.fecha.getMonth() === fecha.getMonth() &&
        f.fecha.getDate() === fecha.getDate()
    ) || null;
}

/**
 * Cache de festivos por año para mejor rendimiento
 */
const cacheFestivos = new Map();

/**
 * Obtiene los festivos de un año (usa cache)
 * @param {number} year - Año
 * @returns {Array} Festivos del año
 */
export function obtenerFestivos(year) {
    if (!cacheFestivos.has(year)) {
        cacheFestivos.set(year, generarFestivosAnuales(year));
    }
    return cacheFestivos.get(year);
}

/**
 * Nombres de los meses en español
 */
export const MESES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

/**
 * Nombres de los días de la semana en español (abreviados)
 */
export const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/**
 * Nombres completos de los días de la semana
 */
export const DIAS_SEMANA_COMPLETO = [
    'Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'
];

/**
 * Formatea una fecha en formato colombiano
 * @param {Date} fecha - Fecha a formatear
 * @param {Object} opciones - Opciones de formato
 * @returns {string} Fecha formateada
 */
export function formatearFecha(fecha, opciones = {}) {
    const {
        incluirDia = false,
        incluirHora = false,
        formato = 'largo'
    } = opciones;

    const dia = fecha.getDate();
    const mes = MESES[fecha.getMonth()];
    const year = fecha.getFullYear();
    const diaSemana = DIAS_SEMANA_COMPLETO[fecha.getDay()];

    let resultado = '';

    if (incluirDia) {
        resultado += `${diaSemana}, `;
    }

    if (formato === 'largo') {
        resultado += `${dia} de ${mes} de ${year}`;
    } else {
        resultado += `${dia}/${fecha.getMonth() + 1}/${year}`;
    }

    if (incluirHora) {
        const horas = fecha.getHours();
        const minutos = fecha.getMinutes().toString().padStart(2, '0');
        const periodo = horas >= 12 ? 'p.m.' : 'a.m.';
        const hora12 = horas % 12 || 12;
        resultado += ` a las ${hora12}:${minutos} ${periodo}`;
    }

    return resultado;
}

/**
 * Genera un rango de años desde 2026 hasta 2050
 * @returns {Array<number>} Array de años
 */
export function generarRangoAnios() {
    const anios = [];
    for (let year = 2026; year <= 2050; year++) {
        anios.push(year);
    }
    return anios;
}
