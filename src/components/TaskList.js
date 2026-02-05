/**
 * Componente de lista de tareas
 * Muestra tareas con filtros y acciones rápidas
 */

import { obtenerTodasLasTareas, marcarComoCumplida, marcarComoPendiente, eliminarTarea } from '../services/TaskStorage.js';
import { ETIQUETAS_PRIORIDAD, ETIQUETAS_CONTEXTO, formatearHora12, ESTADOS } from '../models/Task.js';
import { formatearFecha } from '../data/colombianHolidays.js';
import { calcularTiempoRestante } from '../services/AlertService.js';

let containerElement = null;
let tareas = [];
let filtroActual = 'todos';
let onTaskUpdateCallback = null;

/**
 * Inicializa el componente de lista de tareas
 * @param {HTMLElement} container - Contenedor del componente
 * @param {Object} opciones - Opciones de configuración
 */
export async function inicializarListaTareas(container, opciones = {}) {
  containerElement = container;
  onTaskUpdateCallback = opciones.onUpdate || null;

  await cargarTareas();
  renderizarLista();
}

/**
 * Carga las tareas desde el almacenamiento
 */
async function cargarTareas() {
  try {
    tareas = await obtenerTodasLasTareas();
  } catch (error) {
    console.error('Error cargando tareas:', error);
    tareas = [];
  }
}

/**
 * Renderiza la lista de tareas
 */
function renderizarLista() {
  const tareasFiltradas = filtrarTareas();

  containerElement.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">📋 Mis Tareas</h3>
        <select class="form-input form-select" id="filtro-tareas" style="width: auto; min-width: 120px;">
          <option value="todos" ${filtroActual === 'todos' ? 'selected' : ''}>Pendientes</option>
          <option value="hoy" ${filtroActual === 'hoy' ? 'selected' : ''}>Hoy</option>
          <option value="semana" ${filtroActual === 'semana' ? 'selected' : ''}>Esta semana</option>
        </select>
      </div>
      
      <div id="lista-tareas" class="lista-tareas">
        ${tareasFiltradas.length === 0 ? renderizarEstadoVacio() : ''}
        ${tareasFiltradas.map(renderizarTareaCard).join('')}
      </div>
    </div>
  `;

  // Event listeners
  containerElement.querySelector('#filtro-tareas').addEventListener('change', (e) => {
    filtroActual = e.target.value;
    renderizarLista();
  });

  // Event listeners para acciones de tareas
  containerElement.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', manejarAccionTarea);
  });
}

/**
 * Filtra las tareas según el filtro seleccionado
 * @returns {Array} Tareas filtradas
 */
function filtrarTareas() {
  const hoy = new Date();
  const hoyStr = `${hoy.getFullYear()}-${(hoy.getMonth() + 1).toString().padStart(2, '0')}-${hoy.getDate().toString().padStart(2, '0')}`;

  // Siempre excluir tareas cumplidas de esta lista principal (Hardcoded 'Pendiente' for safety)
  const tareasPendientes = tareas.filter(t => t.estado === ESTADOS.PENDIENTE);

  switch (filtroActual) {
    case 'pendientes':
    case 'todos': // 'todos' ahora es alias de pendientes
      return tareasPendientes;

    case 'hoy':
      return tareasPendientes.filter(t => t.fecha === hoyStr);

    case 'semana':
      const finSemana = new Date(hoy);
      finSemana.setDate(finSemana.getDate() + 7);
      const finSemanaStr = `${finSemana.getFullYear()}-${(finSemana.getMonth() + 1).toString().padStart(2, '0')}-${finSemana.getDate().toString().padStart(2, '0')}`;
      return tareasPendientes.filter(t => t.fecha >= hoyStr && t.fecha <= finSemanaStr);

    default:
      return tareasPendientes;
  }
}

/**
 * Renderiza una tarjeta de tarea
 * @param {Object} tarea - Tarea a renderizar
 * @returns {string} HTML de la tarjeta
 */
function renderizarTareaCard(tarea) {
  const fecha = new Date(tarea.fecha + 'T12:00:00');
  const esCumplida = tarea.estado === ESTADOS.CUMPLIDA;
  const tiempoRestante = esCumplida ? null : calcularTiempoRestante(tarea);

  return `
    <div class="task-card priority-${tarea.prioridad} ${esCumplida ? 'completed' : ''}" data-id="${tarea.id}">
      <div class="task-header" style="display: flex; justify-content: space-between; align-items: flex-start;">
        <h4 class="task-title">${escapeHtml(tarea.titulo)}</h4>
        <span class="status-indicator ${esCumplida ? 'cumplida' : 'pendiente'}">
          ${esCumplida ? 'Cumplida' : 'Pendiente'}
        </span>
      </div>
      
      <div class="task-meta">
        <span class="task-badge">📅 ${formatearFecha(fecha, { formato: 'corto' })}</span>
        <span class="task-badge">🕐 ${formatearHora12(tarea.hora)}</span>
        <span class="task-badge context-${tarea.contexto}">${getContextoIcon(tarea.contexto)} ${ETIQUETAS_CONTEXTO[tarea.contexto]}</span>
        <span class="task-badge priority-badge">${getPrioridadIcon(tarea.prioridad)} ${ETIQUETAS_PRIORIDAD[tarea.prioridad]}</span>
      </div>
      
      ${tiempoRestante && !tiempoRestante.vencida ? `
        <div class="task-time-remaining" style="margin-top: var(--space-2); font-size: var(--font-size-xs); color: var(--color-gray-500);">
          ⏱️ ${tiempoRestante.texto}
        </div>
      ` : ''}
      
      ${tiempoRestante && tiempoRestante.vencida ? `
        <div class="task-time-remaining" style="margin-top: var(--space-2); font-size: var(--font-size-xs); color: var(--color-danger);">
          ⚠️ ${tiempoRestante.texto}
        </div>
      ` : ''}
      
      <div class="task-actions" style="margin-top: var(--space-3); display: flex; gap: var(--space-2);">
        ${esCumplida ? `
          <button class="btn btn-secondary" data-action="pendiente" data-id="${tarea.id}" style="font-size: var(--font-size-xs); padding: var(--space-2) var(--space-3);">
            ↩️ Marcar Pendiente
          </button>
        ` : `
          <button class="btn btn-success" data-action="cumplida" data-id="${tarea.id}" style="font-size: var(--font-size-xs); padding: var(--space-2) var(--space-3);">
            ✓ Cumplida
          </button>
        `}
        <button class="btn btn-danger" data-action="eliminar" data-id="${tarea.id}" style="font-size: var(--font-size-xs); padding: var(--space-2) var(--space-3);">
          🗑️
        </button>
      </div>
    </div>
  `;
}

/**
 * Renderiza el estado vacío
 * @returns {string} HTML del estado vacío
 */
function renderizarEstadoVacio() {
  const mensajes = {
    'todos': 'No hay tareas pendientes. ¡Excelente trabajo!',
    'pendientes': 'No hay tareas pendientes. ¡Excelente trabajo!',
    'hoy': 'No tienes tareas pendientes para hoy.',
    'semana': 'No tienes tareas pendientes para esta semana.'
  };

  return `
    <div class="empty-state">
      <div class="empty-state-icon">📝</div>
      <h3 class="empty-state-title">Sin tareas</h3>
      <p class="empty-state-text">${mensajes[filtroActual]}</p>
    </div>
  `;
}

/**
 * Maneja las acciones de las tareas
 * @param {Event} e - Evento de click
 */
async function manejarAccionTarea(e) {
  const action = e.target.dataset.action;
  const id = e.target.dataset.id;

  if (!action || !id) return;

  try {
    switch (action) {
      case 'cumplida':
        await marcarComoCumplida(id);
        mostrarNotificacion('Tarea marcada como cumplida', 'success');
        break;

      case 'pendiente':
        await marcarComoPendiente(id);
        mostrarNotificacion('Tarea marcada como pendiente', 'info');
        break;

      case 'eliminar':
        if (confirm('¿Está seguro de que desea eliminar esta tarea?')) {
          await eliminarTarea(id);
          mostrarNotificacion('Tarea eliminada', 'warning');
        } else {
          return;
        }
        break;
    }

    // Recargar lista
    await cargarTareas();
    renderizarLista();

    // Callback de actualización
    if (onTaskUpdateCallback) {
      onTaskUpdateCallback();
    }
  } catch (error) {
    console.error('Error en acción de tarea:', error);
    mostrarNotificacion('Error al procesar la acción', 'error');
  }
}

/**
 * Muestra una notificación toast
 * @param {string} mensaje - Mensaje a mostrar
 * @param {string} tipo - Tipo de notificación
 */
function mostrarNotificacion(mensaje, tipo = 'info') {
  // Buscar o crear contenedor de toasts
  let toastContainer = document.querySelector('.toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }

  const iconos = {
    'success': '✅',
    'error': '❌',
    'warning': '⚠️',
    'info': 'ℹ️'
  };

  const toast = document.createElement('div');
  toast.className = `toast ${tipo}`;
  toast.innerHTML = `
    <span class="toast-icon">${iconos[tipo]}</span>
    <div class="toast-content">
      <p class="toast-message">${mensaje}</p>
    </div>
    <button class="toast-close" aria-label="Cerrar">×</button>
  `;

  toastContainer.appendChild(toast);

  // Cerrar al hacer clic
  toast.querySelector('.toast-close').addEventListener('click', () => {
    toast.remove();
  });

  // Auto-cerrar después de 3 segundos
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

/**
 * Recarga la lista de tareas
 */
export async function recargarListaTareas() {
  await cargarTareas();
  renderizarLista();
}

/**
 * Obtiene el ícono de prioridad
 * @param {string} prioridad - Prioridad
 * @returns {string} Ícono
 */
function getPrioridadIcon(prioridad) {
  const iconos = { 'alta': '🔴', 'media': '🟡', 'baja': '🟢' };
  return iconos[prioridad] || '⚪';
}

/**
 * Obtiene el ícono de contexto
 * @param {string} contexto - Contexto
 * @returns {string} Ícono
 */
function getContextoIcon(contexto) {
  const iconos = { 'trabajo': '💼', 'personal': '👤', 'familiar': '👨‍👩‍👧‍👦' };
  return iconos[contexto] || '📋';
}

/**
 * Escapa HTML
 * @param {string} str - String a escapar
 * @returns {string} String escapado
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Obtiene las tareas actuales
 * @returns {Array} Array de tareas
 */
export function obtenerTareasActuales() {
  return tareas;
}
