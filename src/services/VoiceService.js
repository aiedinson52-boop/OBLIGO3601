/**
 * Servicio de Reconocimiento de Voz
 * Utiliza Web Speech API con español colombiano (es-CO)
 */

let recognition = null;
let synthesis = null;
let isListening = false;
let onResultCallback = null;
let onErrorCallback = null;
let onStatusChangeCallback = null;

/**
 * Verifica si el navegador soporta Web Speech API
 * @returns {boolean} true si es soportado
 */
export function soportaReconocimientoVoz() {
    return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
}

/**
 * Verifica si el navegador soporta síntesis de voz
 * @returns {boolean} true si es soportado
 */
export function soportaSintesisVoz() {
    return 'speechSynthesis' in window;
}

/**
 * Inicializa el servicio de reconocimiento de voz
 * @param {Object} callbacks - Callbacks para eventos
 */
export function inicializarVoz(callbacks = {}) {
    if (!soportaReconocimientoVoz()) {
        console.error('El navegador no soporta reconocimiento de voz');
        return false;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();

    // Configuración para español colombiano
    recognition.lang = 'es-CO';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    // Callbacks
    onResultCallback = callbacks.onResult || null;
    onErrorCallback = callbacks.onError || null;
    onStatusChangeCallback = callbacks.onStatusChange || null;

    // Eventos del reconocimiento
    recognition.onstart = () => {
        isListening = true;
        if (onStatusChangeCallback) {
            onStatusChangeCallback('listening');
        }
    };

    recognition.onend = () => {
        isListening = false;
        if (onStatusChangeCallback) {
            onStatusChangeCallback('stopped');
        }
    };

    recognition.onresult = (event) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;

            if (event.results[i].isFinal) {
                finalTranscript += transcript;
            } else {
                interimTranscript += transcript;
            }
        }

        if (onResultCallback) {
            onResultCallback({
                final: finalTranscript,
                interim: interimTranscript,
                isFinal: finalTranscript.length > 0
            });
        }
    };

    recognition.onerror = (event) => {
        isListening = false;

        const mensajesError = {
            'no-speech': 'No se detectó ningún audio. Por favor, intente de nuevo.',
            'audio-capture': 'No se pudo acceder al micrófono. Verifique los permisos.',
            'not-allowed': 'El acceso al micrófono fue denegado. Por favor, permita el acceso.',
            'network': 'Error de red. Verifique su conexión a internet.',
            'aborted': 'El reconocimiento fue cancelado.',
            'language-not-supported': 'El idioma español (Colombia) no está soportado.'
        };

        const mensaje = mensajesError[event.error] || `Error de reconocimiento: ${event.error}`;

        if (onErrorCallback) {
            onErrorCallback(mensaje);
        }

        if (onStatusChangeCallback) {
            onStatusChangeCallback('error');
        }
    };

    // Inicializar síntesis de voz
    if (soportaSintesisVoz()) {
        synthesis = window.speechSynthesis;
    }

    return true;
}

/**
 * Inicia el reconocimiento de voz
 */
export function iniciarEscucha() {
    if (!recognition) {
        console.error('El servicio de voz no está inicializado');
        return false;
    }

    if (isListening) {
        console.warn('Ya se está escuchando');
        return false;
    }

    try {
        recognition.start();
        return true;
    } catch (error) {
        console.error('Error iniciando reconocimiento:', error);
        return false;
    }
}

/**
 * Detiene el reconocimiento de voz
 */
export function detenerEscucha() {
    if (!recognition) {
        return;
    }

    if (isListening) {
        recognition.stop();
    }
}

/**
 * Alterna el estado de escucha
 * @returns {boolean} Nuevo estado de escucha
 */
export function alternarEscucha() {
    if (isListening) {
        detenerEscucha();
        return false;
    } else {
        iniciarEscucha();
        return true;
    }
}

/**
 * Verifica si está escuchando actualmente
 * @returns {boolean} true si está escuchando
 */
export function estaEscuchando() {
    return isListening;
}

/**
 * Habla un texto usando síntesis de voz
 * @param {string} texto - Texto a hablar
 * @param {Object} opciones - Opciones de voz
 * @returns {Promise<void>}
 */
export function hablar(texto, opciones = {}) {
    return new Promise((resolve, reject) => {
        if (!synthesis) {
            reject(new Error('La síntesis de voz no está disponible'));
            return;
        }

        // Cancelar cualquier utterance en curso
        synthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(texto);

        // Buscar voz en español
        const voces = synthesis.getVoices();
        const vozEspanol = voces.find(voz =>
            voz.lang.startsWith('es') &&
            (voz.lang.includes('CO') || voz.lang.includes('419') || voz.lang === 'es-ES')
        ) || voces.find(voz => voz.lang.startsWith('es'));

        if (vozEspanol) {
            utterance.voice = vozEspanol;
        }

        utterance.lang = 'es-CO';
        utterance.rate = opciones.velocidad || 1;
        utterance.pitch = opciones.tono || 1;
        utterance.volume = opciones.volumen || 1;

        utterance.onend = () => resolve();
        utterance.onerror = (error) => reject(error);

        synthesis.speak(utterance);
    });
}

/**
 * Detiene cualquier síntesis de voz en curso
 */
export function detenerHabla() {
    if (synthesis) {
        synthesis.cancel();
    }
}

/**
 * Obtiene las voces disponibles en español
 * @returns {Array} Array de voces en español
 */
export function obtenerVocesEspanol() {
    if (!synthesis) {
        return [];
    }

    return synthesis.getVoices().filter(voz => voz.lang.startsWith('es'));
}

/**
 * Comandos de voz reconocidos y sus patrones
 */
const PATRONES_COMANDOS = [
    {
        patron: /^(crear|nueva|agregar|añadir)\s+(tarea|recordatorio)/i,
        comando: 'CREAR_TAREA',
        descripcion: 'Crear nueva tarea'
    },
    {
        patron: /^(mostrar|ver|listar)\s+(tareas?|pendientes?)/i,
        comando: 'VER_TAREAS',
        descripcion: 'Ver lista de tareas'
    },
    {
        patron: /^(marcar como|completar|cumplir)\s+(cumplida|completada|hecha)/i,
        comando: 'MARCAR_CUMPLIDA',
        descripcion: 'Marcar tarea como cumplida'
    },
    {
        patron: /^qué\s+tareas?\s+(tengo|hay)\s+(para\s+)?(hoy|mañana|esta semana)/i,
        comando: 'CONSULTAR_TAREAS',
        descripcion: 'Consultar tareas de un período'
    },
    {
        patron: /^(eliminar|borrar|quitar)\s+tarea/i,
        comando: 'ELIMINAR_TAREA',
        descripcion: 'Eliminar una tarea'
    },
    {
        patron: /^(posponer|aplazar|mover)\s+(la\s+)?tarea/i,
        comando: 'POSPONER_TAREA',
        descripcion: 'Posponer una tarea'
    },
    {
        patron: /^(ir\s+a|mostrar)\s+(calendario|mes|fecha)/i,
        comando: 'NAVEGAR_CALENDARIO',
        descripcion: 'Navegar en el calendario'
    },
    {
        patron: /^ayuda|comandos|qué puedo decir/i,
        comando: 'AYUDA',
        descripcion: 'Mostrar ayuda'
    }
];

/**
 * Identifica el comando a partir de una transcripción
 * @param {string} transcripcion - Texto transcrito
 * @returns {Object|null} Comando identificado o null
 */
export function identificarComando(transcripcion) {
    const textoLimpio = transcripcion.trim().toLowerCase();

    for (const { patron, comando, descripcion } of PATRONES_COMANDOS) {
        const match = textoLimpio.match(patron);
        if (match) {
            return {
                comando,
                descripcion,
                textoOriginal: transcripcion,
                match: match[0]
            };
        }
    }

    return null;
}

/**
 * Extrae información de una tarea desde el texto
 * @param {string} texto - Texto con la descripción de la tarea
 * @returns {Object} Información extraída
 */
export function extraerInfoTarea(texto) {
    const info = {
        titulo: '',
        fecha: null,
        hora: null,
        contexto: null,
        prioridad: null,
        textoOriginal: texto
    };

    // Patrones para extraer fechas
    const patronHoy = /\bhoy\b/i;
    const patronManana = /\bmañana\b/i;
    const patronPasadoManana = /\bpasado\s*mañana\b/i;
    const patronDiaSemana = /\b(lunes|martes|miércoles|jueves|viernes|sábado|domingo)\b/i;
    const patronFechaExplicita = /\b(\d{1,2})\s*de\s*(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/i;

    // Patrones para horas
    const patronHora = /\ba\s*las?\s*(\d{1,2})(?::(\d{2}))?\s*(de\s*la\s*)?(mañana|tarde|noche|am|pm)?/i;

    // Patrones para contexto
    const patronTrabajo = /\b(trabajo|oficina|laboral|reunión|junta)\b/i;
    const patronPersonal = /\b(personal|yo|mi|propio)\b/i;
    const patronFamiliar = /\b(familia|familiar|hijos?|esposa?|padres?)\b/i;

    // Patrones para prioridad
    const patronAlta = /\b(urgente|importante|prioritario|alta\s*prioridad)\b/i;
    const patronBaja = /\b(baja|poco\s*urgente|cuando\s*pueda)\b/i;

    const hoy = new Date();

    // Extraer fecha
    if (patronPasadoManana.test(texto)) {
        info.fecha = new Date(hoy);
        info.fecha.setDate(info.fecha.getDate() + 2);
    } else if (patronManana.test(texto)) {
        info.fecha = new Date(hoy);
        info.fecha.setDate(info.fecha.getDate() + 1);
    } else if (patronHoy.test(texto)) {
        info.fecha = new Date(hoy);
    } else if (patronDiaSemana.test(texto)) {
        const match = texto.match(patronDiaSemana);
        const diasSemana = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
        const diaObjetivo = diasSemana.indexOf(match[1].toLowerCase());
        const diaActual = hoy.getDay();

        let diasHasta = diaObjetivo - diaActual;
        if (diasHasta <= 0) diasHasta += 7;

        info.fecha = new Date(hoy);
        info.fecha.setDate(info.fecha.getDate() + diasHasta);
    } else if (patronFechaExplicita.test(texto)) {
        const match = texto.match(patronFechaExplicita);
        const dia = parseInt(match[1]);
        const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
            'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
        const mes = meses.indexOf(match[2].toLowerCase());

        let year = hoy.getFullYear();
        const fechaPropuesta = new Date(year, mes, dia);
        if (fechaPropuesta < hoy) {
            year++;
        }

        info.fecha = new Date(year, mes, dia);
    }

    // Extraer hora
    if (patronHora.test(texto)) {
        const match = texto.match(patronHora);
        let hora = parseInt(match[1]);
        const minutos = match[2] ? parseInt(match[2]) : 0;
        const periodo = match[4];

        if (periodo) {
            if ((periodo.includes('tarde') || periodo.toLowerCase() === 'pm') && hora < 12) {
                hora += 12;
            } else if ((periodo.includes('mañana') || periodo.toLowerCase() === 'am') && hora === 12) {
                hora = 0;
            }
        }

        info.hora = `${hora.toString().padStart(2, '0')}:${minutos.toString().padStart(2, '0')}`;
    }

    // Extraer contexto
    if (patronTrabajo.test(texto)) {
        info.contexto = 'trabajo';
    } else if (patronFamiliar.test(texto)) {
        info.contexto = 'familiar';
    } else if (patronPersonal.test(texto)) {
        info.contexto = 'personal';
    }

    // Extraer prioridad
    if (patronAlta.test(texto)) {
        info.prioridad = 'alta';
    } else if (patronBaja.test(texto)) {
        info.prioridad = 'baja';
    }

    // Extraer título (simplificado: usar el texto limpio sin las partes de fecha/hora)
    let titulo = texto
        .replace(patronHora, '')
        .replace(patronPasadoManana, '')
        .replace(patronManana, '')
        .replace(patronHoy, '')
        .replace(patronDiaSemana, '')
        .replace(patronFechaExplicita, '')
        .replace(patronAlta, '')
        .replace(patronBaja, '')
        .replace(/\ba\s*las?\b/gi, '')
        .replace(/\bpara\b/gi, '')
        .replace(/\bel\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();

    // Capitalizar primera letra
    if (titulo) {
        info.titulo = titulo.charAt(0).toUpperCase() + titulo.slice(1);
    }

    return info;
}

/**
 * Solicita permiso para el micrófono
 * @returns {Promise<boolean>} true si se otorgó permiso
 */
export async function solicitarPermisoMicrofono() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Detener el stream inmediatamente, solo verificamos el permiso
        stream.getTracks().forEach(track => track.stop());
        return true;
    } catch (error) {
        console.error('Error solicitando permiso de micrófono:', error);
        return false;
    }
}

/**
 * Verifica el estado del permiso del micrófono
 * @returns {Promise<string>} 'granted', 'denied', o 'prompt'
 */
export async function verificarPermisoMicrofono() {
    if (!navigator.permissions) {
        // Fallback para navegadores sin API de permisos
        return 'prompt';
    }

    try {
        const result = await navigator.permissions.query({ name: 'microphone' });
        return result.state;
    } catch (error) {
        return 'prompt';
    }
}
