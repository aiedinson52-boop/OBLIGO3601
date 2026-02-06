/**
 * Service Worker para Obligo360 PWA
 * Maneja cache y funcionamiento offline
 */

const CACHE_NAME = 'obligo360-v1';
const STATIC_ASSETS = [
    '/',
    '/asistente.html',
    '/src/styles/main.css',
    '/src/App.js',
    '/icons/icon-192x192.png',
    '/icons/icon-512x512.png'
];

// Instalación - Cachear recursos estáticos
self.addEventListener('install', (event) => {
    console.log('[SW] Installing...');
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
    console.log('[SW] Activating...');
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

// Notificaciones push (para futuro uso)
self.addEventListener('push', (event) => {
    if (event.data) {
        const data = event.data.json();
        const options = {
            body: data.body || 'Tienes una tarea pendiente',
            icon: '/icons/icon-192x192.png',
            badge: '/icons/icon-72x72.png',
            vibrate: [200, 100, 200],
            tag: 'obligo360-notification',
            data: data.url || '/'
        };
        event.waitUntil(
            self.registration.showNotification(data.title || 'Obligo360', options)
        );
    }
});

// Click en notificación
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.openWindow(event.notification.data)
    );
});
