/**
 * Modelo de Tarea
 * Zona horaria: America/Bogota (UTC-5)
 */

/**
 * Prioridades disponibles
 */
export const PRIORIDADES = {
    ALTA: 'alta',
    MEDIA: 'media',
    BAJA: 'baja'
};

/**
 * Contextos disponibles
 */
export const CONTEXTOS = {
    TRABAJO: 'trabajo',
    PERSONAL: 'personal',
    FAMILIAR: 'familiar'
};

/**
 * Estados de tarea
 */
export const ESTADOS = {
    PENDIENTE: 'Pendiente',
    CUMPLIDA: 'Cumplida'
};

/**
 * Crea una nueva tarea con valores por defecto
 * @param {Object} datos - Datos de la tarea
 * @returns {Object} Objeto tarea completo
 */
export function crearTarea(datos) {
    const ahora = new Date();

    // Preservar la fecha como string YYYY-MM-DD para evitar desplazamiento UTC
    let fechaStr;
    if (datos.fecha instanceof Date) {
        const y = datos.fecha.getFullYear();
        const m = String(datos.fecha.getMonth() + 1).padStart(2, '0');
        const d = String(datos.fecha.getDate()).padStart(2, '0');
        fechaStr = `${y}-${m}-${d}`;
    } else {
        fechaStr = datos.fecha; // Ya es string YYYY-MM-DD
    }

    const horaStr = datos.hora || '09:00';

    // Calcular las 3 alertas obligatorias
    const alertas = calcularAlertas(fechaStr, horaStr);

    return {
        id: datos.id || generarId(),
        titulo: datos.titulo || '',
        descripcion: datos.descripcion || '',
        fecha: fechaStr,
        hora: horaStr,
        contexto: datos.contexto || CONTEXTOS.PERSONAL,
        prioridad: datos.prioridad || PRIORIDADES.MEDIA,
        estado: ESTADOS.PENDIENTE,
        alertas: alertas,
        creadaEn: ahora.toISOString(),
        actualizadaEn: ahora.toISOString()
    };
}

/**
 * Genera un ID único para la tarea
 * @returns {string} ID único
 */
function generarId() {
    return `tarea_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Calcula las 3 alertas obligatorias para una tarea
 * - Alerta 1: 8 días antes
 * - Alerta 2: 3 días antes
 * - Alerta 3: 3 horas antes de la hora de la tarea
 * @param {Date} fecha - Fecha de la tarea
 * @param {string} hora - Hora de la tarea (HH:MM)
 * @returns {Array} Array de objetos alerta
 */
export function calcularAlertas(fecha, hora) {
    const [horas, minutos] = (hora || '09:00').split(':').map(Number);
    // Parsear fecha + hora como fecha local (no UTC)
    const fechaHoraTarea = new Date(fecha + 'T' + (hora || '09:00') + ':00');
    fechaHoraTarea.setHours(horas, minutos, 0, 0);

    const alertas = [];

    // Alerta 1: 8 días antes a las 9:00 AM
    const alerta8Dias = new Date(fechaHoraTarea);
    alerta8Dias.setDate(alerta8Dias.getDate() - 8);
    alerta8Dias.setHours(9, 0, 0, 0);
    alertas.push({
        id: 'alerta_8_dias',
        tipo: '8_dias',
        fechaHora: alerta8Dias.toISOString(),
        mensaje: 'Recordatorio: Faltan 8 días para esta tarea',
        disparada: false
    });

    // Alerta 2: 3 días antes a las 9:00 AM
    const alerta3Dias = new Date(fechaHoraTarea);
    alerta3Dias.setDate(alerta3Dias.getDate() - 3);
    alerta3Dias.setHours(9, 0, 0, 0);
    alertas.push({
        id: 'alerta_3_dias',
        tipo: '3_dias',
        fechaHora: alerta3Dias.toISOString(),
        mensaje: 'Recordatorio: Faltan 3 días para esta tarea',
        disparada: false
    });

    // Alerta 3: 3 horas antes de la hora programada
    const alerta3Horas = new Date(fechaHoraTarea);
    alerta3Horas.setHours(alerta3Horas.getHours() - 3);
    alertas.push({
        id: 'alerta_3_horas',
        tipo: '3_horas',
        fechaHora: alerta3Horas.toISOString(),
        mensaje: 'Recordatorio urgente: La tarea es en 3 horas',
        disparada: false
    });

    return alertas;
}

/**
 * Valida que una tarea tenga los campos requeridos
 * @param {Object} tarea - Tarea a validar
 * @returns {Object} Objeto con isValid y errores
 */
export function validarTarea(tarea) {
    const errores = [];

    if (!tarea.titulo || tarea.titulo.trim() === '') {
        errores.push('El título de la tarea es obligatorio');
    }

    if (!tarea.fecha) {
        errores.push('La fecha de la tarea es obligatoria');
    } else {
        const fechaTarea = new Date(tarea.fecha);
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);

        if (fechaTarea < hoy) {
            errores.push('La fecha de la tarea no puede ser en el pasado');
        }
    }

    if (!tarea.hora || !/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(tarea.hora)) {
        errores.push('La hora debe tener formato válido (HH:MM)');
    }

    if (!Object.values(PRIORIDADES).includes(tarea.prioridad)) {
        errores.push('La prioridad debe ser: alta, media o baja');
    }

    if (!Object.values(CONTEXTOS).includes(tarea.contexto)) {
        errores.push('El contexto debe ser: trabajo, personal o familiar');
    }

    return {
        isValid: errores.length === 0,
        errores
    };
}

/**
 * Actualiza el estado de una tarea
 * @param {Object} tarea - Tarea a actualizar
 * @param {string} nuevoEstado - Nuevo estado
 * @returns {Object} Tarea actualizada
 */
export function actualizarEstado(tarea, nuevoEstado) {
    if (!Object.values(ESTADOS).includes(nuevoEstado)) {
        throw new Error('Estado inválido. Use: Pendiente o Cumplida');
    }

    return {
        ...tarea,
        estado: nuevoEstado,
        actualizadaEn: new Date().toISOString()
    };
}

/**
 * Formatea la hora en formato 12 horas con AM/PM
 * @param {string} hora24 - Hora en formato 24h (HH:MM)
 * @returns {string} Hora formateada en 12h
 */
export function formatearHora12(hora24) {
    const [horas, minutos] = hora24.split(':').map(Number);
    const periodo = horas >= 12 ? 'p.m.' : 'a.m.';
    const hora12 = horas % 12 || 12;
    return `${hora12}:${minutos.toString().padStart(2, '0')} ${periodo}`;
}

/**
 * Obtiene el color de la prioridad
 * @param {string} prioridad - Prioridad de la tarea
 * @returns {string} Clase CSS correspondiente
 */
export function getClasePrioridad(prioridad) {
    return `priority-${prioridad}`;
}

/**
 * Obtiene el color del contexto
 * @param {string} contexto - Contexto de la tarea
 * @returns {string} Clase CSS correspondiente
 */
export function getClaseContexto(contexto) {
    return `context-${contexto}`;
}

/**
 * Etiquetas en español para prioridades
 */
export const ETIQUETAS_PRIORIDAD = {
    [PRIORIDADES.ALTA]: 'Alta',
    [PRIORIDADES.MEDIA]: 'Media',
    [PRIORIDADES.BAJA]: 'Baja'
};

/**
 * Etiquetas en español para contextos
 */
export const ETIQUETAS_CONTEXTO = {
    [CONTEXTOS.TRABAJO]: 'Trabajo',
    [CONTEXTOS.PERSONAL]: 'Personal',
    [CONTEXTOS.FAMILIAR]: 'Familiar'
};

/**
 * Iconos para contextos
 */
export const ICONOS_CONTEXTO = {
    [CONTEXTOS.TRABAJO]: '💼',
    [CONTEXTOS.PERSONAL]: '👤',
    [CONTEXTOS.FAMILIAR]: '👨‍👩‍👧‍👦'
};

/**
 * Iconos para prioridades
 */
export const ICONOS_PRIORIDAD = {
    [PRIORIDADES.ALTA]: '🔴',
    [PRIORIDADES.MEDIA]: '🟡',
    [PRIORIDADES.BAJA]: '🟢'
};
