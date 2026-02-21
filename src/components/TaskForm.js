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
let isSaving = false; // Guard against double-clicks
let escapeHandler = null; // Track keydown handler to avoid duplicates

/**
 * Inicializa el componente de confirmación
 * @param {HTMLElement} container - Contenedor donde agregar el dialog
 */
export function inicializarConfirmacion(container) {
  // CRITICAL FIX: Remove old dialog and listeners to prevent accumulation
  if (dialogElement) {
    dialogElement.remove();
    dialogElement = null;
  }
  if (escapeHandler) {
    document.removeEventListener('keydown', escapeHandler);
    escapeHandler = null;
  }

  // Reset state
  isSaving = false;
  currentTask = null;
  onConfirmCallback = null;
  onModifyCallback = null;
  onCancelCallback = null;

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

  // Event listeners — single binding, no duplicates possible
  dialogElement.querySelector('#btn-confirm').addEventListener('click', confirmarTarea);
  dialogElement.querySelector('#btn-modify').addEventListener('click', modificarTarea);
  dialogElement.querySelector('#btn-cancel').addEventListener('click', cancelarConfirmacion);

  // Cerrar al hacer clic fuera (only if not saving)
  dialogElement.addEventListener('click', (e) => {
    if (e.target === dialogElement && !isSaving) {
      cancelarConfirmacion();
    }
  });

  // Cerrar con Escape — track handler to remove later
  escapeHandler = (e) => {
    if (e.key === 'Escape' && dialogElement && dialogElement.classList.contains('active') && !isSaving) {
      cancelarConfirmacion();
    }
  };
  document.addEventListener('keydown', escapeHandler);
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

  // Reset saving state for new task
  isSaving = false;

  currentTask = tarea;
  onConfirmCallback = callbacks.onConfirm || null;
  onModifyCallback = callbacks.onModify || null;
  onCancelCallback = callbacks.onCancel || null;

  // Reset confirm button state
  const confirmBtn = dialogElement.querySelector('#btn-confirm');
  if (confirmBtn) {
    confirmBtn.disabled = false;
    confirmBtn.textContent = '✓ Confirmar';
  }

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
    if (confirmBtn) confirmBtn.focus();
  }, 100);
}

/**
 * Cierra el diálogo de confirmación
 */
export function cerrarConfirmacion() {
  if (dialogElement) {
    dialogElement.classList.remove('active');
  }
  // NOTE: currentTask is NOT nullified here anymore.
  // It is only cleared explicitly after save completes or on cancel/modify.
}

/**
 * Manejador para confirmar la tarea
 * CRITICAL FIX: Now async — awaits save before closing
 */
async function confirmarTarea() {
  // Double-click guard
  if (isSaving) {
    console.warn('[TaskForm] ⚠️ Save already in progress, ignoring duplicate click');
    return;
  }

  if (!onConfirmCallback || !currentTask) {
    console.error('[TaskForm] ❌ No callback or task available');
    return;
  }

  // Lock the UI
  isSaving = true;
  const confirmBtn = dialogElement.querySelector('#btn-confirm');
  const cancelBtn = dialogElement.querySelector('#btn-cancel');
  const modifyBtn = dialogElement.querySelector('#btn-modify');

  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.textContent = '⏳ Guardando...';
  }
  if (cancelBtn) cancelBtn.disabled = true;
  if (modifyBtn) modifyBtn.disabled = true;

  // Capture task and callback BEFORE any async operation
  const taskToSave = currentTask;
  const callback = onConfirmCallback;

  try {
    console.log('[TaskForm] ▶ Starting save via onConfirm callback...');
    await callback(taskToSave);
    console.log('[TaskForm] ✅ Save callback completed successfully');

    // Only clear state AFTER successful save
    currentTask = null;
    onConfirmCallback = null;
    cerrarConfirmacion();

  } catch (error) {
    console.error('[TaskForm] ❌ Save callback threw error:', error);

    // Re-enable buttons so user can retry or cancel
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = '✓ Reintentar';
    }
    if (cancelBtn) cancelBtn.disabled = false;
    if (modifyBtn) modifyBtn.disabled = false;

    // Dialog stays open — user can retry
  } finally {
    isSaving = false;
  }
}

/**
 * Manejador para modificar la tarea
 */
function modificarTarea() {
  if (isSaving) return; // Don't allow modify during save
  if (onModifyCallback && currentTask) {
    onModifyCallback(currentTask);
  }
  currentTask = null;
  cerrarConfirmacion();
}

/**
 * Manejador para cancelar la confirmación
 */
function cancelarConfirmacion() {
  if (isSaving) return; // Don't allow cancel during save
  if (onCancelCallback) {
    onCancelCallback();
  }
  currentTask = null;
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
