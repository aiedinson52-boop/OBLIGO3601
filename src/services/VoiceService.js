/**
 * Servicio de Reconocimiento de Voz
 * Implementa MediaRecorder + Backend STT (Deepgram)
 * Compatible con Android Chrome e iOS Safari
 * 
 * NOTA: NO usa SpeechRecognition/webkitSpeechRecognition
 */

import { getAudioConfig, isMediaRecorderSupported, detectDevice } from './DeviceService.js';

let strategy = null;
let synthesis = null;
let onResultCallback = null;
let onErrorCallback = null;
let onStatusChangeCallback = null;

// ==========================================
// ESTRATEGIA: Streaming con Backend STT
// ==========================================

class StreamingStrategy {
    constructor() {
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.stream = null;
        this.isListening = false;
        this.audioConfig = getAudioConfig();
    }

    async start() {
        try {
            // Obtener stream de micrófono
            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: this.audioConfig.channelCount || 1,
                    sampleRate: this.audioConfig.sampleRate || 16000,
                    echoCancellation: this.audioConfig.echoCancellation ?? true,
                    noiseSuppression: this.audioConfig.noiseSuppression ?? true,
                    autoGainControl: this.audioConfig.autoGainControl ?? true
                }
            });

            // Configurar MediaRecorder con opciones específicas de plataforma
            const recorderOptions = {};
            if (this.audioConfig.mimeType) {
                recorderOptions.mimeType = this.audioConfig.mimeType;
            }
            if (this.audioConfig.audioBitsPerSecond) {
                recorderOptions.audioBitsPerSecond = this.audioConfig.audioBitsPerSecond;
            }

            this.mediaRecorder = new MediaRecorder(this.stream, recorderOptions);
            this.audioChunks = [];

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstart = () => {
                this.isListening = true;
                if (onStatusChangeCallback) onStatusChangeCallback('listening');
            };

            this.mediaRecorder.onstop = async () => {
                this.isListening = false;

                // Detener tracks del stream
                if (this.stream) {
                    this.stream.getTracks().forEach(track => track.stop());
                }

                if (onStatusChangeCallback) onStatusChangeCallback('processing');

                // Crear blob de audio
                const audioBlob = new Blob(this.audioChunks, {
                    type: this.audioConfig.mimeType || 'audio/webm'
                });

                try {
                    const texto = await this.transcribeAudio(audioBlob);
                    if (texto && onResultCallback) {
                        onResultCallback({
                            final: texto,
                            interim: '',
                            isFinal: true
                        });
                    }
                    if (onStatusChangeCallback) onStatusChangeCallback('stopped');
                } catch (error) {
                    console.error('[VoiceService] Error en transcripción:', error);
                    handleError('transcription-failed');
                }
            };

            this.mediaRecorder.onerror = (event) => {
                console.error('[VoiceService] MediaRecorder error:', event.error);
                this.isListening = false;
                handleError('audio-capture');
            };

            // Iniciar grabación
            this.mediaRecorder.start();
            return true;

        } catch (error) {
            console.error('[VoiceService] Error iniciando grabación:', error);

            if (error.name === 'NotAllowedError') {
                handleError('not-allowed');
            } else if (error.name === 'NotFoundError') {
                handleError('no-microphone');
            } else {
                handleError('audio-capture');
            }
            return false;
        }
    }

    stop() {
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }
    }

    isActive() {
        return this.isListening;
    }

    /**
     * Envía audio al backend para transcripción
     * @param {Blob} audioBlob - Audio grabado
     * @returns {Promise<string>} Texto transcrito
     */
    async transcribeAudio(audioBlob) {
        // Convertir a base64
        const base64Audio = await this.blobToBase64(audioBlob);

        // Llamar al endpoint del backend
        const response = await fetch('/api/voice-transcribe', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                audio: base64Audio,
                mimeType: audioBlob.type
            })
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.message || 'Transcription failed');
        }

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || 'Transcription failed');
        }

        console.log(`[VoiceService] Transcripción: "${result.transcript}" (confianza: ${result.confidence})`);
        return result.transcript;
    }

    /**
     * Convierte Blob a base64
     * @param {Blob} blob 
     * @returns {Promise<string>}
     */
    blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64String = reader.result.split(',')[1];
                resolve(base64String);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }
}

function handleError(errorCode) {
    const mensajesError = {
        'no-speech': 'No se detectó ningún audio. Por favor, intente de nuevo.',
        'audio-capture': 'No se pudo acceder al micrófono. Verifique los permisos.',
        'not-allowed': 'El acceso al micrófono fue denegado. Por favor, permita el acceso.',
        'no-microphone': 'No se detectó ningún micrófono en el dispositivo.',
        'network': 'Error de red. Verifique su conexión a internet.',
        'aborted': 'El reconocimiento fue cancelado.',
        'transcription-failed': 'Falló la transcripción. Intente de nuevo.',
        'not-supported': 'El reconocimiento de voz no está soportado en este navegador.'
    };

    const mensaje = mensajesError[errorCode] || `Error de reconocimiento: ${errorCode}`;
    if (onErrorCallback) onErrorCallback(mensaje);
    if (onStatusChangeCallback) onStatusChangeCallback('error');
}

// ==========================================
// API PÚBLICA
// ==========================================

export function soportaReconocimientoVoz() {
    return isMediaRecorderSupported();
}

export function soportaSintesisVoz() {
    return 'speechSynthesis' in window;
}

export function inicializarVoz(callbacks = {}) {
    onResultCallback = callbacks.onResult || null;
    onErrorCallback = callbacks.onError || null;
    onStatusChangeCallback = callbacks.onStatusChange || null;

    // Usar siempre StreamingStrategy
    if (isMediaRecorderSupported()) {
        strategy = new StreamingStrategy();
        console.log(`[VoiceService] Inicializado con StreamingStrategy (${detectDevice()})`);
    } else {
        console.error('[VoiceService] MediaRecorder no soportado');
        return false;
    }

    // Inicializar síntesis (común)
    if (soportaSintesisVoz()) {
        synthesis = window.speechSynthesis;
    }

    return !!strategy;
}

export function iniciarEscucha() {
    if (!strategy) return false;
    if (strategy.isActive()) return false;
    return strategy.start();
}

export function detenerEscucha() {
    if (!strategy) return;
    if (strategy.isActive()) strategy.stop();
}

export function alternarEscucha() {
    if (!strategy) return false;
    if (strategy.isActive()) {
        detenerEscucha();
        return false;
    } else {
        iniciarEscucha();
        return true;
    }
}

export function estaEscuchando() {
    return strategy ? strategy.isActive() : false;
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
