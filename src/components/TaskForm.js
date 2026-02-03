/**
 * Componente de diálogo de confirmación de tarea
 * Implementa la confirmación obligatoria antes de guardar
 */

import { ETIQUETAS_PRIORIDAD, ETIQUETAS_CONTEXTO, formatearHora12 } from '../models/Task.js';
import { formatearFecha } from '../data/colombianHolidays.js';

let dialogElement = null;
let onConfirmCallback = null;
let onModifyCallback = null;
let onCancelCallback = null;
let currentTask = null;

/**
 * Inicializa el componente de confirmación
 * @param {HTMLElement} container - Contenedor donde agregar el dialog
 */
export function inicializarConfirmacion(container) {
    // Crear el elemento del diálogo
    dialogElement = document.createElement('div');
    dialogElement.id = 'confirmation-dialog';
    dialogElement.className = 'confirmation-dialog';
    dialogElement.setAttribute('role', 'dialog');
    dialogElement.setAttribute('aria-modal', 'true');
    dialogElement.setAttribute('aria-labelledby', 'confirmation-title');

    dialogElement.innerHTML = `
    <div class="confirmation-content">
      <h2 id="confirmation-title" class="confirmation-title">He entendido la siguiente tarea:</h2>
      
      <div class="confirmation-details" id="confirmation-details">
        <!-- Se llena dinámicamente -->
      </div>
      
      <p class="confirmation-question" style="margin-bottom: var(--space-4); color: var(--color-gray-600);">
        ¿Desea confirmarla y guardarla?
      </p>
      
      <div class="confirmation-actions">
        <button class="btn btn-secondary" id="btn-cancel">
          Cancelar
        </button>
        <button class="btn btn-secondary" id="btn-modify">
          Modificar
        </button>
        <button class="btn btn-success" id="btn-confirm">
          ✓ Confirmar
        </button>
      </div>
    </div>
  `;

    container.appendChild(dialogElement);

    // Event listeners
    dialogElement.querySelector('#btn-confirm').addEventListener('click', confirmarTarea);
    dialogElement.querySelector('#btn-modify').addEventListener('click', modificarTarea);
    dialogElement.querySelector('#btn-cancel').addEventListener('click', cancelarConfirmacion);

    // Cerrar al hacer clic fuera
    dialogElement.addEventListener('click', (e) => {
        if (e.target === dialogElement) {
            cancelarConfirmacion();
        }
    });

    // Cerrar con Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && dialogElement.classList.contains('active')) {
            cancelarConfirmacion();
        }
    });
}

/**
 * Muestra el diálogo de confirmación con los datos de la tarea
 * @param {Object} tarea - Datos de la tarea a confirmar
 * @param {Object} callbacks - Callbacks para las acciones
 */
export function mostrarConfirmacion(tarea, callbacks = {}) {
    if (!dialogElement) {
        console.error('El componente de confirmación no está inicializado');
        return;
    }

    currentTask = tarea;
    onConfirmCallback = callbacks.onConfirm || null;
    onModifyCallback = callbacks.onModify || null;
    onCancelCallback = callbacks.onCancel || null;

    // Llenar los detalles
    const detailsContainer = dialogElement.querySelector('#confirmation-details');
    const fecha = new Date(tarea.fecha + 'T12:00:00');

    detailsContainer.innerHTML = `
    <div class="confirmation-row">
      <span class="confirmation-label">Tarea:</span>
      <span class="confirmation-value">${escapeHtml(tarea.titulo)}</span>
    </div>
    <div class="confirmation-row">
      <span class="confirmation-label">Fecha:</span>
      <span class="confirmation-value">${formatearFecha(fecha, { incluirDia: true })}</span>
    </div>
    <div class="confirmation-row">
      <span class="confirmation-label">Hora:</span>
      <span class="confirmation-value">${formatearHora12(tarea.hora)}</span>
    </div>
    <div class="confirmation-row">
      <span class="confirmation-label">Prioridad:</span>
      <span class="confirmation-value">
        <span class="task-badge priority-${tarea.prioridad}">${getPrioridadIcon(tarea.prioridad)} ${ETIQUETAS_PRIORIDAD[tarea.prioridad]}</span>
      </span>
    </div>
    <div class="confirmation-row">
      <span class="confirmation-label">Contexto:</span>
      <span class="confirmation-value">
        <span class="task-badge context-${tarea.contexto}">${getContextoIcon(tarea.contexto)} ${ETIQUETAS_CONTEXTO[tarea.contexto]}</span>
      </span>
    </div>
  `;

    // Mostrar el diálogo
    dialogElement.classList.add('active');

    // Focus en el botón de confirmar
    setTimeout(() => {
        dialogElement.querySelector('#btn-confirm').focus();
    }, 100);
}

/**
 * Cierra el diálogo de confirmación
 */
export function cerrarConfirmacion() {
    if (dialogElement) {
        dialogElement.classList.remove('active');
        currentTask = null;
    }
}

/**
 * Manejador para confirmar la tarea
 */
function confirmarTarea() {
    if (onConfirmCallback && currentTask) {
        onConfirmCallback(currentTask);
    }
    cerrarConfirmacion();
}

/**
 * Manejador para modificar la tarea
 */
function modificarTarea() {
    if (onModifyCallback && currentTask) {
        onModifyCallback(currentTask);
    }
    cerrarConfirmacion();
}

/**
 * Manejador para cancelar la confirmación
 */
function cancelarConfirmacion() {
    if (onCancelCallback) {
        onCancelCallback();
    }
    cerrarConfirmacion();
}

/**
 * Obtiene el ícono para una prioridad
 * @param {string} prioridad - Prioridad
 * @returns {string} Ícono
 */
function getPrioridadIcon(prioridad) {
    const iconos = {
        'alta': '🔴',
        'media': '🟡',
        'baja': '🟢'
    };
    return iconos[prioridad] || '⚪';
}

/**
 * Obtiene el ícono para un contexto
 * @param {string} contexto - Contexto
 * @returns {string} Ícono
 */
function getContextoIcon(contexto) {
    const iconos = {
        'trabajo': '💼',
        'personal': '👤',
        'familiar': '👨‍👩‍👧‍👦'
    };
    return iconos[contexto] || '📋';
}

/**
 * Escapa caracteres HTML para prevenir XSS
 * @param {string} str - String a escapar
 * @returns {string} String escapado
 */
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/**
 * Verifica si el diálogo está visible
 * @returns {boolean} true si está visible
 */
export function estaVisible() {
    return dialogElement && dialogElement.classList.contains('active');
}
