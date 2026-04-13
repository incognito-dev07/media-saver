const OFFLINE_URL = '/index.html';

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(cacheNames.map(cacheName => caches.delete(cacheName)));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request).catch(() => {
      if (event.request.mode === 'navigate') {
        return fetch(OFFLINE_URL).catch(() => {
          return new Response(
            '<html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f5f7fa;"><div style="text-align:center;padding:40px;"><h1 style="color:#9d4edd;"><i class="fas fa-wifi"></i> Offline</h1><p>No internet connection</p></div></body></html>',
            { headers: { 'Content-Type': 'text/html' } }
          );
        });
      }
    })
  );
});