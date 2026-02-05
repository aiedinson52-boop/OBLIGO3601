/**
 * Componente de Calendario Colombiano
 * Vista mensual con festivos, tareas y navegación
 */

import { MESES, DIAS_SEMANA, obtenerFestivos, esFestivo, formatearFecha } from '../data/colombianHolidays.js';
import { obtenerTareasPorMes, obtenerTareasPorFecha } from '../services/TaskStorage.js';

/**
 * Estado del calendario
 */
let estadoCalendario = {
    year: 2026,
    month: 1, // Febrero (0-indexed: 1)
    selectedDate: null,
    festivos: [],
    tareasPorDia: new Map(),
    vistaAnual: false
};

/**
 * Callback para cuando se selecciona una fecha
 */
let onDateSelect = null;

/**
 * Inicializa el calendario
 * @param {HTMLElement} container - Contenedor del calendario
 * @param {Object} opciones - Opciones de configuración
 */
export async function inicializarCalendario(container, opciones = {}) {
    const hoy = new Date();
    estadoCalendario.year = opciones.year || hoy.getFullYear();
    estadoCalendario.month = opciones.month !== undefined ? opciones.month : hoy.getMonth();

    if (opciones.onDateSelect) {
        onDateSelect = opciones.onDateSelect;
    }

    await cargarDatosCalendario();
    renderizarCalendario(container);
}

/**
 * Carga festivos y tareas del mes actual
 */
async function cargarDatosCalendario() {
    estadoCalendario.festivos = obtenerFestivos(estadoCalendario.year);

    try {
        const tareas = await obtenerTareasPorMes(estadoCalendario.year, estadoCalendario.month);
        estadoCalendario.tareasPorDia = new Map();

        tareas.forEach(tarea => {
            const fecha = tarea.fecha;
            if (!estadoCalendario.tareasPorDia.has(fecha)) {
                estadoCalendario.tareasPorDia.set(fecha, []);
            }
            estadoCalendario.tareasPorDia.get(fecha).push(tarea);
        });
    } catch (error) {
        console.error('Error cargando tareas:', error);
        estadoCalendario.tareasPorDia = new Map();
    }
}

/**
 * Renderiza el calendario completo
 * @param {HTMLElement} container - Contenedor del calendario
 */
function renderizarCalendario(container) {
    container.innerHTML = `
    <div class="calendar">
      <div class="calendar-header">
        <div class="calendar-nav">
          <button class="calendar-nav-btn" id="btn-prev-month" aria-label="Mes anterior">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M15 18l-6-6 6-6"/>
            </svg>
          </button>
          <button class="calendar-nav-btn" id="btn-next-month" aria-label="Mes siguiente">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 18l6-6-6-6"/>
            </svg>
          </button>
        </div>
        <h2 class="calendar-month-year" id="calendar-title">
          ${MESES[estadoCalendario.month]} ${estadoCalendario.year}
        </h2>
        <div class="calendar-nav">
          <button class="calendar-nav-btn" id="btn-prev-year" aria-label="Año anterior">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 17l-5-5 5-5M18 17l-5-5 5-5"/>
            </svg>
          </button>
          <button class="calendar-nav-btn" id="btn-next-year" aria-label="Año siguiente">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M6 17l5-5-5-5M13 17l5-5-5-5"/>
            </svg>
          </button>
        </div>
      </div>
      
      <div class="calendar-grid" id="calendar-grid">
        ${renderizarCabeceraDias()}
        ${renderizarDiasMes()}
      </div>
      
      <div id="day-summary-container"></div>
    </div>
  `;

    agregarEventosCalendario(container);
}

/**
 * Renderiza la cabecera con los días de la semana
 * @returns {string} HTML de la cabecera
 */
function renderizarCabeceraDias() {
    return DIAS_SEMANA.map(dia =>
        `<div class="calendar-weekday">${dia}</div>`
    ).join('');
}

/**
 * Renderiza los días del mes
 * @returns {string} HTML de los días
 */
function renderizarDiasMes() {
    const { year, month, festivos } = estadoCalendario;
    const primerDia = new Date(year, month, 1);
    const ultimoDia = new Date(year, month + 1, 0);
    const diasEnMes = ultimoDia.getDate();
    const primerDiaSemana = primerDia.getDay(); // 0 = Domingo

    const hoy = new Date();
    const hoyStr = `${hoy.getFullYear()}-${(hoy.getMonth() + 1).toString().padStart(2, '0')}-${hoy.getDate().toString().padStart(2, '0')}`;

    let html = '';

    // Días del mes anterior (relleno)
    const diasMesAnterior = new Date(year, month, 0).getDate();
    for (let i = primerDiaSemana - 1; i >= 0; i--) {
        const dia = diasMesAnterior - i;
        html += `<div class="calendar-day other-month">${dia}</div>`;
    }

    // Días del mes actual
    for (let dia = 1; dia <= diasEnMes; dia++) {
        const fechaStr = `${year}-${(month + 1).toString().padStart(2, '0')}-${dia.toString().padStart(2, '0')}`;
        const fecha = new Date(year, month, dia);

        const clases = ['calendar-day'];

        // Verificar si es hoy
        if (fechaStr === hoyStr) {
            clases.push('today');
        }

        // Verificar si es festivo
        const festivo = esFestivo(fecha, festivos);
        if (festivo) {
            clases.push('holiday');
        }

        // Verificar si tiene tareas pendientes
        if (estadoCalendario.tareasPorDia.has(fechaStr)) {
            const tareasDia = estadoCalendario.tareasPorDia.get(fechaStr);
            if (tareasDia.some(t => t.estado === 'Pendiente')) {
                clases.push('has-tasks');
            }
        }

        // Verificar si está seleccionado
        if (estadoCalendario.selectedDate === fechaStr) {
            clases.push('selected');
        }

        const title = festivo ? festivo.nombre : '';

        html += `<div class="${clases.join(' ')}" data-fecha="${fechaStr}" title="${title}">${dia}</div>`;
    }

    // Días del mes siguiente (relleno)
    const diasRestantes = 42 - (primerDiaSemana + diasEnMes); // 6 filas * 7 días
    for (let i = 1; i <= diasRestantes; i++) {
        html += `<div class="calendar-day other-month">${i}</div>`;
    }

    return html;
}

/**
 * Agrega eventos de navegación al calendario
 * @param {HTMLElement} container - Contenedor del calendario
 */
function agregarEventosCalendario(container) {
    // Navegación de meses
    container.querySelector('#btn-prev-month').addEventListener('click', () => navegarMes(-1, container));
    container.querySelector('#btn-next-month').addEventListener('click', () => navegarMes(1, container));

    // Navegación de años
    container.querySelector('#btn-prev-year').addEventListener('click', () => navegarAnio(-1, container));
    container.querySelector('#btn-next-year').addEventListener('click', () => navegarAnio(1, container));

    // Click en días
    container.querySelector('#calendar-grid').addEventListener('click', async (e) => {
        const diaElement = e.target.closest('.calendar-day:not(.other-month)');
        if (diaElement && diaElement.dataset.fecha) {
            await seleccionarDia(diaElement.dataset.fecha, container);
        }
    });
}

/**
 * Navega entre meses
 * @param {number} direccion - -1 para anterior, 1 para siguiente
 * @param {HTMLElement} container - Contenedor del calendario
 */
async function navegarMes(direccion, container) {
    estadoCalendario.month += direccion;

    if (estadoCalendario.month > 11) {
        estadoCalendario.month = 0;
        estadoCalendario.year++;
    } else if (estadoCalendario.month < 0) {
        estadoCalendario.month = 11;
        estadoCalendario.year--;
    }

    // Limitar a rango 2026-2050
    if (estadoCalendario.year < 2026) {
        estadoCalendario.year = 2026;
        estadoCalendario.month = 0;
    } else if (estadoCalendario.year > 2050) {
        estadoCalendario.year = 2050;
        estadoCalendario.month = 11;
    }

    await cargarDatosCalendario();
    renderizarCalendario(container);
}

/**
 * Navega entre años
 * @param {number} direccion - -1 para anterior, 1 para siguiente
 * @param {HTMLElement} container - Contenedor del calendario
 */
async function navegarAnio(direccion, container) {
    estadoCalendario.year += direccion;

    // Limitar a rango 2026-2050
    if (estadoCalendario.year < 2026) {
        estadoCalendario.year = 2026;
    } else if (estadoCalendario.year > 2050) {
        estadoCalendario.year = 2050;
    }

    await cargarDatosCalendario();
    renderizarCalendario(container);
}

/**
 * Selecciona un día del calendario
 * @param {string} fechaStr - Fecha en formato YYYY-MM-DD
 * @param {HTMLElement} container - Contenedor del calendario
 */
async function seleccionarDia(fechaStr, container) {
    estadoCalendario.selectedDate = fechaStr;

    // Actualizar visualización
    const dias = container.querySelectorAll('.calendar-day');
    dias.forEach(dia => dia.classList.remove('selected'));

    const diaSeleccionado = container.querySelector(`[data-fecha="${fechaStr}"]`);
    if (diaSeleccionado) {
        diaSeleccionado.classList.add('selected');
    }

    // Obtener tareas del día
    const tareas = await obtenerTareasPorFecha(fechaStr);

    // Mostrar resumen del día
    mostrarResumenDia(fechaStr, tareas, container);

    // Callback
    if (onDateSelect) {
        onDateSelect(fechaStr, tareas);
    }
}

/**
 * Muestra el resumen de un día seleccionado
 * @param {string} fechaStr - Fecha seleccionada
 * @param {Array} tareas - Tareas del día
 * @param {HTMLElement} container - Contenedor
 */
function mostrarResumenDia(fechaStr, tareas, container) {
    const summaryContainer = container.querySelector('#day-summary-container');
    const fecha = new Date(fechaStr + 'T12:00:00');

    // Verificar festivo
    const festivo = esFestivo(fecha, estadoCalendario.festivos);

    if (tareas.length === 0 && !festivo) {
        summaryContainer.innerHTML = `
      <div class="day-summary" style="background: linear-gradient(135deg, var(--color-gray-500), var(--color-gray-600));">
        <p class="day-summary-title">${formatearFecha(fecha, { incluirDia: true })}</p>
        <p class="day-summary-text">No hay tareas programadas para este día.</p>
      </div>
    `;
        return;
    }

    let resumenHtml = `<div class="day-summary">`;
    resumenHtml += `<p class="day-summary-title">${formatearFecha(fecha, { incluirDia: true })}</p>`;

    if (festivo) {
        resumenHtml += `<p class="day-summary-text">🎉 <strong>Festivo:</strong> ${festivo.nombre}</p>`;
    }

    if (tareas.length > 0) {
        const pendientes = tareas.filter(t => t.estado === 'Pendiente');
        const cumplidas = tareas.filter(t => t.estado === 'Cumplida');

        resumenHtml += `<p class="day-summary-text">`;
        resumenHtml += `Tienes ${tareas.length} tarea${tareas.length > 1 ? 's' : ''}: `;

        const detalles = tareas.slice(0, 3).map(t => {
            const icon = t.prioridad === 'alta' ? '🔴' : t.prioridad === 'media' ? '🟡' : '🟢';
            return `${t.titulo} (${icon})`;
        });

        resumenHtml += detalles.join(', ');

        if (tareas.length > 3) {
            resumenHtml += ` y ${tareas.length - 3} más`;
        }

        resumenHtml += `</p>`;
    }

    resumenHtml += `</div>`;
    summaryContainer.innerHTML = resumenHtml;
}

/**
 * Recarga el calendario con los datos actuales
 * @param {HTMLElement} container - Contenedor del calendario
 */
export async function recargarCalendario(container) {
    await cargarDatosCalendario();
    renderizarCalendario(container);
}

/**
 * Ir a una fecha específica
 * @param {Date} fecha - Fecha destino
 * @param {HTMLElement} container - Contenedor del calendario
 */
export async function irAFecha(fecha, container) {
    estadoCalendario.year = fecha.getFullYear();
    estadoCalendario.month = fecha.getMonth();
    estadoCalendario.selectedDate = `${fecha.getFullYear()}-${(fecha.getMonth() + 1).toString().padStart(2, '0')}-${fecha.getDate().toString().padStart(2, '0')}`;

    // Validar rango
    if (estadoCalendario.year < 2026 || estadoCalendario.year > 2050) {
        console.warn('Fecha fuera del rango del calendario (2026-2050)');
        return;
    }

    await cargarDatosCalendario();
    renderizarCalendario(container);
}

/**
 * Ir a hoy
 * @param {HTMLElement} container - Contenedor del calendario
 */
export async function irAHoy(container) {
    await irAFecha(new Date(), container);
}

/**
 * Obtiene el estado actual del calendario
 * @returns {Object} Estado del calendario
 */
export function obtenerEstadoCalendario() {
    return { ...estadoCalendario };
}
