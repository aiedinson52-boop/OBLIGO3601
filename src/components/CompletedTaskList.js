import { obtenerTareasCumplidas, marcarComoPendiente, eliminarTarea } from '../services/TaskStorage.js';
import { ESTADOS } from '../models/Task.js';
import { formatearFecha } from '../data/colombianHolidays.js';
import { subirEvidencia, eliminarEvidencia, diasHastaExpiracion } from '../services/EvidenceService.js';

let containerElement = null;
let tareasCumplidas = [];
let onTaskUpdateCallback = null;

let currentUserId = null;

export async function inicializarCompletedTaskList(container, opciones = {}) {
    containerElement = container;
    onTaskUpdateCallback = opciones.onUpdate || null;
    currentUserId = opciones.userId || null;
    await cargarTareasCumplidas();
    renderizarListaCumplidas();
}

async function cargarTareasCumplidas() {
    try {
        // CAMBIO CRITICO: Solo obtener cumplidas
        tareasCumplidas = await obtenerTareasCumplidas(currentUserId);
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
            
            <div class="lista-tareas-cumplidas" style="max-height: 500px; overflow-y: auto; display: flex; flex-direction: column; gap: var(--space-2); scrollbar-width: thin;">
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

    // Evidence event listeners
    containerElement.querySelectorAll('[data-evidence-upload]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tareaId = e.currentTarget.dataset.evidenceUpload;
            manejarAdjuntarEvidenciaCumplida(tareaId);
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
            await manejarEliminarEvidenciaCumplida(tareaId);
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
                    <div style="font-size: var(--font-size-xs); color: var(--color-gray-400); display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 2px;">
                        ${formatearFecha(fecha, { formato: 'corto' })}
                        ${renderizarBotonEvidenciaCumplida(tarea)}
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
        await marcarComoPendiente(id, currentUserId);
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

/**
 * Renderiza el botón de evidencia para tareas cumplidas
 */
function renderizarBotonEvidenciaCumplida(tarea) {
    if (tarea.evidencia && tarea.evidencia.url) {
        const diasRestantes = diasHastaExpiracion(tarea.evidencia.expiraEn);
        const colorDias = diasRestantes <= 5 ? '#ef4444' : diasRestantes <= 15 ? '#f59e0b' : '#10b981';
        return `
            <span style="display: inline-flex; align-items: center; gap: 3px;">
                <button data-evidence-view="${tarea.evidencia.url}" title="Ver: ${escapeHtml(tarea.evidencia.nombreOriginal)}" style="
                    background: linear-gradient(135deg, #10b981, #059669);
                    color: white;
                    border: none;
                    padding: 1px 6px;
                    border-radius: 4px;
                    font-size: 0.6rem;
                    cursor: pointer;
                ">📎 PDF</button>
                <span style="font-size: 0.55rem; color: ${colorDias};">${diasRestantes}d</span>
                <button data-evidence-delete="${tarea.id}" title="Eliminar evidencia" style="
                    background: none; border: none; color: #ef4444; cursor: pointer; font-size: 0.6rem; padding: 1px;
                ">✕</button>
            </span>
        `;
    }

    return `
        <button data-evidence-upload="${tarea.id}" title="Adjuntar evidencia PDF" style="
            background: linear-gradient(135deg, #6366f1, #4f46e5);
            color: white;
            border: none;
            padding: 1px 6px;
            border-radius: 4px;
            font-size: 0.6rem;
            cursor: pointer;
        ">📎 Adjuntar Evidencia</button>
    `;
}

/**
 * Maneja la carga de evidencia en tareas cumplidas
 */
function manejarAdjuntarEvidenciaCumplida(tareaId) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf';
    input.style.display = 'none';

    input.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const btn = containerElement.querySelector(`[data-evidence-upload="${tareaId}"]`);
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '⏳...';
        }

        try {
            await subirEvidencia(file, tareaId, currentUserId);
            await cargarTareasCumplidas();
            renderizarListaCumplidas();
        } catch (error) {
            console.error('Error adjuntando evidencia:', error);
            alert(error.message);
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '📎 Adjuntar Evidencia';
            }
        }

        input.remove();
    });

    document.body.appendChild(input);
    input.click();
}

/**
 * Maneja la eliminación de evidencia en tareas cumplidas
 */
async function manejarEliminarEvidenciaCumplida(tareaId) {
    const tarea = tareasCumplidas.find(t => t.id === tareaId);
    if (!tarea || !tarea.evidencia) return;
    if (!confirm('¿Desea eliminar la evidencia adjunta?')) return;

    try {
        await eliminarEvidencia(tarea.evidencia.storagePath, tareaId, currentUserId);
        await cargarTareasCumplidas();
        renderizarListaCumplidas();
    } catch (error) {
        console.error('Error eliminando evidencia:', error);
        alert('Error al eliminar: ' + error.message);
    }
}
