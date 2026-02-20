/**
 * API Endpoint: GET /api/push-vapid-key
 * 
 * Devuelve la clave pública VAPID para que el cliente
 * pueda suscribirse a push notifications.
 */

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    const { VAPID_PUBLIC_KEY } = process.env;

    if (!VAPID_PUBLIC_KEY) {
        return res.status(500).json({
            error: 'VAPID_PUBLIC_KEY no configurada en variables de entorno'
        });
    }

    return res.status(200).json({ publicKey: VAPID_PUBLIC_KEY });
}
