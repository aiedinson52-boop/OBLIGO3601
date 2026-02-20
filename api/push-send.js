/**
 * API Endpoint: POST /api/push-send
 * 
 * Envía una notificación push a un cliente específico vía Web Push / APNs.
 * 
 * El payload incluye "sound": "default" que es la clave para que iOS
 * reproduzca el sonido del sistema en segundo plano.
 * 
 * Variables de entorno requeridas:
 *   VAPID_PUBLIC_KEY  - Clave pública VAPID
 *   VAPID_PRIVATE_KEY - Clave privada VAPID
 *   VAPID_SUBJECT     - Contacto (mailto:email@ejemplo.com)
 */

import webpush from 'web-push';

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    // Verificar variables de entorno
    const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) {
        console.error('[push-send] Faltan variables de entorno VAPID');
        return res.status(500).json({
            error: 'Configuración VAPID incompleta. Configura VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT en Vercel.'
        });
    }

    try {
        const { title, body, data, subscription } = req.body;

        if (!subscription || !subscription.endpoint) {
            return res.status(400).json({ error: 'Suscripción no proporcionada' });
        }

        if (!title) {
            return res.status(400).json({ error: 'Título requerido' });
        }

        // Configurar VAPID
        webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

        // Construir payload de la notificación
        // CRÍTICO: "sound": "default" hace que iOS reproduzca el sonido del sistema
        const notificationPayload = JSON.stringify({
            title: title || 'Obligo360',
            body: body || 'Tienes una tarea pendiente',
            icon: '/icons/icon.svg',
            badge: '/icons/icon.svg',
            tag: data?.tag || `obligo360-${Date.now()}`,
            data: {
                url: data?.url || '/',
                tareaId: data?.tareaId || null,
                alertaId: data?.alertaId || null,
                timestamp: new Date().toISOString()
            },
            // Configuración APNs para iOS
            sound: 'default',
            vibrate: [200, 100, 200, 100, 200],
            requireInteraction: true
        });

        // Opciones de Web Push con headers APNs
        const pushOptions = {
            TTL: 86400, // 24 horas de vida
            urgency: 'high', // Prioridad alta para entrega inmediata
            topic: 'obligo360-alert',
            headers: {
                'Content-Type': 'application/json'
            }
        };

        // Enviar la notificación push
        const result = await webpush.sendNotification(
            subscription,
            notificationPayload,
            pushOptions
        );

        console.log(`[push-send] ✅ Push enviado exitosamente. Status: ${result.statusCode}`);

        return res.status(200).json({
            success: true,
            message: 'Notificación push enviada',
            statusCode: result.statusCode
        });

    } catch (error) {
        console.error('[push-send] Error enviando push:', error);

        // Si la suscripción ya no es válida (410 Gone), informar al cliente
        if (error.statusCode === 410 || error.statusCode === 404) {
            return res.status(410).json({
                error: 'Suscripción expirada. El usuario debe re-suscribirse.',
                expired: true
            });
        }

        return res.status(500).json({
            error: 'Error enviando notificación push',
            details: error.message
        });
    }
}
