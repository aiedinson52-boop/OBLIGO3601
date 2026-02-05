/**
 * Servicio de almacenamiento de tareas
 * Soporta IndexedDB (local) y Firestore (nube)
 */

import { db, auth } from '../config/firebase.js';
import { ESTADOS } from '../models/Task.js';
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
const getUserTasksRef = () => {
    const user = auth.currentUser;
    if (!user) throw new Error("Usuario no autenticado");
    return collection(db, 'users', user.uid, 'tasks');
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
export async function guardarTarea(tarea) {
    // Si hay usuario logueado, usar Firestore
    if (auth.currentUser) {
        try {
            const taskRef = doc(db, 'users', auth.currentUser.uid, 'tasks', tarea.id);
            await setDoc(taskRef, tarea);
            return tarea;
        } catch (error) {
            console.error("Error guardando en Firestore:", error);
            throw error;
        }
    }

    // Fallback a IndexedDB
    return new Promise(async (resolve, reject) => {
        try {
            const store = await getLocalStore('readwrite');
            const request = store.put(tarea);
            request.onsuccess = () => resolve(tarea);
            request.onerror = () => reject(new Error('Error al guardar localmente'));
        } catch (error) {
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
            let q = query(getUserTasksRef());

            if (filtros.estado) {
                q = query(q, where('estado', '==', filtros.estado));
            }

            const querySnapshot = await getDocs(q);
            querySnapshot.forEach((doc) => {
                tareas.push(doc.data());
            });
        } catch (error) {
            console.error("Error obteniendo tareas de Firestore:", error);
            // Si falla Firestore, podríamos intentar local, pero por ahora lanzamos error
            // o devolvemos vacío para no mezclar datos
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

    // Aplicar filtros en memoria (común para ambos)
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
export async function obtenerTareasPorFecha(fecha) {
    return obtenerTodasLasTareas({ fecha });
}

export async function obtenerTareasPendientes() {
    return obtenerTodasLasTareas({ estado: ESTADOS.PENDIENTE });
}

export async function obtenerTareasCumplidas() {
    return obtenerTodasLasTareas({ estado: ESTADOS.CUMPLIDA });
}

export async function obtenerTareasPorMes(year, month) {
    const fechaDesde = `${year}-${(month + 1).toString().padStart(2, '0')}-01`;
    const ultimoDia = new Date(year, month + 1, 0).getDate();
    const fechaHasta = `${year}-${(month + 1).toString().padStart(2, '0')}-${ultimoDia}`;
    return obtenerTodasLasTareas({ fechaDesde, fechaHasta });
}

/**
 * Actualiza una tarea
 */
export async function actualizarTarea(id, cambios) {
    const tarea = await obtenerTareaPorId(id);
    if (!tarea) throw new Error('Tarea no encontrada');

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
