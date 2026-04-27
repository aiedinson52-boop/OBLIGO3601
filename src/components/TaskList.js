/**
 * Componente de lista de tareas
 * Muestra tareas con filtros y acciones rápidas
 */

import { obtenerTareasPendientes, marcarComoCumplida, marcarComoPendiente, eliminarTarea } from '../services/TaskStorage.js';
import { ETIQUETAS_PRIORIDAD, ETIQUETAS_CONTEXTO, formatearHora12, ESTADOS } from '../models/Task.js';
import { formatearFecha } from '../data/colombianHolidays.js';
import { calcularTiempoRestante } from '../services/AlertService.js';
import { subirEvidencia, eliminarEvidencia, diasHastaExpiracion } from '../services/EvidenceService.js';

let containerElement = null;
let tareas = [];
let filtroActual = 'todos';
let onTaskUpdateCallback = null;
let currentUserId = null; // ID del usuario cuyas tareas estamos viendo

/**
 * Inicializa el componente de lista de tareas
 * @param {HTMLElement} container - Contenedor del componente
 * @param {Object} opciones - Opciones de configuración
 */
export async function inicializarListaTareas(container, opciones = {}) {
  containerElement = container;
  onTaskUpdateCallback = opciones.onUpdate || null;
  currentUserId = opciones.userId || null;

  await cargarTareas();
  renderizarLista();
}

/**
 * Carga las tareas desde el almacenamiento
 */
async function cargarTareas() {
  try {
    // CAMBIO CRITICO: Solo obtener pendientes
    tareas = await obtenerTareasPendientes(currentUserId);
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
        <h3 class="card-title">📋 Mis Tareas Penidientes</h3>
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

  // Event listeners para botones de evidencia
  containerElement.querySelectorAll('[data-evidence-upload]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tareaId = e.currentTarget.dataset.evidenceUpload;
      manejarAdjuntarEvidencia(tareaId);
    });
  });

  containerElement.querySelectorAll('[data-evidence-view]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const url = e.currentTarget.dataset.evidenceView;
      window.open(url, '_blank');
    });
  });

  containerElement.querySelectorAll('[data-evidence-delete]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const tareaId = e.currentTarget.dataset.evidenceDelete;
      await manejarEliminarEvidencia(tareaId);
    });
  });
}

/**
 * Filtra las tareas según el filtro seleccionado
 * @returns {Array} Tareas filtradas
 */
function filtrarTareas() {
  const hoy = new Date();
  const hoyStr = `${hoy.getFullYear()}-${(hoy.getMonth() + 1).toString().padStart(2, '0')}-${hoy.getDate().toString().padStart(2, '0')}`;

  // Las tareas ya vienen filtradas por ESTADO desde el storage, pero re-confirmamos por seguridad
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
  const esCumplida = tarea.estado === ESTADOS.CUMPLIDA; // Should be false here generally
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
        ${renderizarBotonEvidencia(tarea)}
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
        await marcarComoCumplida(id, currentUserId);
        mostrarNotificacion('Tarea marcada como cumplida', 'success');
        break;

      case 'pendiente':
        await marcarComoPendiente(id, currentUserId);
        mostrarNotificacion('Tarea marcada como pendiente', 'info');
        break;

      case 'eliminar':
        // Solicitar contraseña para eliminar tarea pendiente
        const passwordCorrect = await mostrarDialogoContrasena();
        if (passwordCorrect) {
          await eliminarTarea(id, currentUserId);
          mostrarNotificacion('Tarea eliminada', 'warning');
        } else {
          return; // No eliminar si la contraseña es incorrecta o se cancela
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
 * Muestra un diálogo para solicitar contraseña de confirmación para eliminar tarea
 * @returns {Promise<boolean>} true si la contraseña es correcta, false en caso contrario
 */
function mostrarDialogoContrasena() {
  return new Promise((resolve) => {
    // Crear el overlay del modal
    const overlay = document.createElement('div');
    overlay.className = 'password-modal-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10000;
      backdrop-filter: blur(4px);
    `;

    // Crear el contenido del modal
    const modal = document.createElement('div');
    modal.className = 'password-modal';
    modal.style.cssText = `
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      border-radius: 16px;
      padding: 24px;
      max-width: 400px;
      width: 90%;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1);
      animation: modalSlideIn 0.3s ease-out;
    `;

    modal.innerHTML = `
      <style>
        @keyframes modalSlideIn {
          from {
            opacity: 0;
            transform: translateY(-20px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-8px); }
          75% { transform: translateX(8px); }
        }
        .password-modal-title {
          color: #fff;
          font-size: 1.25rem;
          font-weight: 600;
          margin-bottom: 8px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .password-modal-subtitle {
          color: #a0aec0;
          font-size: 0.875rem;
          margin-bottom: 20px;
        }
        .password-input-container {
          position: relative;
          margin-bottom: 16px;
        }
        .password-input {
          width: 100%;
          padding: 12px 44px 12px 16px;
          border: 2px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.05);
          color: #fff;
          font-size: 1rem;
          transition: all 0.3s ease;
          box-sizing: border-box;
        }
        .password-input:focus {
          outline: none;
          border-color: #6366f1;
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2);
        }
        .password-input.error {
          border-color: #ef4444;
          animation: shake 0.4s ease-in-out;
        }
        .password-toggle {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          color: #a0aec0;
          cursor: pointer;
          font-size: 1.2rem;
          padding: 4px;
        }
        .password-toggle:hover {
          color: #fff;
        }
        .password-error-msg {
          color: #ef4444;
          font-size: 0.8rem;
          margin-top: -12px;
          margin-bottom: 16px;
          display: none;
        }
        .password-error-msg.show {
          display: block;
        }
        .password-modal-buttons {
          display: flex;
          gap: 12px;
          justify-content: flex-end;
        }
        .password-btn {
          padding: 10px 20px;
          border-radius: 8px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          border: none;
          font-size: 0.9rem;
        }
        .password-btn-cancel {
          background: rgba(255, 255, 255, 0.1);
          color: #a0aec0;
        }
        .password-btn-cancel:hover {
          background: rgba(255, 255, 255, 0.15);
          color: #fff;
        }
        .password-btn-confirm {
          background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
          color: #fff;
        }
        .password-btn-confirm:hover {
          background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
          transform: translateY(-1px);
        }
      </style>
      <div class="password-modal-title">
        🔐 Confirmación Requerida
      </div>
      <div class="password-modal-subtitle">
        Para eliminar esta tarea, ingrese la contraseña de administrador.
      </div>
      <div class="password-input-container">
        <input type="password" class="password-input" id="delete-password" placeholder="Ingrese la contraseña" autocomplete="off">
        <button type="button" class="password-toggle" id="toggle-password">👁️</button>
      </div>
      <div class="password-error-msg" id="password-error">
        ❌ Contraseña incorrecta. Intente nuevamente.
      </div>
      <div class="password-modal-buttons">
        <button class="password-btn password-btn-cancel" id="cancel-delete">Cancelar</button>
        <button class="password-btn password-btn-confirm" id="confirm-delete">Eliminar</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Referencias a elementos
    const passwordInput = modal.querySelector('#delete-password');
    const toggleBtn = modal.querySelector('#toggle-password');
    const cancelBtn = modal.querySelector('#cancel-delete');
    const confirmBtn = modal.querySelector('#confirm-delete');
    const errorMsg = modal.querySelector('#password-error');

    // Focus en el input
    setTimeout(() => passwordInput.focus(), 100);

    // Toggle visibilidad de contraseña
    toggleBtn.addEventListener('click', () => {
      const isPassword = passwordInput.type === 'password';
      passwordInput.type = isPassword ? 'text' : 'password';
      toggleBtn.textContent = isPassword ? '🙈' : '👁️';
    });

    // Función para cerrar el modal
    const cerrarModal = () => {
      overlay.style.opacity = '0';
      setTimeout(() => overlay.remove(), 200);
    };

    // Cancelar
    cancelBtn.addEventListener('click', () => {
      cerrarModal();
      resolve(false);
    });

    // Click fuera del modal para cancelar
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        cerrarModal();
        resolve(false);
      }
    });

    // Confirmar eliminación
    const verificarContrasena = () => {
      const PASSWORD_CORRECTA = 'controltotal';
      const inputValue = passwordInput.value;

      if (inputValue === PASSWORD_CORRECTA) {
        cerrarModal();
        resolve(true);
      } else {
        passwordInput.classList.add('error');
        errorMsg.classList.add('show');
        passwordInput.value = '';
        passwordInput.focus();

        // Remover clase de error después de la animación
        setTimeout(() => {
          passwordInput.classList.remove('error');
        }, 400);
      }
    };

    confirmBtn.addEventListener('click', verificarContrasena);

    // Enter para confirmar
    passwordInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        verificarContrasena();
      } else if (e.key === 'Escape') {
        cerrarModal();
        resolve(false);
      }
    });
  });
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
 * Renderiza el botón de evidencia junto a la hora
 * @param {Object} tarea - Tarea actual
 * @returns {string} HTML del botón
 */
function renderizarBotonEvidencia(tarea) {
  if (tarea.evidencia && tarea.evidencia.url) {
    const diasRestantes = diasHastaExpiracion(tarea.evidencia.expiraEn);
    const colorDias = diasRestantes <= 5 ? '#ef4444' : diasRestantes <= 15 ? '#f59e0b' : '#10b981';
    return `
      <span class="evidence-attached" style="display: inline-flex; align-items: center; gap: 4px;">
        <button class="btn-evidence-view" data-evidence-view="${tarea.evidencia.url}" title="Ver evidencia: ${escapeHtml(tarea.evidencia.nombreOriginal)}" style="
          background: linear-gradient(135deg, #10b981, #059669);
          color: white;
          border: none;
          padding: 3px 8px;
          border-radius: 6px;
          font-size: 0.7rem;
          font-weight: 600;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 3px;
          transition: all 0.2s ease;
          box-shadow: 0 2px 4px rgba(16, 185, 129, 0.3);
        ">📎 Ver PDF</button>
        <span style="font-size: 0.6rem; color: ${colorDias}; font-weight: 500;" title="Expira en ${diasRestantes} día(s)">${diasRestantes}d</span>
        <button class="btn-evidence-delete" data-evidence-delete="${tarea.id}" title="Eliminar evidencia" style="
          background: none;
          border: none;
          color: #ef4444;
          cursor: pointer;
          font-size: 0.7rem;
          padding: 2px;
          opacity: 0.7;
          transition: opacity 0.2s;
        ">✕</button>
      </span>
    `;
  }

  return `
    <button class="btn-evidence-upload" data-evidence-upload="${tarea.id}" title="Adjuntar evidencia PDF (máx. 300 KB)" style="
      background: linear-gradient(135deg, #6366f1, #4f46e5);
      color: white;
      border: none;
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 0.7rem;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 3px;
      transition: all 0.2s ease;
      box-shadow: 0 2px 6px rgba(99, 102, 241, 0.3);
      white-space: nowrap;
    ">📎 Adjuntar Evidencia</button>
  `;
}

/**
 * Maneja la acción de adjuntar evidencia
 * @param {string} tareaId - ID de la tarea
 */
function manejarAdjuntarEvidencia(tareaId) {
  // Crear input file oculto
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/pdf';
  input.style.display = 'none';

  input.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Mostrar indicador de carga
    const btn = containerElement.querySelector(`[data-evidence-upload="${tareaId}"]`);
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '⏳ Subiendo...';
      btn.style.opacity = '0.7';
    }

    try {
      await subirEvidencia(file, tareaId, currentUserId);
      mostrarNotificacion('✅ Evidencia adjuntada correctamente', 'success');

      // Recargar lista
      await cargarTareas();
      renderizarLista();
    } catch (error) {
      console.error('Error adjuntando evidencia:', error);
      mostrarNotificacion(`❌ ${error.message}`, 'error');

      // Restaurar botón
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '📎 Adjuntar Evidencia';
        btn.style.opacity = '1';
      }
    }

    input.remove();
  });

  document.body.appendChild(input);
  input.click();
}

/**
 * Maneja la eliminación de evidencia de una tarea
 * @param {string} tareaId - ID de la tarea
 */
async function manejarEliminarEvidencia(tareaId) {
  const tarea = tareas.find(t => t.id === tareaId);
  if (!tarea || !tarea.evidencia) return;

  if (!confirm('¿Desea eliminar la evidencia adjunta?')) return;

  try {
    await eliminarEvidencia(tarea.evidencia.storagePath, tareaId, currentUserId);
    mostrarNotificacion('🗑️ Evidencia eliminada', 'info');

    // Recargar lista
    await cargarTareas();
    renderizarLista();
  } catch (error) {
    console.error('Error eliminando evidencia:', error);
    mostrarNotificacion(`❌ Error al eliminar: ${error.message}`, 'error');
  }
}

/**
 * Obtiene las tareas actuales
 * @returns {Array} Array de tareas
 */
export function obtenerTareasActuales() {
  return tareas;
}
