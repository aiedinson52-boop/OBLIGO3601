import { obtenerTareasCumplidas, marcarComoPendiente, eliminarTarea } from '../services/TaskStorage.js';
import { ESTADOS } from '../models/Task.js';
import { formatearFecha } from '../data/colombianHolidays.js';

let containerElement = null;
let tareasCumplidas = [];
let onTaskUpdateCallback = null;

export async function inicializarCompletedTaskList(container, opciones = {}) {
    containerElement = container;
    onTaskUpdateCallback = opciones.onUpdate || null;
    await cargarTareasCumplidas();
    renderizarListaCumplidas();
}

async function cargarTareasCumplidas() {
    try {
        // CAMBIO CRITICO: Solo obtener cumplidas
        tareasCumplidas = await obtenerTareasCumplidas();
    } catch (error) {
        console.error('Error cargando tareas cumplidas:', error);
        tareasCumplidas = [];
    }
}

function renderizarListaCumplidas() {
    if (!containerElement) return;

    // Ordenar para mostrar las recién completadas arriba
    tareasCumplidas.sort((a, b) => {
        const dateA = new Date(a.actualizadaEn || a.creadaEn || a.fecha);
        const dateB = new Date(b.actualizadaEn || b.creadaEn || b.fecha);
        return dateB - dateA;
    });

    if (tareasCumplidas.length === 0) {
        containerElement.innerHTML = `
            <div class="card" style="border-top: 4px solid var(--color-success);">
                <div class="card-header">
                <h3 class="card-title">Mis Tareas Cumplidas</h3>
            </div>
                <div style="padding: var(--space-4); text-align: center; color: var(--color-gray-500); font-size: var(--font-size-sm);">
                    No hay tareas cumplidas aún. Complétalas del listado superior.
                </div>
            </div>
        `;
        return;
    }

    containerElement.innerHTML = `
        <div class="card" style="border-top: 4px solid var(--color-success);">
            <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
                <h3 class="card-title">Mis Tareas Cumplidas</h3>
                <button class="btn btn-secondary" id="btn-export-excel" style="font-size: var(--font-size-xs); padding: var(--space-1) var(--space-2);">
                    📥 Descargar Excel
                </button>
            </div>
            
            <div class="lista-tareas-cumplidas" style="max-height: 450px; overflow-y: auto; display: flex; flex-direction: column; gap: var(--space-2);">
                ${tareasCumplidas.map(renderizarItemCumplido).join('')}
            </div>
        </div>
    `;

    // Event listeners
    const btnExport = containerElement.querySelector('#btn-export-excel');
    if (btnExport) {
        btnExport.addEventListener('click', exportarExcel);
    }

    containerElement.querySelectorAll('[data-action="restaurar"]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.target.dataset.id;
            await restaurarTarea(id);
        });
    });
}

function renderizarItemCumplido(tarea) {
    const fecha = new Date(tarea.fecha + 'T12:00:00');

    return `
        <div class="task-item-compact" style="background: var(--color-bg-secondary); padding: var(--space-2); border-radius: var(--radius-sm); border-left: 3px solid var(--color-success);">
            <div style="display: flex; justify-content: space-between; gap: var(--space-2);">
                <div style="flex: 1;">
                    <div style="font-weight: 500; text-decoration: line-through; color: var(--color-gray-500);">${escapeHtml(tarea.titulo)}</div>
                    <div style="font-size: var(--font-size-xs); color: var(--color-gray-400);">
                        ${formatearFecha(fecha, { formato: 'corto' })}
                    </div>
                </div>
                <!-- Opcional: Botón para restaurar si se desea permitir desde aquí -->
                <button class="btn btn-ghost" data-action="restaurar" data-id="${tarea.id}" title="Restaurar a pendientes">↩️</button>
            </div>
        </div>
    `;
}

async function restaurarTarea(id) {
    try {
        await marcarComoPendiente(id);
        if (onTaskUpdateCallback) onTaskUpdateCallback();
    } catch (error) {
        console.error('Error restaurando tarea:', error);
    }
}

function exportarExcel() {
    if (!window.XLSX) {
        alert('La librería de Excel no está cargada. Por favor recargue la página.');
        return;
    }

    try {
        const data = tareasCumplidas.map(t => ({
            Titulo: t.titulo,
            Fecha: t.fecha,
            Hora: t.hora,
            Prioridad: t.prioridad,
            Contexto: t.contexto,
            Estado: t.estado,
            Descripcion: t.descripcion || ''
        }));

        const ws = window.XLSX.utils.json_to_sheet(data);
        const wb = window.XLSX.utils.book_new();
        window.XLSX.utils.book_append_sheet(wb, ws, "Tareas Cumplidas");

        const nombreArchivo = `mis_tareas_cumplidas_${new Date().toISOString().split('T')[0]}.xlsx`;
        window.XLSX.writeFile(wb, nombreArchivo);
    } catch (error) {
        console.error('Error exportando a Excel:', error);
        alert('Hubo un error al exportar.');
    }
}

export async function recargarCompletedTaskList() {
    await cargarTareasCumplidas();
    renderizarListaCumplidas();
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
