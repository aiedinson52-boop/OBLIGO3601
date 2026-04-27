/**
 * Servicio de Evidencia - Firebase Storage
 * Maneja la carga de archivos PDF como evidencia de tareas.
 * - Máximo 300 KB por archivo
 * - Se almacena en Firebase Storage
 * - Metadata con expiración a 30 días se guarda en Firestore (campo evidencia en la tarea)
 */

import { storage, auth, db } from '../config/firebase.js';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { doc, updateDoc } from 'firebase/firestore';

const MAX_FILE_SIZE_KB = 300;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_KB * 1024;
const EXPIRATION_DAYS = 30;

/**
 * Sube un archivo PDF como evidencia de una tarea
 * @param {File} file - Archivo PDF a subir
 * @param {string} tareaId - ID de la tarea asociada
 * @param {string|null} userId - ID del usuario dueño de la tarea
 * @returns {Promise<Object>} Información de la evidencia subida
 */
export async function subirEvidencia(file, tareaId, userId = null) {
    // Validar que hay usuario autenticado
    if (!auth.currentUser) {
        throw new Error('Debe estar autenticado para subir evidencia.');
    }

    // Validar tipo de archivo
    if (file.type !== 'application/pdf') {
        throw new Error('Solo se permiten archivos PDF.');
    }

    // Validar tamaño
    if (file.size > MAX_FILE_SIZE_BYTES) {
        const sizeKB = (file.size / 1024).toFixed(1);
        throw new Error(`El archivo pesa ${sizeKB} KB. El máximo permitido es ${MAX_FILE_SIZE_KB} KB.`);
    }

    const targetUid = userId || auth.currentUser.uid;
    const timestamp = Date.now();
    const fileName = `evidencia_${tareaId}_${timestamp}.pdf`;
    const storagePath = `evidencias/${targetUid}/${fileName}`;

    // Calcular fecha de expiración (30 días)
    const fechaExpiracion = new Date();
    fechaExpiracion.setDate(fechaExpiracion.getDate() + EXPIRATION_DAYS);

    try {
        // Crear referencia en Storage
        const storageRef = ref(storage, storagePath);

        // Metadata personalizada
        const metadata = {
            contentType: 'application/pdf',
            customMetadata: {
                tareaId: tareaId,
                userId: targetUid,
                uploadedAt: new Date().toISOString(),
                expiresAt: fechaExpiracion.toISOString(),
                originalName: file.name
            }
        };

        // Subir archivo
        console.log(`[Evidence] ▶ Subiendo evidencia: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
        const snapshot = await uploadBytes(storageRef, file, metadata);

        // Obtener URL de descarga
        const downloadURL = await getDownloadURL(snapshot.ref);

        // Crear objeto de evidencia
        const evidencia = {
            url: downloadURL,
            storagePath: storagePath,
            nombreOriginal: file.name,
            tamano: file.size,
            subidaEn: new Date().toISOString(),
            expiraEn: fechaExpiracion.toISOString()
        };

        // Guardar metadata de evidencia en la tarea (Firestore)
        const taskRef = doc(db, 'users', targetUid, 'tasks', tareaId);
        await updateDoc(taskRef, { evidencia });

        console.log(`[Evidence] ✅ Evidencia subida exitosamente. Expira: ${fechaExpiracion.toLocaleDateString()}`);
        return evidencia;

    } catch (error) {
        console.error('[Evidence] ❌ Error subiendo evidencia:', error);
        throw error;
    }
}

/**
 * Elimina la evidencia de una tarea
 * @param {string} storagePath - Path del archivo en Storage
 * @param {string} tareaId - ID de la tarea
 * @param {string|null} userId - ID del usuario dueño
 */
export async function eliminarEvidencia(storagePath, tareaId, userId = null) {
    if (!auth.currentUser) {
        throw new Error('Debe estar autenticado.');
    }

    const targetUid = userId || auth.currentUser.uid;

    try {
        // Eliminar de Storage
        const storageRef = ref(storage, storagePath);
        await deleteObject(storageRef);

        // Limpiar referencia en Firestore
        const taskRef = doc(db, 'users', targetUid, 'tasks', tareaId);
        await updateDoc(taskRef, { evidencia: null });

        console.log(`[Evidence] ✅ Evidencia eliminada: ${storagePath}`);
    } catch (error) {
        console.error('[Evidence] ❌ Error eliminando evidencia:', error);
        throw error;
    }
}

/**
 * Verifica y elimina evidencias expiradas (llamar al iniciar la app)
 * @param {Array} tareas - Lista de tareas a verificar
 * @param {string|null} userId - ID del usuario
 */
export async function limpiarEvidenciasExpiradas(tareas, userId = null) {
    if (!auth.currentUser) return;

    const ahora = new Date();
    let eliminadas = 0;

    for (const tarea of tareas) {
        if (tarea.evidencia && tarea.evidencia.expiraEn) {
            const fechaExpiracion = new Date(tarea.evidencia.expiraEn);
            if (ahora > fechaExpiracion) {
                try {
                    await eliminarEvidencia(tarea.evidencia.storagePath, tarea.id, userId);
                    eliminadas++;
                    console.log(`[Evidence] 🗑️ Evidencia expirada eliminada para tarea: ${tarea.titulo}`);
                } catch (error) {
                    console.warn(`[Evidence] ⚠️ Error limpiando evidencia expirada de "${tarea.titulo}":`, error.message);
                }
            }
        }
    }

    if (eliminadas > 0) {
        console.log(`[Evidence] 🧹 ${eliminadas} evidencia(s) expirada(s) eliminada(s)`);
    }
}

/**
 * Calcula cuántos días le quedan a una evidencia antes de expirar
 * @param {string} expiraEn - Fecha de expiración en ISO string
 * @returns {number} Días restantes (negativo si ya expiró)
 */
export function diasHastaExpiracion(expiraEn) {
    const ahora = new Date();
    const expiracion = new Date(expiraEn);
    const diffMs = expiracion - ahora;
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}
