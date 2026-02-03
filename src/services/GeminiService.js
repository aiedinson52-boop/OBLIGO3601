/**
 * Servicio de integración con Gemini API
 * Procesa lenguaje natural para extracción de tareas
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

let genAI = null;
let model = null;

/**
 * Inicializa el servicio de Gemini
 * @param {string} apiKey - Clave de API de Gemini
 * @returns {boolean} true si se inicializó correctamente
 */
export function inicializarGemini(apiKey) {
    if (!apiKey) {
        console.warn('No se proporcionó clave de API de Gemini. Usando modo offline.');
        return false;
    }

    try {
        genAI = new GoogleGenerativeAI(apiKey);
        model = genAI.getGenerativeModel({ model: 'gemini-pro' });
        return true;
    } catch (error) {
        console.error('Error inicializando Gemini:', error);
        return false;
    }
}

/**
 * Verifica si Gemini está disponible
 * @returns {boolean} true si está disponible
 */
export function geminiDisponible() {
    return model !== null;
}

/**
 * Prompt del sistema para extracción de tareas
 */
const PROMPT_EXTRACCION = `Eres un asistente de extracción de información para un sistema de gestión de tareas en Colombia.

REGLAS CRÍTICAS:
1. TODA respuesta debe ser ÚNICAMENTE en español (Colombia).
2. La zona horaria es America/Bogota (UTC-5).
3. Hoy es {FECHA_HOY}.
4. NO inventes información que no esté en el texto.

Extrae la siguiente información del texto del usuario:
- titulo: El nombre o descripción de la tarea
- fecha: En formato YYYY-MM-DD
- hora: En formato HH:MM (24 horas)
- contexto: "trabajo", "personal" o "familiar"
- prioridad: "alta", "media" o "baja"
- ambiguo: true si hay información que necesita clarificación
- preguntaClarificacion: Si hay ambigüedad, pregunta en español qué necesitas saber

Responde SOLO con un objeto JSON válido, sin texto adicional.

Ejemplo de respuesta:
{
  "titulo": "Reunión con el equipo de marketing",
  "fecha": "2026-02-05",
  "hora": "14:30",
  "contexto": "trabajo",
  "prioridad": "alta",
  "ambiguo": false,
  "preguntaClarificacion": null
}`;

/**
 * Extrae información de tarea usando Gemini
 * @param {string} texto - Texto del usuario
 * @returns {Promise<Object>} Información extraída
 */
export async function extraerTareaConGemini(texto) {
    if (!geminiDisponible()) {
        // Modo offline: usar extracción básica
        return extraerTareaOffline(texto);
    }

    const hoy = new Date();
    const fechaHoy = `${hoy.getDate()} de ${obtenerNombreMes(hoy.getMonth())} de ${hoy.getFullYear()}`;

    const prompt = PROMPT_EXTRACCION.replace('{FECHA_HOY}', fechaHoy) +
        `\n\nTexto del usuario: "${texto}"`;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const responseText = response.text().trim();

        // Intentar parsear JSON
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return validarRespuestaGemini(parsed);
        }

        throw new Error('Respuesta no válida de Gemini');
    } catch (error) {
        console.error('Error con Gemini, usando modo offline:', error);
        return extraerTareaOffline(texto);
    }
}

/**
 * Valida y normaliza la respuesta de Gemini
 * @param {Object} respuesta - Respuesta parseada
 * @returns {Object} Respuesta validada
 */
function validarRespuestaGemini(respuesta) {
    const hoy = new Date();

    return {
        titulo: respuesta.titulo || '',
        fecha: respuesta.fecha || null,
        hora: respuesta.hora || null,
        contexto: ['trabajo', 'personal', 'familiar'].includes(respuesta.contexto)
            ? respuesta.contexto : null,
        prioridad: ['alta', 'media', 'baja'].includes(respuesta.prioridad)
            ? respuesta.prioridad : null,
        ambiguo: respuesta.ambiguo || false,
        preguntaClarificacion: respuesta.preguntaClarificacion || null,
        fuenteIA: true
    };
}

/**
 * Extracción de tareas sin conexión a Gemini
 * @param {string} texto - Texto del usuario
 * @returns {Object} Información extraída
 */
function extraerTareaOffline(texto) {
    const resultado = {
        titulo: '',
        fecha: null,
        hora: null,
        contexto: null,
        prioridad: null,
        ambiguo: false,
        preguntaClarificacion: null,
        fuenteIA: false
    };

    const textoLower = texto.toLowerCase();
    const hoy = new Date();

    // Extraer fecha
    if (/\bhoy\b/.test(textoLower)) {
        resultado.fecha = formatearFecha(hoy);
    } else if (/\bmañana\b/.test(textoLower)) {
        const manana = new Date(hoy);
        manana.setDate(manana.getDate() + 1);
        resultado.fecha = formatearFecha(manana);
    } else if (/\bpasado\s*mañana\b/.test(textoLower)) {
        const pasado = new Date(hoy);
        pasado.setDate(pasado.getDate() + 2);
        resultado.fecha = formatearFecha(pasado);
    } else {
        // Buscar día de la semana
        const diasSemana = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
        for (let i = 0; i < diasSemana.length; i++) {
            if (textoLower.includes(diasSemana[i])) {
                const diaActual = hoy.getDay();
                let diasHasta = i - diaActual;
                if (diasHasta <= 0) diasHasta += 7;

                const fecha = new Date(hoy);
                fecha.setDate(fecha.getDate() + diasHasta);
                resultado.fecha = formatearFecha(fecha);
                break;
            }
        }
    }

    // Extraer hora
    const horaMatch = textoLower.match(/a\s*las?\s*(\d{1,2})(?::(\d{2}))?\s*(de\s*la\s*)?(mañana|tarde|noche|am|pm)?/);
    if (horaMatch) {
        let hora = parseInt(horaMatch[1]);
        const minutos = horaMatch[2] ? parseInt(horaMatch[2]) : 0;
        const periodo = horaMatch[4];

        if (periodo) {
            if ((periodo.includes('tarde') || periodo === 'pm') && hora < 12) hora += 12;
            if ((periodo.includes('mañana') || periodo === 'am') && hora === 12) hora = 0;
        } else if (hora < 12 && !horaMatch[2]) {
            // Si no hay periodo y es hora típica de tarde (1-6), asumir PM
            if (hora >= 1 && hora <= 6) {
                hora += 12;
            }
        }

        resultado.hora = `${hora.toString().padStart(2, '0')}:${minutos.toString().padStart(2, '0')}`;
    }

    // Extraer contexto
    if (/\b(trabajo|oficina|laboral|reunión|junta|cliente)\b/.test(textoLower)) {
        resultado.contexto = 'trabajo';
    } else if (/\b(familia|familiar|hijos?|esposa?|padres?|casa)\b/.test(textoLower)) {
        resultado.contexto = 'familiar';
    } else if (/\b(personal|yo|mi|gym|médico|doctor)\b/.test(textoLower)) {
        resultado.contexto = 'personal';
    }

    // Extraer prioridad
    if (/\b(urgente|importante|prioritari|crítico)\b/.test(textoLower)) {
        resultado.prioridad = 'alta';
    } else if (/\b(baja|poco\s*urgente|cuando\s*pueda|opcional)\b/.test(textoLower)) {
        resultado.prioridad = 'baja';
    }

    // Extraer título (limpiar texto)
    let titulo = texto
        .replace(/a\s*las?\s*\d+[:\d]*\s*(de\s*la\s*)?(mañana|tarde|noche|am|pm)?/gi, '')
        .replace(/\bhoy\b/gi, '')
        .replace(/\bmañana\b/gi, '')
        .replace(/\bpasado\s*mañana\b/gi, '')
        .replace(/\b(lunes|martes|miércoles|jueves|viernes|sábado|domingo)\b/gi, '')
        .replace(/\b(urgente|importante|prioritario)\b/gi, '')
        .replace(/\b(el|para|de|del)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();

    if (titulo) {
        resultado.titulo = titulo.charAt(0).toUpperCase() + titulo.slice(1);
    }

    // Determinar si hay ambigüedad
    if (!resultado.fecha) {
        resultado.ambiguo = true;
        resultado.preguntaClarificacion = '¿Para qué fecha desea programar esta tarea?';
    } else if (!resultado.hora) {
        resultado.ambiguo = true;
        resultado.preguntaClarificacion = '¿A qué hora desea programar esta tarea?';
    }

    return resultado;
}

/**
 * Formatea una fecha a YYYY-MM-DD
 * @param {Date} fecha - Fecha a formatear
 * @returns {string} Fecha formateada
 */
function formatearFecha(fecha) {
    const year = fecha.getFullYear();
    const month = (fecha.getMonth() + 1).toString().padStart(2, '0');
    const day = fecha.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Obtiene el nombre del mes en español
 * @param {number} mes - Índice del mes (0-11)
 * @returns {string} Nombre del mes
 */
function obtenerNombreMes(mes) {
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
        'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    return meses[mes];
}

/**
 * Prompt para generar resumen diario
 */
const PROMPT_RESUMEN = `Eres un asistente de productividad en español (Colombia).
Genera un resumen muy breve (máximo 2 oraciones) de las tareas del día.
Usa un tono amable y motivador.
Menciona la cantidad de tareas y las más importantes.

Tareas del día:
{TAREAS}

Responde solo el resumen, sin formato adicional.`;

/**
 * Genera un resumen inteligente de las tareas del día
 * @param {Array} tareas - Tareas del día
 * @returns {Promise<string>} Resumen generado
 */
export async function generarResumenDia(tareas) {
    if (tareas.length === 0) {
        return 'No tienes tareas programadas para este día. ¡Aprovecha para descansar o adelantar pendientes!';
    }

    if (!geminiDisponible()) {
        return generarResumenOffline(tareas);
    }

    const tareasTexto = tareas.map(t =>
        `- ${t.titulo} (${t.prioridad}) a las ${t.hora}`
    ).join('\n');

    const prompt = PROMPT_RESUMEN.replace('{TAREAS}', tareasTexto);

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text().trim();
    } catch (error) {
        console.error('Error generando resumen con Gemini:', error);
        return generarResumenOffline(tareas);
    }
}

/**
 * Genera resumen sin Gemini
 * @param {Array} tareas - Tareas del día
 * @returns {string} Resumen
 */
function generarResumenOffline(tareas) {
    const pendientes = tareas.filter(t => t.estado === 'Pendiente');
    const altas = pendientes.filter(t => t.prioridad === 'alta');

    let resumen = `Tienes ${pendientes.length} tarea${pendientes.length !== 1 ? 's' : ''} pendiente${pendientes.length !== 1 ? 's' : ''}`;

    if (altas.length > 0) {
        resumen += `, ${altas.length} de alta prioridad`;
    }

    resumen += '.';

    if (pendientes.length > 0) {
        const primera = pendientes[0];
        resumen += ` Primera tarea: ${primera.titulo} a las ${primera.hora}.`;
    }

    return resumen;
}

/**
 * Prompt para responder consultas del usuario
 */
const PROMPT_CONSULTA = `Eres un asistente de voz amable para gestión de tareas en Colombia.
Responde en español colombiano de forma natural y concisa.
Hoy es {FECHA_HOY}.

Información de las tareas del usuario:
{TAREAS}

Pregunta del usuario: "{PREGUNTA}"

Responde de forma amable, directa y útil. Máximo 3 oraciones.`;

/**
 * Responde a una consulta del usuario sobre sus tareas
 * @param {string} pregunta - Pregunta del usuario
 * @param {Array} tareas - Tareas del usuario
 * @returns {Promise<string>} Respuesta
 */
export async function responderConsulta(pregunta, tareas) {
    if (!geminiDisponible()) {
        return responderConsultaOffline(pregunta, tareas);
    }

    const hoy = new Date();
    const fechaHoy = `${hoy.getDate()} de ${obtenerNombreMes(hoy.getMonth())} de ${hoy.getFullYear()}`;

    const tareasTexto = tareas.length > 0
        ? tareas.map(t => `- ${t.titulo} (${t.fecha} ${t.hora}, ${t.estado})`).join('\n')
        : 'No hay tareas registradas.';

    const prompt = PROMPT_CONSULTA
        .replace('{FECHA_HOY}', fechaHoy)
        .replace('{TAREAS}', tareasTexto)
        .replace('{PREGUNTA}', pregunta);

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text().trim();
    } catch (error) {
        console.error('Error respondiendo consulta:', error);
        return responderConsultaOffline(pregunta, tareas);
    }
}

/**
 * Responde consultas sin Gemini
 * @param {string} pregunta - Pregunta del usuario
 * @param {Array} tareas - Tareas
 * @returns {string} Respuesta
 */
function responderConsultaOffline(pregunta, tareas) {
    const preguntaLower = pregunta.toLowerCase();

    if (/cuántas?\s*tareas?/.test(preguntaLower)) {
        const pendientes = tareas.filter(t => t.estado === 'Pendiente');
        return `Tienes ${pendientes.length} tarea${pendientes.length !== 1 ? 's' : ''} pendiente${pendientes.length !== 1 ? 's' : ''}.`;
    }

    if (/hoy/.test(preguntaLower)) {
        const hoy = formatearFecha(new Date());
        const tareasHoy = tareas.filter(t => t.fecha === hoy && t.estado === 'Pendiente');
        if (tareasHoy.length === 0) {
            return 'No tienes tareas pendientes para hoy.';
        }
        return `Para hoy tienes ${tareasHoy.length} tarea${tareasHoy.length !== 1 ? 's' : ''}: ${tareasHoy.map(t => t.titulo).join(', ')}.`;
    }

    if (/mañana/.test(preguntaLower)) {
        const manana = new Date();
        manana.setDate(manana.getDate() + 1);
        const fechaManana = formatearFecha(manana);
        const tareasManana = tareas.filter(t => t.fecha === fechaManana && t.estado === 'Pendiente');
        if (tareasManana.length === 0) {
            return 'No tienes tareas pendientes para mañana.';
        }
        return `Para mañana tienes ${tareasManana.length} tarea${tareasManana.length !== 1 ? 's' : ''}: ${tareasManana.map(t => t.titulo).join(', ')}.`;
    }

    return 'Lo siento, no entendí tu pregunta. Puedes preguntarme sobre tus tareas de hoy, mañana, o cuántas tareas tienes pendientes.';
}

/**
 * Infiere la prioridad de una tarea basado en el contexto
 * @param {Object} tarea - Información de la tarea
 * @returns {string} Prioridad inferida
 */
export function inferirPrioridad(tarea) {
    const titulo = (tarea.titulo || '').toLowerCase();

    // Palabras que indican alta prioridad
    if (/\b(urgente|importante|crítico|deadline|entrega|pago|médico|doctor|emergencia)\b/.test(titulo)) {
        return 'alta';
    }

    // Tareas de trabajo suelen ser más prioritarias
    if (tarea.contexto === 'trabajo') {
        return 'media';
    }

    // Por defecto
    return 'media';
}
