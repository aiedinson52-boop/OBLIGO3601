/**
 * PushService — Servicio de Notificaciones Push para iOS/Android
 * 
 * Maneja la suscripción a Web Push vía VAPID y el envío de
 * notificaciones push a través del servidor (APNs para iOS).
 * 
 * IMPORTANTE: Para que el sonido funcione en segundo plano en iOS,
 * la notificación DEBE enviarse vía APNs (servidor), NO desde JavaScript.
 */

import { getApiUrl } from '../config/api.js';

// Clave pública VAPID — se reemplaza con la variable de entorno en build,
// o se puede cargar dinámicamente desde el servidor
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

let pushSubscription = null;
let swRegistration = null;

/**
 * Convierte una clave VAPID base64 a Uint8Array (requerido por PushManager)
 * @param {string} base64String - Clave en formato base64url
 * @returns {Uint8Array}
 */
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

/**
 * Verifica si Web Push está soportado en este navegador
 * @returns {boolean}
 */
export function pushSoportado() {
    return 'serviceWorker' in navigator &&
        'PushManager' in window &&
        'Notification' in window;
}

/**
 * Registra el Service Worker y suscribe al usuario a push notifications
 * @param {ServiceWorkerRegistration} registration - Registro del SW
 * @returns {Promise<boolean>} true si se suscribió exitosamente
 */
export async function registrarPush(registration) {
    if (!pushSoportado()) {
        console.warn('[PushService] Web Push no soportado en este navegador');
        return false;
    }

    swRegistration = registration;

    try {
        // Verificar si ya existe una suscripción
        const existingSubscription = await registration.pushManager.getSubscription();

        if (existingSubscription) {
            pushSubscription = existingSubscription;
            console.log('[PushService] Suscripción push existente recuperada');
            // Enviar al servidor por si se perdió
            await enviarSuscripcionAlServidor(existingSubscription);
            return true;
        }

        // Solicitar permiso de notificaciones
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            console.warn('[PushService] Permiso de notificaciones denegado');
            return false;
        }

        // Obtener la clave pública VAPID
        let vapidKey = VAPID_PUBLIC_KEY;

        // Si no está en el build, intentar obtenerla del servidor
        if (!vapidKey) {
            try {
                const response = await fetch(getApiUrl('/api/push-vapid-key'));
                if (response.ok) {
                    const data = await response.json();
                    vapidKey = data.publicKey;
                }
            } catch (e) {
                console.warn('[PushService] No se pudo obtener VAPID key del servidor:', e);
            }
        }

        if (!vapidKey) {
            console.error('[PushService] No se encontró VAPID_PUBLIC_KEY. Configura la variable de entorno.');
            return false;
        }

        // Suscribirse a push
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidKey)
        });

        pushSubscription = subscription;
        console.log('[PushService] ✅ Suscripción push creada exitosamente');

        // Enviar suscripción al servidor
        await enviarSuscripcionAlServidor(subscription);

        return true;
    } catch (error) {
        console.error('[PushService] Error al registrar push:', error);
        return false;
    }
}

/**
 * Envía la suscripción push al servidor para almacenarla
 * @param {PushSubscription} subscription
 */
async function enviarSuscripcionAlServidor(subscription) {
    try {
        const response = await fetch(getApiUrl('/api/push-subscribe'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                subscription: subscription.toJSON(),
                timestamp: new Date().toISOString()
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        console.log('[PushService] Suscripción enviada al servidor');
    } catch (error) {
        console.error('[PushService] Error enviando suscripción al servidor:', error);
        // Guardar localmente como fallback
        try {
            localStorage.setItem('push_subscription', JSON.stringify(subscription.toJSON()));
        } catch (e) {
            // Silenciar error de localStorage
        }
    }
}

/**
 * Envía una notificación push a través del servidor (APNs para iOS)
 * 
 * ESTA es la función clave: en vez de reproducir audio con JavaScript,
 * enviamos un push al servidor que lo reenvía vía APNs, lo cual
 * permite que iOS reproduzca el sonido incluso en segundo plano.
 * 
 * @param {string} titulo - Título de la notificación
 * @param {string} cuerpo - Cuerpo/mensaje de la notificación
 * @param {Object} datos - Datos adicionales (URL, tarea ID, etc.)
 * @returns {Promise<boolean>} true si se envió exitosamente
 */
export async function enviarPushAlerta(titulo, cuerpo, datos = {}) {
    try {
        const response = await fetch(getApiUrl('/api/push-send'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: titulo,
                body: cuerpo,
                data: datos,
                // Incluir la suscripción para que el servidor sepa a quién enviar
                subscription: pushSubscription ? pushSubscription.toJSON() : null
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        console.log('[PushService] ✅ Push de alerta enviado al servidor');
        return true;
    } catch (error) {
        console.error('[PushService] Error enviando push de alerta:', error);
        return false;
    }
}

/**
 * Verifica si el usuario está suscrito a push
 * @returns {boolean}
 */
export function estaSuscrito() {
    return pushSubscription !== null;
}

/**
 * Cancela la suscripción push
 * @returns {Promise<boolean>}
 */
export async function cancelarSuscripcion() {
    if (!pushSubscription) return true;

    try {
        await pushSubscription.unsubscribe();
        pushSubscription = null;
        console.log('[PushService] Suscripción push cancelada');
        return true;
    } catch (error) {
        console.error('[PushService] Error cancelando suscripción:', error);
        return false;
    }
}
