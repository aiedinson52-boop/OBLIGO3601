/**
 * Service Worker para Obligo360 PWA
 * Maneja cache, funcionamiento offline y Web Push Notifications
 * 
 * IMPORTANTE: Este SW maneja notificaciones push vía APNs.
 * El campo "sound" en el payload hace que iOS reproduzca
 * el sonido del sistema incluso en segundo plano.
 */

const CACHE_NAME = 'obligo360-v3';
const STATIC_ASSETS = [
    '/',
    '/asistente.html',
    '/src/styles/main.css',
    '/src/App.js',
    '/icons/icon.svg'
];

// Instalación - Cachear recursos estáticos
self.addEventListener('install', (event) => {
    console.log('[SW] Installing v3...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => self.skipWaiting())
    );
});

// Activación - Limpiar caches antiguos
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating v3...');
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => name !== CACHE_NAME)
                        .map((name) => caches.delete(name))
                );
            })
            .then(() => self.clients.claim())
    );
});

// Fetch - Estrategia Network First con fallback a cache
self.addEventListener('fetch', (event) => {
    // Ignorar requests de API (siempre necesitan red)
    if (event.request.url.includes('/api/')) {
        return;
    }

    // Ignorar requests de Firebase
    if (event.request.url.includes('firebase') ||
        event.request.url.includes('googleapis')) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Clonar respuesta para guardar en cache
                const responseClone = response.clone();
                caches.open(CACHE_NAME)
                    .then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                return response;
            })
            .catch(() => {
                // Si falla la red, buscar en cache
                return caches.match(event.request)
                    .then((cachedResponse) => {
                        if (cachedResponse) {
                            return cachedResponse;
                        }
                        // Fallback a página principal para navegación
                        if (event.request.mode === 'navigate') {
                            return caches.match('/');
                        }
                        return new Response('Offline', { status: 503 });
                    });
            })
    );
});

/**
 * EVENTO PUSH — Recibe notificaciones push del servidor vía APNs
 * 
 * Este es el handler crítico: cuando el servidor envía un push con
 * "sound": "default", iOS reproduce el sonido del sistema automáticamente.
 * No depende de JavaScript ni del estado de la app.
 */
self.addEventListener('push', (event) => {
    console.log('[SW] Push recibido');

    let notificationData = {
        title: 'Obligo360',
        body: 'Tienes una tarea pendiente',
        icon: '/icons/icon.svg',
        badge: '/icons/icon.svg',
        tag: 'obligo360-notification',
        data: { url: '/' }
    };

    if (event.data) {
        try {
            const payload = event.data.json();
            notificationData = {
                title: payload.title || notificationData.title,
                body: payload.body || notificationData.body,
                icon: payload.icon || notificationData.icon,
                badge: payload.badge || notificationData.badge,
                tag: payload.tag || notificationData.tag,
                data: payload.data || notificationData.data
            };
        } catch (e) {
            // Si no es JSON, usar el texto plano como body
            notificationData.body = event.data.text() || notificationData.body;
        }
    }

    const options = {
        body: notificationData.body,
        icon: notificationData.icon,
        badge: notificationData.badge,
        tag: notificationData.tag,
        data: notificationData.data,
        // Vibración para dispositivos que lo soporten
        vibrate: [200, 100, 200, 100, 200],
        // Mantener la notificación hasta que el usuario interactúe
        requireInteraction: true,
        // Acciones en la notificación (Android; iOS las ignora pero no causa error)
        actions: [
            { action: 'open', title: '📋 Ver tarea' },
            { action: 'dismiss', title: '✕ Descartar' }
        ]
    };

    event.waitUntil(
        self.registration.showNotification(notificationData.title, options)
    );
});

/**
 * Click en notificación — Abre o enfoca la app
 */
self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Notification click:', event.action);

    event.notification.close();

    // Si el usuario descartó, no hacer nada
    if (event.action === 'dismiss') {
        return;
    }

    // URL a abrir (viene del payload push)
    const targetUrl = event.notification.data?.url || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                // Si la app ya está abierta, enfocarla
                for (const client of clientList) {
                    if (client.url.includes(self.location.origin) && 'focus' in client) {
                        client.focus();
                        // Enviar mensaje a la app con datos de la notificación
                        client.postMessage({
                            type: 'NOTIFICATION_CLICK',
                            data: event.notification.data
                        });
                        return;
                    }
                }
                // Si no está abierta, abrirla
                return clients.openWindow(targetUrl);
            })
    );
});

/**
 * Cierre de notificación (sin click)
 */
self.addEventListener('notificationclose', (event) => {
    console.log('[SW] Notificación cerrada sin interacción');
});
