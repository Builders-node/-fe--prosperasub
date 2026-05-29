const CACHE = 'prosperasub-v3';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = e.request.url;
  if (url.includes('/api/') || url.includes('supabase')) return;
  // Never cache hashed assets — Vite fingerprints them, browser handles caching
  if (url.includes('/assets/')) return;

  e.respondWith(
    fetch(e.request)
      .catch(() => caches.match(e.request))
  );
});
