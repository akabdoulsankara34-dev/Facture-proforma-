// ══════════════════════════════════════════════════════
//  FactuBF — Service Worker PWA
//  Stratégie : Cache-first pour assets statiques
//              Network-first pour Firebase & API
// ══════════════════════════════════════════════════════

const CACHE_NAME    = 'factubf-v1';
const OFFLINE_URL   = '/';

// Fichiers à mettre en cache immédiatement à l'installation
const ASSETS_STATIC = [
    '/',
    '/index.html',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
];

// Domaines Firebase — toujours réseau (pas de cache)
const NETWORK_ONLY_DOMAINS = [
    'firestore.googleapis.com',
    'firebase.googleapis.com',
    'identitytoolkit.googleapis.com',
    'securetoken.googleapis.com',
    'firebaseinstallations.googleapis.com',
];

// ── Installation : mise en cache des assets statiques
self.addEventListener('install', event => {
    console.log('[SW] Installation FactuBF v1');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ASSETS_STATIC))
            .then(() => self.skipWaiting()) // active immédiatement
    );
});

// ── Activation : nettoyage des anciens caches
self.addEventListener('activate', event => {
    console.log('[SW] Activation FactuBF v1');
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys
                    .filter(key => key !== CACHE_NAME)
                    .map(key => {
                        console.log('[SW] Suppression ancien cache:', key);
                        return caches.delete(key);
                    })
            )
        ).then(() => self.clients.claim())
    );
});

// ── Interception des requêtes
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // 1. Firebase → toujours réseau (pas de cache)
    if (NETWORK_ONLY_DOMAINS.some(d => url.hostname.includes(d))) {
        event.respondWith(fetch(event.request));
        return;
    }

    // 2. Tailwind CDN & Firebase SDK (gstatic) → cache avec fallback réseau
    if (url.hostname === 'cdn.tailwindcss.com' || url.hostname === 'www.gstatic.com') {
        event.respondWith(
            caches.match(event.request).then(cached => {
                if (cached) return cached;
                return fetch(event.request).then(response => {
                    if (response && response.status === 200) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    }
                    return response;
                });
            })
        );
        return;
    }

    // 3. Requêtes navigation (pages) → réseau d'abord, cache en fallback
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    // Mettre en cache la version fraîche
                    if (response && response.status === 200) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    }
                    return response;
                })
                .catch(() => {
                    // Hors ligne → version cachée ou page offline
                    return caches.match(event.request)
                        || caches.match(OFFLINE_URL);
                })
        );
        return;
    }

    // 4. Tout le reste → cache d'abord, réseau en fallback
    event.respondWith(
        caches.match(event.request).then(cached => {
            if (cached) return cached;
            return fetch(event.request).then(response => {
                if (response && response.status === 200 && event.request.method === 'GET') {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return response;
            }).catch(() => caches.match(OFFLINE_URL));
        })
    );
});

// ── Message pour forcer la mise à jour du SW
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
