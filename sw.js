
// ══════════════════════════════════════════════════════
//  FactuBF — Service Worker v2
// ══════════════════════════════════════════════════════
const CACHE     = 'factubf-v2';
const OFFLINE   = '/';
const FIREBASE  = ['firestore.googleapis.com','firebase.googleapis.com',
                   'identitytoolkit.googleapis.com','securetoken.googleapis.com',
                   'firebaseinstallations.googleapis.com'];
const CDN_CACHE = ['cdn.tailwindcss.com','www.gstatic.com','cdnjs.cloudflare.com'];

// ── Installation
self.addEventListener('install', e => {
    console.log('[SW FactuBF v2] Install');
    e.waitUntil(
        caches.open(CACHE)
            .then(c => c.addAll(['/', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png']))
            .then(() => self.skipWaiting())
            .catch(err => console.warn('[SW] Cache partiel:', err))
    );
});

// ── Activation + nettoyage
self.addEventListener('activate', e => {
    console.log('[SW FactuBF v2] Activate');
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

// ── Fetch
self.addEventListener('fetch', e => {
    const url = new URL(e.request.url);

    // Firebase → réseau pur (jamais de cache)
    if (FIREBASE.some(d => url.hostname.includes(d))) {
        e.respondWith(fetch(e.request).catch(() => new Response('', { status: 503 })));
        return;
    }

    // CDN externes → cache avec fallback réseau
    if (CDN_CACHE.some(d => url.hostname.includes(d))) {
        e.respondWith(
            caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
                if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
                return res;
            }))
        );
        return;
    }

    // Navigation (pages) → réseau d'abord, cache en fallback
    if (e.request.mode === 'navigate') {
        e.respondWith(
            fetch(e.request)
                .then(res => {
                    if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
                    return res;
                })
                .catch(() => caches.match(e.request).then(c => c || caches.match(OFFLINE)))
        );
        return;
    }

    // Reste → cache d'abord
    e.respondWith(
        caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
            if (res.ok && e.request.method === 'GET')
                caches.open(CACHE).then(c => c.put(e.request, res.clone()));
            return res;
        }).catch(() => caches.match(OFFLINE)))
    );
});

// ── Message skip waiting
self.addEventListener('message', e => {
    if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
