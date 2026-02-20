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
 * Guarda una tarea
 */
/**
 * Traduce un código de error de Firestore a un mensaje amigable
 */
function traducirErrorFirestore(error) {
    const mensajes = {
        'permission-denied': 'No tiene permisos para guardar. Verifique su sesión.',
        'unavailable': 'Servicio no disponible. Guardado localmente.',
        'deadline-exceeded': 'Tiempo de espera agotado. Guardado localmente.',
        'resource-exhausted': 'Cuota de Firestore agotada. Guardado localmente.',
        'unauthenticated': 'Sesión expirada. Por favor, inicie sesión nuevamente.',
        'not-found': 'Colección no encontrada. Contacte soporte.',
        'already-exists': 'La tarea ya existe.',
        'cancelled': 'Operación cancelada. Intente de nuevo.',
        'data-loss': 'Error de datos. Guardado localmente.',
        'internal': 'Error interno del servidor. Guardado localmente.',
        'failed-precondition': 'Condición previa fallida. Guardado localmente.'
    };
    return mensajes[error.code] || `Error inesperado (${error.code || 'desconocido'}). Guardado localmente.`;
}

/**
 * Guarda una tarea en IndexedDB como pendiente de sincronización
 */
async function guardarTareaPendienteSync(tarea) {
    try {
        const tareaPendiente = { ...tarea, _syncPending: true, _pendingSince: new Date().toISOString() };
        const store = await getLocalStore('readwrite');
        const request = store.put(tareaPendiente);

        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                console.log('[SAVE] 💾 Tarea guardada localmente (pendiente de sync):', tarea.titulo);
                resolve(tareaPendiente);
            };
            request.onerror = () => reject(new Error('Error al guardar pendiente localmente'));
        });
    } catch (error) {
        console.error('[SAVE] ❌ Error guardando fallback en IndexedDB:', error);
        throw error;
    }
}

/**
 * Guarda una tarea con reintentos y fallback
 */
export async function guardarTarea(tarea, userId = null) {
    console.log('[SAVE] ▶ Iniciando guardado de tarea (TaskStorage):', tarea.titulo || '(sin título)');

    // 1. Si hay usuario logueado, intentar Firestore con reintentos
    if (auth.currentUser) {
        const MAX_RETRIES = 3;
        const BACKOFF_MS = [500, 1000, 2000];
        const targetUid = userId || auth.currentUser.uid;

        for (let intento = 1; intento <= MAX_RETRIES; intento++) {
            try {
                console.log(`[SAVE] 🔄 Intento ${intento}/${MAX_RETRIES} - Guardando en Firestore...`);

                const taskRef = doc(db, 'users', targetUid, 'tasks', tarea.id);
                // Usar setDoc para crear o sobreescribir si ya existe (idempotente)
                await setDoc(taskRef, tarea);

                console.log(`[SAVE] ✅ ÉXITO en intento ${intento}: Tarea guardada en Firestore`);
                return tarea;

            } catch (error) {
                console.error(`[SAVE] ❌ Intento ${intento}/${MAX_RETRIES} falló:`, error.code || 'unknown', error.message);

                // Errores permanentes: no reintentar
                if (error.code === 'permission-denied' || error.code === 'unauthenticated') {
                    console.error('[SAVE] 🚫 Error permanente - no se reintentará');
                    throw error; // Re-lanzar para que la UI muestre error específico
                }

                // Errores transitorios: esperar y reintentar
                if (intento < MAX_RETRIES) {
                    const delay = BACKOFF_MS[intento - 1] || 2000;
                    console.log(`[SAVE] ⏳ Esperando ${delay}ms antes del siguiente intento...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        // 2. Si fallan todos los reintentos, usar Fallback (IndexedDB)
        console.warn('[SAVE] ⚠️ Todos los intentos de Firestore fallaron. Guardando localmente...');
        return await guardarTareaPendienteSync(tarea);
    }

    // 3. Si no hay usuario (modo local), guardar directamente en IndexedDB
    console.log('[SAVE] ℹ️ Modo offline/local. Guardando en IndexedDB.');
    return new Promise(async (resolve, reject) => {
        try {
            const store = await getLocalStore('readwrite');
            const request = store.put(tarea);
            request.onsuccess = () => {
                console.log('[SAVE] ✅ Tarea guardada exitosamente en IndexedDB');
                resolve(tarea);
            };
            request.onerror = () => reject(new Error('Error al guardar localmente'));
        } catch (error) {
            console.error('[SAVE] ❌ Error en guardado local:', error);
            reject(error);
        }
    });
}

/**
 * Obtiene una tarea por ID
 */
export async function obtenerTareaPorId(id) {
    if (auth.currentUser) {
        try {
            const taskRef = doc(db, 'users', auth.currentUser.uid, 'tasks', id);
            const taskSnap = await getDoc(taskRef);
            return taskSnap.exists() ? taskSnap.data() : null;
        } catch (error) {
            console.error("Error obteniendo de Firestore:", error);
            throw error;
        }
    }

    return new Promise(async (resolve, reject) => {
        try {
            const store = await getLocalStore('readonly');
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(new Error('Error local'));
        } catch (error) {
            reject(error);
        }
    });
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
        // Local strategy
        tareas = await new Promise(async (resolve, reject) => {
            try {
                const store = await getLocalStore('readonly');
                const request = store.getAll();
                request.onsuccess = () => resolve(request.result || []);
                request.onerror = () => reject(new Error('Error local'));
            } catch (error) {
                reject(error);
            }
        });
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
 */
export async function actualizarTarea(id, cambios) {
    const tarea = await obtenerTareaPorId(id);
    if (!tarea) throw new Error('Tarea no encontrada');

    // Si se modifica fecha u hora, recalcular las alertas obligatorias
    if (cambios.fecha || cambios.hora) {
        const nuevaFecha = cambios.fecha || tarea.fecha;
        const nuevaHora = cambios.hora || tarea.hora;
        cambios.alertas = calcularAlertas(nuevaFecha, nuevaHora);
        console.log('[TaskStorage] Alertas recalculadas para nueva fecha/hora:', nuevaFecha, nuevaHora);
    }

    const tareaActualizada = { ...tarea, ...cambios, actualizadaEn: new Date().toISOString() };
    return guardarTarea(tareaActualizada); // guardarTarea maneja la lógica de reemplazo/update
}

export async function marcarComoCumplida(id) {
    return actualizarTarea(id, { estado: ESTADOS.CUMPLIDA });
}

export async function marcarComoPendiente(id) {
    return actualizarTarea(id, { estado: ESTADOS.PENDIENTE });
}

/**
 * Elimina una tarea
 */
export async function eliminarTarea(id) {
    if (auth.currentUser) {
        try {
            await deleteDoc(doc(db, 'users', auth.currentUser.uid, 'tasks', id));
            return;
        } catch (error) {
            console.error("Error eliminando de Firestore:", error);
            throw error;
        }
    }

    return new Promise(async (resolve, reject) => {
        try {
            const store = await getLocalStore('readwrite');
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(new Error('Error local'));
        } catch (error) {
            reject(error);
        }
    });
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

export async function marcarAlertaDisparada(tareaId, alertaId) {
    const tarea = await obtenerTareaPorId(tareaId);
    if (!tarea) throw new Error('Tarea no encontrada');

    // Mismo código de antes
    const alertasActualizadas = tarea.alertas.map(alerta => {
        if (alerta.id === alertaId) {
            return { ...alerta, disparada: true };
        }
        return alerta;
    });

    return actualizarTarea(tareaId, { alertas: alertasActualizadas });
}

export async function buscarTareas(texto) {
    const tareas = await obtenerTodasLasTareas();
    const textoLower = texto.toLowerCase();

    return tareas.filter(tarea =>
        tarea.titulo.toLowerCase().includes(textoLower) ||
        (tarea.descripcion && tarea.descripcion.toLowerCase().includes(textoLower))
    );
}
