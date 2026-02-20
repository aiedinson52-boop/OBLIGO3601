/**
 * Servicio de Alertas y Notificaciones
 * Gestiona las 3 alertas obligatorias por tarea
 */

import { obtenerTareasConAlertasPendientes, marcarAlertaDisparada, obtenerTareasPendientes } from './TaskStorage.js';
import { hablar } from './VoiceService.js';
import { enviarPushAlerta, estaSuscrito } from './PushService.js';

let intervalId = null;
let notificationPermission = 'default';

// Web Audio API Context (inicializado perezosamente)
let audioContext = null;
let audioDesbloqueado = false;

/**
 * Inicializa el servicio de alertas
 * @returns {Promise<boolean>} true si se inicializó correctamente
 */
export async function inicializarAlertas() {
    // Solicitar permiso de notificaciones
    if ('Notification' in window) {
        notificationPermission = await Notification.requestPermission();
    }

    // Iniciar verificación periódica de alertas
    iniciarVerificacionAlertas();

    return notificationPermission === 'granted';
}

/**
 * Inicia la verificación periódica de alertas
 * Se ejecuta cada minuto
 */
function iniciarVerificacionAlertas() {
    if (intervalId) {
        clearInterval(intervalId);
    }

    // Verificar inmediatamente
    verificarAlertas();

    // Verificar cada minuto
    intervalId = setInterval(verificarAlertas, 60000);
}

/**
 * Detiene la verificación de alertas
 */
export function detenerVerificacionAlertas() {
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
    }
}

/**
 * Verifica si hay alertas pendientes que deben dispararse
 */
async function verificarAlertas() {
    try {
        const tareasConAlertas = await obtenerTareasConAlertasPendientes();
        const ahora = new Date();

        for (const tarea of tareasConAlertas) {
            for (const alerta of tarea.alertas) {
                if (alerta.disparada) continue;

                const fechaAlerta = new Date(alerta.fechaHora);

                if (fechaAlerta <= ahora) {
                    await dispararAlerta(tarea, alerta);
                }
            }
        }
    } catch (error) {
        console.error('Error verificando alertas:', error);
    }
}

/**
 * Dispara una alerta específica
 * @param {Object} tarea - Tarea asociada
 * @param {Object} alerta - Alerta a disparar
 */
async function dispararAlerta(tarea, alerta) {
    const mensaje = construirMensajeAlerta(tarea, alerta);

    // 1. PUSH VÍA SERVIDOR/APNs — Funciona en segundo plano en iOS
    //    Esta es la única forma de reproducir sonido cuando la app no está en primer plano.
    if (estaSuscrito()) {
        try {
            await enviarPushAlerta(
                `⏰ Recordatorio: ${tarea.titulo}`,
                mensaje,
                {
                    tareaId: tarea.id,
                    alertaId: alerta.id,
                    tag: `alerta-${tarea.id}-${alerta.id}`,
                    url: '/'
                }
            );
            console.log('[AlertService] Push enviado vía servidor/APNs');
        } catch (error) {
            console.warn('[AlertService] Error enviando push:', error);
        }
    }

    // 2. FALLBACK: Sonido local (solo funciona en primer plano)
    reproducirSonido();

    // 3. Notificación del navegador (fallback local)
    mostrarNotificacion(tarea, alerta);

    // 4. Hablar el mensaje (si está disponible y en primer plano)
    try {
        await hablar(mensaje);
    } catch (error) {
        console.warn('No se pudo reproducir mensaje de voz:', error);
    }

    // 5. Marcar alerta como disparada
    try {
        await marcarAlertaDisparada(tarea.id, alerta.id);
    } catch (error) {
        console.error('Error marcando alerta como disparada:', error);
    }

    // 6. Emitir evento personalizado
    dispatchAlertEvent(tarea, alerta);
}

/**
 * Construye el mensaje de alerta en español
 * @param {Object} tarea - Tarea
 * @param {Object} alerta - Alerta
 * @returns {string} Mensaje formateado
 */
function construirMensajeAlerta(tarea, alerta) {
    let tiempoRestante = '';

    switch (alerta.tipo) {
        case '8_dias':
            tiempoRestante = 'en 8 días';
            break;
        case '3_dias':
            tiempoRestante = 'en 3 días';
            break;
        case '3_horas':
            tiempoRestante = 'en 3 horas';
            break;
        default:
            tiempoRestante = 'próximamente';
    }

    return `Recordatorio importante: La tarea "${tarea.titulo}" está programada ${tiempoRestante}. ¿Desea marcarla como cumplida o modificarla?`;
}

/**
 * Desbloquea el AudioContext para Safari/Apple.
 * Debe llamarse durante un gesto del usuario (click/touch).
 * @returns {Promise<void>}
 */
export async function desbloquearAudioParaSafari() {
    if (audioDesbloqueado) return;

    try {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        // Reanudar contexto (obligatorio para Safari)
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }

        // Reproducir buffer de silencio para "activar" la salida de audio en Safari
        const buffer = audioContext.createBuffer(1, 1, 22050);
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);
        source.start(0);

        audioDesbloqueado = true;
        console.log('🔊 AudioContext desbloqueado para Safari/Apple');
    } catch (error) {
        console.warn('No se pudo desbloquear AudioContext:', error);
    }
}

/**
 * Reproduce el sonido de alerta (Alta Frecuencia)
 * Genera un patrón de pitidos fuertes usando Web Audio API
 * Con fallback a HTML5 Audio para máxima compatibilidad
 */
async function reproducirSonido() {
    let sonidoReproducido = false;

    // Intento 1: Web Audio API
    try {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        // Reanudar contexto si está suspendido (requisito de navegadores modernos)
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }

        // Verificar que el contexto esté corriendo
        if (audioContext.state !== 'running') {
            throw new Error('AudioContext no está en estado running: ' + audioContext.state);
        }

        const osc = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        // Configuración para sonido fuerte y agudo
        osc.type = 'square'; // Onda cuadrada para un sonido más "cortante" y perceptible
        osc.frequency.setValueAtTime(3000, audioContext.currentTime); // 3000Hz (Alta frecuencia)

        // Patrón de volumen: Pitido fuerte - silencio - Pitido fuerte
        // Pitido 1 (0ms - 200ms)
        gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.5, audioContext.currentTime + 0.2);
        // Silencio (200ms - 300ms)
        gainNode.gain.setValueAtTime(0, audioContext.currentTime + 0.2);
        // Pitido 2 (300ms - 500ms)
        gainNode.gain.setValueAtTime(0.5, audioContext.currentTime + 0.3);
        gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.5);

        osc.connect(gainNode);
        gainNode.connect(audioContext.destination);

        osc.start();
        osc.stop(audioContext.currentTime + 0.6); // Detener después de la secuencia completa
        sonidoReproducido = true;

    } catch (error) {
        console.warn('Web Audio API falló, usando fallback HTML5 Audio:', error);
    }

    // Intento 2: Fallback con HTML5 Audio (beep WAV en base64)
    if (!sonidoReproducido) {
        try {
            // Beep corto WAV en base64 (1kHz, 0.3s, formato PCM)
            const beepDataUri = 'data:audio/wav;base64,UklGRl4AAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YTYAAAB/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/fw==';
            const audio = new Audio(beepDataUri);
            audio.volume = 1.0;
            await audio.play();
            console.log('🔊 Sonido reproducido con HTML5 Audio (fallback)');
        } catch (fallbackError) {
            console.warn('Fallback HTML5 Audio también falló:', fallbackError);
        }
    }
}

/**
 * Muestra una notificación del navegador
 * @param {Object} tarea - Tarea
 * @param {Object} alerta - Alerta
 */
function mostrarNotificacion(tarea, alerta) {
    if (notificationPermission !== 'granted') {
        return;
    }

    const opciones = {
        body: construirMensajeAlerta(tarea, alerta),
        icon: '📋',
        tag: `alerta-${tarea.id}-${alerta.id}`,
        requireInteraction: true,
        actions: [
            { action: 'cumplida', title: 'Marcar Cumplida' },
            { action: 'posponer', title: 'Posponer' }
        ]
    };

    try {
        const notification = new Notification(`⏰ Recordatorio: ${tarea.titulo}`, opciones);

        notification.onclick = () => {
            window.focus();
            dispatchAlertClickEvent(tarea, alerta);
            notification.close();
        };

        // Auto-cerrar después de 30 segundos
        setTimeout(() => notification.close(), 30000);
    } catch (error) {
        console.warn('Error mostrando notificación:', error);
    }
}

/**
 * Emite un evento personalizado cuando se dispara una alerta
 * @param {Object} tarea - Tarea
 * @param {Object} alerta - Alerta
 */
function dispatchAlertEvent(tarea, alerta) {
    const event = new CustomEvent('alertaDisparada', {
        detail: { tarea, alerta }
    });
    window.dispatchEvent(event);
}

/**
 * Emite un evento cuando se hace clic en una notificación
 * @param {Object} tarea - Tarea
 * @param {Object} alerta - Alerta
 */
function dispatchAlertClickEvent(tarea, alerta) {
    const event = new CustomEvent('alertaClick', {
        detail: { tarea, alerta }
    });
    window.dispatchEvent(event);
}

/**
 * Obtiene el estado del permiso de notificaciones
 * @returns {string} Estado del permiso
 */
export function obtenerEstadoPermiso() {
    return notificationPermission;
}

/**
 * Solicita permiso de notificaciones nuevamente
 * @returns {Promise<string>} Estado del permiso
 */
export async function solicitarPermisoNotificaciones() {
    if ('Notification' in window) {
        notificationPermission = await Notification.requestPermission();
    }
    return notificationPermission;
}

/**
 * Calcula el tiempo restante para una tarea
 * @param {Object} tarea - Tarea
 * @returns {Object} Información de tiempo restante
 */
export function calcularTiempoRestante(tarea) {
    const ahora = new Date();
    const fechaTarea = new Date(`${tarea.fecha}T${tarea.hora}`);
    const diff = fechaTarea - ahora;

    if (diff <= 0) {
        return {
            vencida: true,
            texto: 'Tarea vencida',
            dias: 0,
            horas: 0,
            minutos: 0
        };
    }

    const dias = Math.floor(diff / (1000 * 60 * 60 * 24));
    const horas = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutos = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    let texto = '';
    if (dias > 0) {
        texto = `Faltan ${dias} día${dias > 1 ? 's' : ''}`;
    } else if (horas > 0) {
        texto = `Faltan ${horas} hora${horas > 1 ? 's' : ''}`;
    } else {
        texto = `Faltan ${minutos} minuto${minutos > 1 ? 's' : ''}`;
    }

    return {
        vencida: false,
        texto,
        dias,
        horas,
        minutos
    };
}

/**
 * Obtiene las próximas alertas programadas
 * @param {number} limite - Número máximo de alertas a retornar
 * @returns {Promise<Array>} Array de alertas próximas
 */
export async function obtenerProximasAlertas(limite = 5) {
    const tareas = await obtenerTareasPendientes();
    const ahora = new Date();
    const alertasProximas = [];

    for (const tarea of tareas) {
        for (const alerta of tarea.alertas) {
            if (alerta.disparada) continue;

            const fechaAlerta = new Date(alerta.fechaHora);
            if (fechaAlerta > ahora) {
                alertasProximas.push({
                    tarea,
                    alerta,
                    fechaAlerta
                });
            }
        }
    }

    // Ordenar por fecha de alerta
    alertasProximas.sort((a, b) => a.fechaAlerta - b.fechaAlerta);

    return alertasProximas.slice(0, limite);
}

/**
 * Programa una alerta manual (para pruebas o alertas personalizadas)
 * @param {Object} tarea - Tarea
 * @param {Date} fechaAlerta - Fecha/hora de la alerta
 * @param {string} mensaje - Mensaje personalizado
 */
export function programarAlertaManual(tarea, fechaAlerta, mensaje) {
    const ahora = new Date();
    const delay = fechaAlerta - ahora;

    if (delay <= 0) {
        console.warn('La fecha de alerta ya pasó');
        return null;
    }

    const timeoutId = setTimeout(() => {
        const alerta = {
            id: `manual_${Date.now()}`,
            tipo: 'manual',
            mensaje
        };

        dispararAlerta(tarea, alerta);
    }, delay);

    return timeoutId;
}

/**
 * Verifica alertas próximas de otro usuario (Cross-Operator Notification)
 * Cuando un operador/admin visualiza las tareas de otro operador,
 * se detectan tareas con fechas/horas próximas y se notifica.
 * @param {string} userId - UID del usuario a verificar
 * @returns {Promise<Array>} Tareas con alertas próximas
 */
export async function verificarAlertasDeOtroUsuario(userId) {
    try {
        const tareas = await obtenerTareasPendientes(userId);
        const ahora = new Date();
        const alertasProximas = [];

        for (const tarea of tareas) {
            const fechaTarea = new Date(`${tarea.fecha}T${tarea.hora}`);
            const diff = fechaTarea - ahora;

            // Si la tarea está dentro de las próximas 24 horas (o ya venció)
            if (diff > 0 && diff <= 24 * 60 * 60 * 1000) {
                const tiempoRestante = calcularTiempoRestante(tarea);
                alertasProximas.push({
                    tarea,
                    tiempoRestante: tiempoRestante.texto,
                    fechaTarea
                });
            }
        }

        // Ordenar por fecha más próxima
        alertasProximas.sort((a, b) => a.fechaTarea - b.fechaTarea);

        // Disparar notificación push al operador responsable (si aplica)
        if (alertasProximas.length > 0 && estaSuscrito()) {
            for (const alerta of alertasProximas.slice(0, 3)) { // Máximo 3 notificaciones
                try {
                    await enviarPushAlerta(
                        `⏰ Alerta de equipo: ${alerta.tarea.titulo}`,
                        `La tarea "${alerta.tarea.titulo}" está programada ${alerta.tiempoRestante}. ¡Atención requerida!`,
                        {
                            tareaId: alerta.tarea.id,
                            tag: `cross-alert-${alerta.tarea.id}`,
                            url: '/'
                        }
                    );
                } catch (pushError) {
                    console.warn('[AlertService] Error enviando push cruzado:', pushError);
                }
            }
        }

        return alertasProximas;
    } catch (error) {
        console.error('[AlertService] Error verificando alertas de otro usuario:', error);
        return [];
    }
}

/**
 * Limpia los recursos del servicio de alertas
 */
export function limpiarServicioAlertas() {
    detenerVerificacionAlertas();
}
