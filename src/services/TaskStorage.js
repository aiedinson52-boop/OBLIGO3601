/**
 * Servicio de almacenamiento de tareas usando IndexedDB
 * Persistencia local de alta capacidad
 */

const DB_NAME = 'AsistenteVozColombiano';
const DB_VERSION = 1;
const STORE_NAME = 'tareas';

let db = null;

/**
 * Inicializa la base de datos IndexedDB
 * @returns {Promise<IDBDatabase>} Base de datos inicializada
 */
export async function inicializarDB() {
    return new Promise((resolve, reject) => {
        if (db) {
            resolve(db);
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            reject(new Error('Error al abrir la base de datos'));
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const database = event.target.result;

            // Crear almacén de tareas si no existe
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });

                // Índices para búsquedas eficientes
                store.createIndex('fecha', 'fecha', { unique: false });
                store.createIndex('estado', 'estado', { unique: false });
                store.createIndex('prioridad', 'prioridad', { unique: false });
                store.createIndex('contexto', 'contexto', { unique: false });
                store.createIndex('fechaEstado', ['fecha', 'estado'], { unique: false });
            }
        };
    });
}

/**
 * Obtiene una transacción de la base de datos
 * @param {string} modo - 'readonly' o 'readwrite'
 * @returns {IDBObjectStore} Store de tareas
 */
async function getStore(modo = 'readonly') {
    if (!db) {
        await inicializarDB();
    }
    const transaction = db.transaction([STORE_NAME], modo);
    return transaction.objectStore(STORE_NAME);
}

/**
 * Guarda una tarea en la base de datos
 * @param {Object} tarea - Tarea a guardar
 * @returns {Promise<Object>} Tarea guardada
 */
export async function guardarTarea(tarea) {
    return new Promise(async (resolve, reject) => {
        try {
            const store = await getStore('readwrite');
            const request = store.put(tarea);

            request.onsuccess = () => {
                resolve(tarea);
            };

            request.onerror = () => {
                reject(new Error('Error al guardar la tarea'));
            };
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Obtiene una tarea por su ID
 * @param {string} id - ID de la tarea
 * @returns {Promise<Object|null>} Tarea encontrada o null
 */
export async function obtenerTareaPorId(id) {
    return new Promise(async (resolve, reject) => {
        try {
            const store = await getStore('readonly');
            const request = store.get(id);

            request.onsuccess = () => {
                resolve(request.result || null);
            };

            request.onerror = () => {
                reject(new Error('Error al obtener la tarea'));
            };
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Obtiene todas las tareas
 * @param {Object} filtros - Filtros opcionales
 * @returns {Promise<Array>} Array de tareas
 */
export async function obtenerTodasLasTareas(filtros = {}) {
    return new Promise(async (resolve, reject) => {
        try {
            const store = await getStore('readonly');
            const request = store.getAll();

            request.onsuccess = () => {
                let tareas = request.result || [];

                // Aplicar filtros
                if (filtros.estado) {
                    tareas = tareas.filter(t => t.estado === filtros.estado);
                }

                if (filtros.prioridad) {
                    tareas = tareas.filter(t => t.prioridad === filtros.prioridad);
                }

                if (filtros.contexto) {
                    tareas = tareas.filter(t => t.contexto === filtros.contexto);
                }

                if (filtros.fecha) {
                    tareas = tareas.filter(t => t.fecha === filtros.fecha);
                }

                if (filtros.fechaDesde) {
                    tareas = tareas.filter(t => t.fecha >= filtros.fechaDesde);
                }

                if (filtros.fechaHasta) {
                    tareas = tareas.filter(t => t.fecha <= filtros.fechaHasta);
                }

                // Ordenar por fecha y hora
                tareas.sort((a, b) => {
                    const fechaA = new Date(`${a.fecha}T${a.hora}`);
                    const fechaB = new Date(`${b.fecha}T${b.hora}`);
                    return fechaA - fechaB;
                });

                resolve(tareas);
            };

            request.onerror = () => {
                reject(new Error('Error al obtener las tareas'));
            };
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Obtiene tareas para una fecha específica
 * @param {string} fecha - Fecha en formato YYYY-MM-DD
 * @returns {Promise<Array>} Tareas del día
 */
export async function obtenerTareasPorFecha(fecha) {
    return obtenerTodasLasTareas({ fecha });
}

/**
 * Obtiene tareas pendientes
 * @returns {Promise<Array>} Tareas pendientes
 */
export async function obtenerTareasPendientes() {
    return obtenerTodasLasTareas({ estado: 'Pendiente' });
}

/**
 * Obtiene tareas para un mes específico
 * @param {number} year - Año
 * @param {number} month - Mes (0-11)
 * @returns {Promise<Array>} Tareas del mes
 */
export async function obtenerTareasPorMes(year, month) {
    const fechaDesde = `${year}-${(month + 1).toString().padStart(2, '0')}-01`;
    const ultimoDia = new Date(year, month + 1, 0).getDate();
    const fechaHasta = `${year}-${(month + 1).toString().padStart(2, '0')}-${ultimoDia}`;

    return obtenerTodasLasTareas({ fechaDesde, fechaHasta });
}

/**
 * Actualiza una tarea existente
 * @param {string} id - ID de la tarea
 * @param {Object} cambios - Cambios a aplicar
 * @returns {Promise<Object>} Tarea actualizada
 */
export async function actualizarTarea(id, cambios) {
    const tarea = await obtenerTareaPorId(id);

    if (!tarea) {
        throw new Error('Tarea no encontrada');
    }

    const tareaActualizada = {
        ...tarea,
        ...cambios,
        actualizadaEn: new Date().toISOString()
    };

    return guardarTarea(tareaActualizada);
}

/**
 * Marca una tarea como cumplida
 * @param {string} id - ID de la tarea
 * @returns {Promise<Object>} Tarea actualizada
 */
export async function marcarComoCumplida(id) {
    return actualizarTarea(id, { estado: 'Cumplida' });
}

/**
 * Marca una tarea como pendiente
 * @param {string} id - ID de la tarea
 * @returns {Promise<Object>} Tarea actualizada
 */
export async function marcarComoPendiente(id) {
    return actualizarTarea(id, { estado: 'Pendiente' });
}

/**
 * Elimina una tarea
 * @param {string} id - ID de la tarea a eliminar
 * @returns {Promise<void>}
 */
export async function eliminarTarea(id) {
    return new Promise(async (resolve, reject) => {
        try {
            const store = await getStore('readwrite');
            const request = store.delete(id);

            request.onsuccess = () => {
                resolve();
            };

            request.onerror = () => {
                reject(new Error('Error al eliminar la tarea'));
            };
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Obtiene estadísticas de las tareas
 * @returns {Promise<Object>} Estadísticas
 */
export async function obtenerEstadisticas() {
    const tareas = await obtenerTodasLasTareas();

    const stats = {
        total: tareas.length,
        pendientes: tareas.filter(t => t.estado === 'Pendiente').length,
        cumplidas: tareas.filter(t => t.estado === 'Cumplida').length,
        porPrioridad: {
            alta: tareas.filter(t => t.prioridad === 'alta' && t.estado === 'Pendiente').length,
            media: tareas.filter(t => t.prioridad === 'media' && t.estado === 'Pendiente').length,
            baja: tareas.filter(t => t.prioridad === 'baja' && t.estado === 'Pendiente').length
        },
        porContexto: {
            trabajo: tareas.filter(t => t.contexto === 'trabajo' && t.estado === 'Pendiente').length,
            personal: tareas.filter(t => t.contexto === 'personal' && t.estado === 'Pendiente').length,
            familiar: tareas.filter(t => t.contexto === 'familiar' && t.estado === 'Pendiente').length
        }
    };

    return stats;
}

/**
 * Obtiene tareas con alertas próximas a disparar
 * @returns {Promise<Array>} Tareas con alertas pendientes
 */
export async function obtenerTareasConAlertasPendientes() {
    const tareas = await obtenerTareasPendientes();
    const ahora = new Date();

    return tareas.filter(tarea => {
        return tarea.alertas.some(alerta => {
            const fechaAlerta = new Date(alerta.fechaHora);
            return !alerta.disparada && fechaAlerta <= ahora;
        });
    });
}

/**
 * Marca una alerta como disparada
 * @param {string} tareaId - ID de la tarea
 * @param {string} alertaId - ID de la alerta
 * @returns {Promise<Object>} Tarea actualizada
 */
export async function marcarAlertaDisparada(tareaId, alertaId) {
    const tarea = await obtenerTareaPorId(tareaId);

    if (!tarea) {
        throw new Error('Tarea no encontrada');
    }

    const alertasActualizadas = tarea.alertas.map(alerta => {
        if (alerta.id === alertaId) {
            return { ...alerta, disparada: true };
        }
        return alerta;
    });

    return actualizarTarea(tareaId, { alertas: alertasActualizadas });
}

/**
 * Busca tareas por texto en el título
 * @param {string} texto - Texto a buscar
 * @returns {Promise<Array>} Tareas que coinciden
 */
export async function buscarTareas(texto) {
    const tareas = await obtenerTodasLasTareas();
    const textoLower = texto.toLowerCase();

    return tareas.filter(tarea =>
        tarea.titulo.toLowerCase().includes(textoLower) ||
        (tarea.descripcion && tarea.descripcion.toLowerCase().includes(textoLower))
    );
}

/**
 * Exporta todas las tareas como JSON
 * @returns {Promise<string>} JSON de tareas
 */
export async function exportarTareas() {
    const tareas = await obtenerTodasLasTareas();
    return JSON.stringify(tareas, null, 2);
}

/**
 * Importa tareas desde JSON
 * @param {string} json - JSON de tareas
 * @returns {Promise<number>} Número de tareas importadas
 */
export async function importarTareas(json) {
    const tareas = JSON.parse(json);
    let importadas = 0;

    for (const tarea of tareas) {
        await guardarTarea(tarea);
        importadas++;
    }

    return importadas;
}
