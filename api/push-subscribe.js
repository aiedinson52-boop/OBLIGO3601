/**
 * API Endpoint: POST /api/push-subscribe
 * 
 * Recibe y almacena suscripciones push de los clientes.
 * Las suscripciones se guardan en memoria (Map) para este MVP.
 * Para producción, migrar a Firestore.
 */

// Almacenamiento en memoria de suscripciones
// En producción, usar Firestore o una base de datos persistente
const subscriptions = globalThis.__pushSubscriptions || new Map();
globalThis.__pushSubscriptions = subscriptions;

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

    try {
        const { subscription, timestamp } = req.body;

        if (!subscription || !subscription.endpoint) {
            return res.status(400).json({ error: 'Suscripción inválida' });
        }

        // Usar el endpoint como clave única
        const key = subscription.endpoint;
        subscriptions.set(key, {
            subscription,
            timestamp: timestamp || new Date().toISOString(),
            lastActive: new Date().toISOString()
        });

        console.log(`[push-subscribe] Suscripción guardada. Total: ${subscriptions.size}`);

        return res.status(200).json({
            success: true,
            message: 'Suscripción registrada exitosamente'
        });
    } catch (error) {
        console.error('[push-subscribe] Error:', error);
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}
