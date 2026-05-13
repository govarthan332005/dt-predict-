// Service Worker — v2 Turbo: aggressive caching, stale-while-revalidate, low RAM
const CACHE = 'dt-predictor-v2';
const ASSETS = [
    './',
    './index.html',
    './css/style.css',
    './js/app.js',
    './js/predictor.js',
    './js/overlay.js',
    './js/sound.js',
    './js/firebase-config.js',
    './manifest.json'
];

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(() => {})
    );
    self.skipWaiting();
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

// Stale-while-revalidate strategy — instant from cache, refresh in background
self.addEventListener('fetch', e => {
    const req = e.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);

    // Firebase realtime DB — always network (skip cache)
    if (url.hostname.includes('firebaseio.com') || url.hostname.includes('googleapis.com')) {
        return;
    }

    // For Google fonts CSS & gstatic font files — cache-first
    if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com') || url.hostname.includes('gstatic.com')) {
        e.respondWith(
            caches.match(req).then(cached => {
                const fetched = fetch(req).then(res => {
                    if (res && res.status === 200) {
                        const clone = res.clone();
                        caches.open(CACHE).then(c => c.put(req, clone));
                    }
                    return res;
                }).catch(() => cached);
                return cached || fetched;
            })
        );
        return;
    }

    // App assets — stale-while-revalidate
    e.respondWith(
        caches.match(req).then(cached => {
            const fetched = fetch(req).then(res => {
                if (res && res.status === 200 && res.type !== 'opaque') {
                    const clone = res.clone();
                    caches.open(CACHE).then(c => c.put(req, clone));
                }
                return res;
            }).catch(() => cached || caches.match('./index.html'));
            return cached || fetched;
        })
    );
});
