/**
 * Servicio de almacenamiento de tareas
 * Soporta IndexedDB (local) y Firestore (nube)
 */

import { db, auth } from '../config/firebase.js';
import { ESTADOS, calcularAlertas } from '../models/Task.js';
import {
    collection,
    doc,
    setDoc,
    getDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy
} from 'firebase/firestore';

const DB_NAME = 'AsistenteVozColombiano';
const DB_VERSION = 1;
const STORE_NAME = 'tareas';

let localDb = null;

// Helpers para Firestore
const getUserTasksRef = (userId = null) => {
    const user = auth.currentUser;
    if (!user) throw new Error("Usuario no autenticado");

    // Si se pasa un userId (Admin viendo a otro), usar ese. Si no, usar el propio.
    const targetUid = userId || user.uid;
    return collection(db, 'users', targetUid, 'tasks');
};

/**
 * Inicializa la base de datos IndexedDB (Fallback)
 */
export async function inicializarDB() {
    return new Promise((resolve, reject) => {
        if (localDb) {
            resolve(localDb);
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(new Error('Error al abrir la base de datos local'));

        request.onsuccess = (event) => {
            localDb = event.target.result;
            resolve(localDb);
        };

        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
                store.createIndex('fecha', 'fecha', { unique: false });
                store.createIndex('estado', 'estado', { unique: false });
            }
        };
    });
}

/**
 * Obtiene store local
 */
async function getLocalStore(modo = 'readonly') {
    if (!localDb) await inicializarDB();
    const transaction = localDb.transaction([STORE_NAME], modo);
    return transaction.objectStore(STORE_NAME);
}

/**
 * Utility: remove undefined values from an object (Firestore rejects them).
 * Traverses recursively to handle nested objects (e.g., alertas array).
 */
function sanitizeForFirestore(obj) {
    if (Array.isArray(obj)) {
        return obj.map(sanitizeForFirestore);
    }
    if (obj !== null && typeof obj === 'object') {
        return Object.fromEntries(
            Object.entries(obj)
                .filter(([, v]) => v !== undefined)
                .map(([k, v]) => [k, sanitizeForFirestore(v)])
        );
    }
    return obj;
}

/**
 * Guarda una tarea
 */


/**
 * Guarda una tarea en Firestore.
 * Con la persistencia habilitada, Firestore gestiona automáticamente los reintentos y la cola offline.
 */
export async function guardarTarea(tarea, userId = null) {
    console.log('[SAVE] ▶ Iniciando guardado de tarea:', tarea.titulo || '(sin título)');

    if (!auth.currentUser) {
        console.warn('[SAVE] ⚠️ No hay usuario autenticado. Guardando en IndexedDB local.');
        const store = await getLocalStore('readwrite');
        return await new Promise((resolve, reject) => {
            const request = store.put(tarea);
            request.onsuccess = () => resolve(tarea);
            request.onerror = () => reject(new Error('Error al guardar localmente'));
        });
    }

    const targetUid = userId || auth.currentUser.uid;
    console.log(`[SAVE] 🔑 Usuario autenticado: ${auth.currentUser.email} (uid: ${targetUid})`);

    try {
        const taskRef = doc(db, 'users', targetUid, 'tasks', tarea.id);
        const tareaLimpia = sanitizeForFirestore(tarea);

        // setDoc encola la escritura localmente de inmediato y sincroniza cuando hay red
        await setDoc(taskRef, tareaLimpia);

        console.log(`[SAVE] ✅ Tarea "${tarea.titulo}" guardada/encolada en Firestore para: ${targetUid}`);
        return tarea;
    } catch (error) {
        console.error('[SAVE] ❌ Error al guardar en Firestore — código:', error.code, '| mensaje:', error.message);
        throw error;
    }
}


/**
 * Obtiene una tarea por ID
 * @param {string} id - ID de la tarea
 * @param {string|null} userId - ID del usuario dueño de la tarea (null = usuario actual)
 */
export async function obtenerTareaPorId(id, userId = null) {
    if (auth.currentUser) {
        try {
            const targetUid = userId || auth.currentUser.uid;
            const taskRef = doc(db, 'users', targetUid, 'tasks', id);
            const taskSnap = await getDoc(taskRef);
            if (!taskSnap.exists()) {
                console.warn(`[TaskStorage] Tarea ${id} no encontrada para usuario ${targetUid}`);
                return null;
            }
            return taskSnap.data();
        } catch (error) {
            console.error('[TaskStorage] Error obteniendo tarea de Firestore:', error);
            throw error;
        }
    }

    // Local mode
    try {
        const store = await getLocalStore('readonly');
        return await new Promise((resolve, reject) => {
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(new Error('Error obteniendo tarea localmente'));
        });
    } catch (error) {
        console.error('[TaskStorage] Error obteniendo tarea local:', error);
        throw error;
    }
}

/**
 * Obtiene todas las tareas
 */
export async function obtenerTodasLasTareas(filtros = {}) {
    let tareas = [];

    if (auth.currentUser) {
        try {
            // Permitir que el Admin especifique qué usuario ver
            const targetUserId = filtros.targetUserId || null;
            const tasksRef = getUserTasksRef(targetUserId);

            console.log('[TaskStorage] Consultando tareas para:', targetUserId || auth.currentUser.uid);

            // Obtener TODAS las tareas sin filtro en Firestore (filtramos en memoria)
            // Esto evita problemas de índices compuestos requeridos
            const querySnapshot = await getDocs(query(tasksRef));
            querySnapshot.forEach((doc) => {
                tareas.push(doc.data());
            });

            console.log(`[TaskStorage] ${tareas.length} tareas obtenidas de Firestore`);
        } catch (error) {
            console.error('[TaskStorage] Error obteniendo tareas de Firestore:', error);
            console.error('[TaskStorage] Código:', error.code, '| Mensaje:', error.message);

            // Si es un error de permisos, mostrar instrucciones
            if (error.code === 'permission-denied') {
                console.error('[TaskStorage] ⚠️ PERMISOS DENEGADOS. Configure las reglas de Firestore en la consola de Firebase.');
            }

            // Re-lanzar para que los componentes manejen el error
            throw error;
        }
    } else {
        // Local strategy — fixed: no async inside Promise constructor
        try {
            const store = await getLocalStore('readonly');
            tareas = await new Promise((resolve, reject) => {
                const request = store.getAll();
                request.onsuccess = () => resolve(request.result || []);
                request.onerror = () => reject(new Error('Error local'));
            });
        } catch (error) {
            console.error('[TaskStorage] Error obteniendo tareas locales:', error);
            throw error;
        }
    }

    // Aplicar TODOS los filtros en memoria
    if (filtros.estado) tareas = tareas.filter(t => t.estado === filtros.estado);
    if (filtros.prioridad) tareas = tareas.filter(t => t.prioridad === filtros.prioridad);
    if (filtros.contexto) tareas = tareas.filter(t => t.contexto === filtros.contexto);
    if (filtros.fecha) tareas = tareas.filter(t => t.fecha === filtros.fecha);

    if (filtros.fechaDesde) tareas = tareas.filter(t => t.fecha >= filtros.fechaDesde);
    if (filtros.fechaHasta) tareas = tareas.filter(t => t.fecha <= filtros.fechaHasta);

    // Ordenar
    tareas.sort((a, b) => {
        const fechaA = new Date(`${a.fecha}T${a.hora}`);
        const fechaB = new Date(`${b.fecha}T${b.hora}`);
        return fechaA - fechaB;
    });

    return tareas;
}

// Funciones wrapper que usan obtenerTodasLasTareas internamente
export async function obtenerTareasPorFecha(fecha, userId = null) {
    return obtenerTodasLasTareas({ fecha, targetUserId: userId });
}

export async function obtenerTareasPendientes(userId = null) {
    return obtenerTodasLasTareas({ estado: ESTADOS.PENDIENTE, targetUserId: userId });
}

export async function obtenerTareasCumplidas(userId = null) {
    return obtenerTodasLasTareas({ estado: ESTADOS.CUMPLIDA, targetUserId: userId });
}

export async function obtenerTareasPorMes(year, month, userId = null) {
    const fechaDesde = `${year}-${(month + 1).toString().padStart(2, '0')}-01`;
    const ultimoDia = new Date(year, month + 1, 0).getDate();
    const fechaHasta = `${year}-${(month + 1).toString().padStart(2, '0')}-${ultimoDia}`;
    return obtenerTodasLasTareas({ fechaDesde, fechaHasta, targetUserId: userId });
}

/**
 * Actualiza una tarea
 * @param {string} id - ID de la tarea
 * @param {Object} cambios - Campos a actualizar
 * @param {string|null} userId - ID del usuario dueño (null = usuario actual)
 */
export async function actualizarTarea(id, cambios, userId = null) {
    console.log(`[TaskStorage] ▶ Actualizando tarea ${id} para usuario: ${userId || 'current'}`);

    const tarea = await obtenerTareaPorId(id, userId);
    if (!tarea) {
        console.error(`[TaskStorage] ❌ Tarea ${id} no encontrada para usuario ${userId || auth.currentUser?.uid || 'local'}`);
        throw new Error('Tarea no encontrada');
    }

    // Si se modifica fecha u hora, recalcular las alertas obligatorias
    if (cambios.fecha || cambios.hora) {
        const nuevaFecha = cambios.fecha || tarea.fecha;
        const nuevaHora = cambios.hora || tarea.hora;
        cambios.alertas = calcularAlertas(nuevaFecha, nuevaHora);
        console.log('[TaskStorage] Alertas recalculadas para nueva fecha/hora:', nuevaFecha, nuevaHora);
    }

    // Filter out undefined values — Firestore rejects documents with undefined fields
    const cambiosLimpios = Object.fromEntries(
        Object.entries(cambios).filter(([_, v]) => v !== undefined)
    );
    const tareaActualizada = { ...tarea, ...cambiosLimpios, actualizadaEn: new Date().toISOString() };
    return guardarTarea(tareaActualizada, userId); // Pass userId through to save to correct user
}

export async function marcarComoCumplida(id, userId = null) {
    return actualizarTarea(id, { estado: ESTADOS.CUMPLIDA }, userId);
}

export async function marcarComoPendiente(id, userId = null) {
    return actualizarTarea(id, { estado: ESTADOS.PENDIENTE }, userId);
}

/**
 * Elimina una tarea
 * @param {string} id - ID de la tarea
 * @param {string|null} userId - ID del usuario dueño (null = usuario actual)
 */
export async function eliminarTarea(id, userId = null) {
    if (auth.currentUser) {
        try {
            const targetUid = userId || auth.currentUser.uid;
            console.log(`[TaskStorage] 🗑️ Eliminando tarea ${id} de usuario ${targetUid}`);
            await deleteDoc(doc(db, 'users', targetUid, 'tasks', id));
            console.log(`[TaskStorage] ✅ Tarea ${id} eliminada exitosamente`);
            return;
        } catch (error) {
            console.error('[TaskStorage] ❌ Error eliminando de Firestore:', error);
            throw error;
        }
    }

    // Local mode
    try {
        const store = await getLocalStore('readwrite');
        return await new Promise((resolve, reject) => {
            const request = store.delete(id);
            request.onsuccess = () => {
                console.log(`[TaskStorage] ✅ Tarea ${id} eliminada localmente`);
                resolve();
            };
            request.onerror = () => reject(new Error('Error eliminando tarea localmente'));
        });
    } catch (error) {
        console.error('[TaskStorage] ❌ Error eliminando tarea local:', error);
        throw error;
    }
}


/**
 * Obtiene estadísticas de las tareas
 */
export async function obtenerEstadisticas() {
    const tareas = await obtenerTodasLasTareas();

    const stats = {
        total: tareas.length,
        pendientes: tareas.filter(t => t.estado === ESTADOS.PENDIENTE).length,
        cumplidas: tareas.filter(t => t.estado === ESTADOS.CUMPLIDA).length,
        porPrioridad: {
            alta: tareas.filter(t => t.prioridad === 'alta' && t.estado === ESTADOS.PENDIENTE).length,
            media: tareas.filter(t => t.prioridad === 'media' && t.estado === ESTADOS.PENDIENTE).length,
            baja: tareas.filter(t => t.prioridad === 'baja' && t.estado === ESTADOS.PENDIENTE).length
        },
        porContexto: {
            trabajo: tareas.filter(t => t.contexto === 'trabajo' && t.estado === ESTADOS.PENDIENTE).length,
            personal: tareas.filter(t => t.contexto === 'personal' && t.estado === ESTADOS.PENDIENTE).length,
            familiar: tareas.filter(t => t.contexto === 'familiar' && t.estado === ESTADOS.PENDIENTE).length
        }
    };

    return stats;
}

export async function obtenerTareasConAlertasPendientes() {
    const tareas = await obtenerTareasPendientes();
    const ahora = new Date();

    return tareas.filter(tarea => {
        return tarea.alertas && tarea.alertas.some(alerta => {
            const fechaAlerta = new Date(alerta.fechaHora);
            return !alerta.disparada && fechaAlerta <= ahora;
        });
    });
}

export async function marcarAlertaDisparada(tareaId, alertaId, userId = null) {
    const tarea = await obtenerTareaPorId(tareaId, userId);
    if (!tarea) throw new Error('Tarea no encontrada');

    const alertasActualizadas = tarea.alertas.map(alerta => {
        if (alerta.id === alertaId) {
            return { ...alerta, disparada: true };
        }
        return alerta;
    });

    return actualizarTarea(tareaId, { alertas: alertasActualizadas }, userId);
}

export async function buscarTareas(texto) {
    const tareas = await obtenerTodasLasTareas();
    const textoLower = texto.toLowerCase();

    return tareas.filter(tarea =>
        tarea.titulo.toLowerCase().includes(textoLower) ||
        (tarea.descripcion && tarea.descripcion.toLowerCase().includes(textoLower))
    );
}
