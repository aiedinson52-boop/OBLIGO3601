/**
 * Servicio de Periodo de Prueba (Trial)
 * Gestiona el periodo de prueba de 7 días para el control por voz
 * Solo el usuario cristian.lizcano@cun.edu.co tiene acceso al trial
 */
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase.js';

// Correo autorizado para el periodo de prueba
const TRIAL_EMAIL = 'cristian.lizcano@cun.edu.co';

// Duración del trial en días
const TRIAL_DURATION_DAYS = 7;

/**
 * Obtiene la fecha actual en hora colombiana (UTC-5)
 * @returns {Date} Fecha actual en UTC-5
 */
function obtenerFechaColombia() {
    const now = new Date();
    // Convertir a hora colombiana (UTC-5)
    const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
    const colombiaMs = utcMs + (-5 * 3600000);
    return new Date(colombiaMs);
}

/**
 * Verifica el estado del periodo de prueba para un usuario
 * @param {string} userEmail - Email del usuario
 * @param {string} uid - UID del usuario en Firebase
 * @returns {Promise<Object>} Estado del trial
 *   - activo: boolean
 *   - motivo: string ('no_autorizado' | 'expirado' | 'activo')
 *   - diasRestantes: number
 *   - fechaInicio: string | null
 *   - fechaFin: string | null
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

    try {
        const trialRef = doc(db, 'usuarios', uid, 'config', 'trial');
        const trialDoc = await getDoc(trialRef);

        const ahora = obtenerFechaColombia();

        if (!trialDoc.exists()) {
            // Primera vez: crear registro del trial
            const fechaInicio = ahora.toISOString();
            const fechaFin = new Date(ahora.getTime() + (TRIAL_DURATION_DAYS * 24 * 3600000)).toISOString();

            await setDoc(trialRef, {
                email: userEmail.toLowerCase(),
                fechaInicio: fechaInicio,
                fechaFin: fechaFin,
                duracionDias: TRIAL_DURATION_DAYS,
                creadoEn: new Date().toISOString()
            });

            console.log(`Trial creado para ${userEmail}: ${TRIAL_DURATION_DAYS} días desde ${fechaInicio}`);

            return {
                activo: true,
                motivo: 'activo',
                diasRestantes: TRIAL_DURATION_DAYS,
                fechaInicio: fechaInicio,
                fechaFin: fechaFin
            };
        }

        // Ya existe: verificar si sigue activo
        const data = trialDoc.data();
        const fechaFin = new Date(data.fechaFin);

        const diffMs = fechaFin.getTime() - ahora.getTime();
        const diasRestantes = Math.ceil(diffMs / (24 * 3600000));

        if (diasRestantes <= 0) {
            // Trial expirado
            return {
                activo: false,
                motivo: 'expirado',
                diasRestantes: 0,
                fechaInicio: data.fechaInicio,
                fechaFin: data.fechaFin
            };
        }

        // Trial activo
        return {
            activo: true,
            motivo: 'activo',
            diasRestantes: diasRestantes,
            fechaInicio: data.fechaInicio,
            fechaFin: data.fechaFin
        };

    } catch (error) {
        console.error('Error verificando trial:', error);
        // En caso de error, denegar acceso por seguridad
        return {
            activo: false,
            motivo: 'error',
            diasRestantes: 0,
            fechaInicio: null,
            fechaFin: null
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
