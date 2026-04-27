/**
 * Componente de botón de voz
 * Interfaz para el reconocimiento de voz
 */

import {
    inicializarVoz,
    iniciarEscucha,
    detenerEscucha,
    estaEscuchando,
    soportaReconocimientoVoz,
    solicitarPermisoMicrofono
} from '../services/VoiceService.js';

let buttonElement = null;
let transcriptElement = null;
let isInitialized = false;
let onTranscriptCallback = null;

/**
 * Inicializa el componente de botón de voz
 * @param {HTMLElement} container - Contenedor del componente
 * @param {Object} opciones - Opciones de configuración
 */
export async function inicializarBotonVoz(container, opciones = {}) {
    // Verificar soporte
    if (!soportaReconocimientoVoz()) {
        container.innerHTML = `
      <div class="voice-not-supported" style="text-align: center; padding: var(--space-4); color: var(--color-warning);">
        <p>⚠️ El reconocimiento de voz no está soportado en este navegador.</p>
        <p style="font-size: var(--font-size-sm); margin-top: var(--space-2);">
          Intente con Google Chrome o Microsoft Edge.
        </p>
      </div>
    `;
        return;
    }

    onTranscriptCallback = opciones.onTranscript || null;

    // Renderizar componente
    container.innerHTML = `
    <div class="voice-control" style="display: flex; flex-direction: column; align-items: flex-end; gap: var(--space-2);">
      <button class="voice-btn" id="voice-button" aria-label="Activar micrófono" title="Presione para hablar" style="width: 48px; height: 48px; font-size: 1.2rem; border-width: 2px;">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
          <line x1="12" x2="12" y1="19" y2="22"/>
        </svg>
      </button>
      
      <div id="voice-status" class="voice-status" style="text-align: right;">
        <p style="font-size: 10px; color: var(--color-gray-500); font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
          Control por Voz
        </p>
      </div>
      
      <div class="transcript-display" id="transcript-display" style="display: none; font-size: 11px; padding: 4px 8px; background: rgba(0,0,0,0.4); border-radius: 6px; color: white;">
        Aquí aparecerá lo que diga...
      </div>
    </div>
  `;

    buttonElement = container.querySelector('#voice-button');
    transcriptElement = container.querySelector('#transcript-display');

    // Inicializar el servicio de voz
    const vocesDisponibles = inicializarVoz({
        onResult: manejarResultadoVoz,
        onError: manejarErrorVoz,
        onStatusChange: manejarCambioEstado
    });

    if (vocesDisponibles) {
        isInitialized = true;
    }

    // Event listener del botón
    buttonElement.addEventListener('click', alternarVoz);

    // Solicitar permiso de micrófono proactivamente
    if (opciones.solicitarPermiso) {
        await solicitarPermisoMicrofono();
    }
}

/**
 * Alterna el estado de escucha
 */
async function alternarVoz() {
    if (!isInitialized) {
        mostrarEstado('El servicio de voz no está disponible', 'error');
        return;
    }

    if (estaEscuchando()) {
        detenerEscucha();
    } else {
        // Solicitar permiso si es necesario
        const permiso = await solicitarPermisoMicrofono();
        if (!permiso) {
            mostrarEstado('Por favor, permita el acceso al micrófono', 'error');
            return;
        }

        iniciarEscucha();
    }
}

/**
 * Maneja el resultado del reconocimiento de voz
 * @param {Object} resultado - Resultado del reconocimiento
 */
function manejarResultadoVoz(resultado) {
    const texto = resultado.final || resultado.interim;

    if (texto) {
        transcriptElement.textContent = texto;
        transcriptElement.classList.add('active');
    }

    if (resultado.isFinal && resultado.final) {
        // Llamar al callback con el texto final
        if (onTranscriptCallback) {
            onTranscriptCallback(resultado.final);
        }
    }
}

/**
 * Maneja errores del reconocimiento de voz
 * @param {string} mensaje - Mensaje de error
 */
function manejarErrorVoz(mensaje) {
    mostrarEstado(mensaje, 'error');
    buttonElement.classList.remove('listening');
}

/**
 * Maneja cambios en el estado del reconocimiento
 * @param {string} estado - Nuevo estado
 */
function manejarCambioEstado(estado) {
    switch (estado) {
        case 'listening':
            buttonElement.classList.add('listening');
            mostrarEstado('Escuchando... Hable ahora', 'listening');
            transcriptElement.textContent = 'Escuchando...';
            transcriptElement.classList.remove('active');
            break;

        case 'processing':
            buttonElement.classList.add('listening'); // Maintain pulse effect
            mostrarEstado('Procesando audio...', 'processing');
            transcriptElement.textContent = 'Procesando...';
            break;

        case 'stopped':
            buttonElement.classList.remove('listening');
            mostrarEstado('Presione el botón y hable', 'idle');
            break;

        case 'error':
            buttonElement.classList.remove('listening');
            mostrarEstado('Error en el reconocimiento', 'error');
            break;
    }
}

/**
 * Muestra un mensaje de estado
 * @param {string} mensaje - Mensaje a mostrar
 * @param {string} tipo - Tipo de mensaje
 */
function mostrarEstado(mensaje, tipo) {
    const statusElement = document.querySelector('#voice-status');
    if (!statusElement) return;

    let color = 'var(--color-gray-500)';
    let icon = '';

    switch (tipo) {
        case 'listening':
            color = 'var(--color-primary-500)';
            icon = '🎤 ';
            break;
        case 'processing': // New case
            color = 'var(--color-info-500, #3b82f6)';
            icon = '🔄 ';
            break;
        case 'error':
            color = 'var(--color-danger)';
            icon = '❌ ';
            break;
        case 'success':
            color = 'var(--color-success)';
            icon = '✅ ';
            break;
        default:
            color = 'var(--color-gray-500)';
            icon = '';
    }

    statusElement.innerHTML = `
    <p style="font-size: var(--font-size-sm); color: ${color};">
      ${icon}${mensaje}
    </p>
  `;
}

/**
 * Limpia el transcript
 */
export function limpiarTranscript() {
    if (transcriptElement) {
        transcriptElement.textContent = 'Aquí aparecerá lo que diga...';
        transcriptElement.classList.remove('active');
    }
}

/**
 * Establece el texto del transcript
 * @param {string} texto - Texto a mostrar
 */
export function setTranscript(texto) {
    if (transcriptElement) {
        transcriptElement.textContent = texto;
        transcriptElement.classList.add('active');
    }
}

/**
 * Verifica si está escuchando
 * @returns {boolean} true si está escuchando
 */
export function verificarEscuchando() {
    return estaEscuchando();
}

/**
 * Detiene la escucha
 */
export function pararEscucha() {
    detenerEscucha();
}
