/**
 * Servicio de Periodo de Prueba (Trial)
 * Gestiona el periodo de prueba de 7 días para el control por voz
 * Solo el usuario cristian.lizcano@cun.edu.co tiene acceso al trial
 * 
 * Usa Firestore como almacenamiento principal y localStorage como fallback
 */
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase.js';

// Correo autorizado para el periodo de prueba
const TRIAL_EMAIL = 'cristian.lizcano@cun.edu.co';

// Duración del trial en días
const TRIAL_DURATION_DAYS = 7;

// Clave de localStorage para fallback
const LOCAL_TRIAL_KEY = 'obligo360_trial_data';

/**
 * Obtiene la fecha actual en hora colombiana (UTC-5)
 * @returns {Date} Fecha actual en UTC-5
 */
function obtenerFechaColombia() {
    const now = new Date();
    const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
    const colombiaMs = utcMs + (-5 * 3600000);
    return new Date(colombiaMs);
}

/**
 * Guarda datos del trial en localStorage como fallback
 * @param {Object} data 
 */
function guardarTrialLocal(data) {
    try {
        localStorage.setItem(LOCAL_TRIAL_KEY, JSON.stringify(data));
    } catch (e) {
        console.warn('No se pudo guardar trial en localStorage:', e);
    }
}

/**
 * Lee datos del trial desde localStorage
 * @returns {Object|null}
 */
function leerTrialLocal() {
    try {
        const raw = localStorage.getItem(LOCAL_TRIAL_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

/**
 * Calcula el estado del trial dado los datos almacenados
 * @param {Object} data - Datos del trial (fechaInicio, fechaFin)
 * @returns {Object} Estado del trial
 */
function calcularEstadoTrial(data) {
    const ahora = obtenerFechaColombia();
    const fechaFin = new Date(data.fechaFin);
    const diffMs = fechaFin.getTime() - ahora.getTime();
    const diasRestantes = Math.ceil(diffMs / (24 * 3600000));

    if (diasRestantes <= 0) {
        return {
            activo: false,
            motivo: 'expirado',
            diasRestantes: 0,
            fechaInicio: data.fechaInicio,
            fechaFin: data.fechaFin
        };
    }

    return {
        activo: true,
        motivo: 'activo',
        diasRestantes: diasRestantes,
        fechaInicio: data.fechaInicio,
        fechaFin: data.fechaFin
    };
}

/**
 * Crea un nuevo registro de trial
 * @param {string} email 
 * @returns {Object} Datos del nuevo trial
 */
function crearNuevoTrial(email) {
    const ahora = obtenerFechaColombia();
    const fechaInicio = ahora.toISOString();
    const fechaFin = new Date(ahora.getTime() + (TRIAL_DURATION_DAYS * 24 * 3600000)).toISOString();

    return {
        email: email.toLowerCase(),
        fechaInicio: fechaInicio,
        fechaFin: fechaFin,
        duracionDias: TRIAL_DURATION_DAYS,
        creadoEn: new Date().toISOString()
    };
}

/**
 * Verifica el estado del periodo de prueba para un usuario
 * @param {string} userEmail - Email del usuario
 * @param {string} uid - UID del usuario en Firebase
 * @returns {Promise<Object>} Estado del trial
 */
export async function verificarTrial(userEmail, uid) {
    // Verificar si el email está autorizado
    if (!userEmail || userEmail.toLowerCase() !== TRIAL_EMAIL) {
        return {
            activo: false,
            motivo: 'no_autorizado',
            diasRestantes: 0,
            fechaInicio: null,
            fechaFin: null
        };
    }

    // Intentar Firestore primero, luego fallback a localStorage
    try {
        const trialRef = doc(db, 'usuarios', uid, 'config', 'trial');
        const trialDoc = await getDoc(trialRef);

        if (!trialDoc.exists()) {
            // Primera vez: crear registro del trial
            const nuevoTrial = crearNuevoTrial(userEmail);

            // Intentar guardar en Firestore
            try {
                await setDoc(trialRef, nuevoTrial);
                console.log(`Trial creado en Firestore para ${userEmail}`);
            } catch (writeError) {
                console.warn('No se pudo escribir en Firestore, usando localStorage:', writeError.message);
            }

            // Siempre guardar en localStorage como backup
            guardarTrialLocal(nuevoTrial);

            return {
                activo: true,
                motivo: 'activo',
                diasRestantes: TRIAL_DURATION_DAYS,
                fechaInicio: nuevoTrial.fechaInicio,
                fechaFin: nuevoTrial.fechaFin
            };
        }

        // Ya existe en Firestore: calcular estado
        const data = trialDoc.data();
        guardarTrialLocal(data); // Sincronizar con localStorage
        return calcularEstadoTrial(data);

    } catch (firestoreError) {
        console.warn('Error accediendo Firestore, usando localStorage como fallback:', firestoreError.message);

        // Fallback a localStorage
        const localData = leerTrialLocal();

        if (localData && localData.email === userEmail.toLowerCase()) {
            // Datos locales existen
            return calcularEstadoTrial(localData);
        }

        // Primera vez y sin Firestore: crear trial localmente
        const nuevoTrial = crearNuevoTrial(userEmail);
        guardarTrialLocal(nuevoTrial);

        console.log(`Trial creado localmente para ${userEmail}`);

        return {
            activo: true,
            motivo: 'activo',
            diasRestantes: TRIAL_DURATION_DAYS,
            fechaInicio: nuevoTrial.fechaInicio,
            fechaFin: nuevoTrial.fechaFin
        };
    }
}

/**
 * Verifica si un email es el autorizado para trial
 * @param {string} email 
 * @returns {boolean}
 */
export function esEmailAutorizado(email) {
    return email && email.toLowerCase() === TRIAL_EMAIL;
}
