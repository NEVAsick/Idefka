const VERSION = '__VERSION__';
const FILES = __FILES__;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(FILES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  const removeOldCaches = (keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key)));
  event.waitUntil(
    caches
      .keys()
      .then(removeOldCaches)
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;

  const offlineFallback = () => (request.mode === 'navigate' ? caches.match('./index.html') : Response.error());
  event.respondWith(caches.match(request, { ignoreSearch: true }).then((cached) => cached ?? fetch(request).catch(offlineFallback)));
});
