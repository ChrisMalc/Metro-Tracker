/* =====================================================
   DC Metro Tracker — Service Worker

   Strategy:
   - App shell (HTML, manifest): Cache-first, update in background
   - API calls (WMATA): Network-first, fall back to cached response
   ===================================================== */

const CACHE_NAME = 'metro-tracker-v1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest'
];

// Install: pre-cache app shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch: route requests to appropriate strategy
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // API calls → network-first
  if (url.hostname === 'api.wmata.com') {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Everything else → cache-first
  event.respondWith(cacheFirst(event.request));
});

// Network-first: try network, fall back to cache
async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    // Cache successful API responses
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // Network failed — try cache
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    // Nothing cached either
    return new Response(
      JSON.stringify({ error: 'Offline — no cached data available' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// Cache-first: try cache, fall back to network (and update cache)
async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) {
    // Update cache in background
    fetch(request)
      .then(response => {
        if (response.ok) {
          cache.put(request, response);
        }
      })
      .catch(() => {});
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    return new Response('Offline', { status: 503 });
  }
}
