/* Fortify — cache mínimo para funcionar offline depois do 1º carregamento */
/* Bump CACHE quando mudar index/manifest para clientes largarem HTML antigo em cache. */
var CACHE = 'fortify-crew-v2';
var PRECACHE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(PRECACHE);
    }).catch(function () {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(function (hit) {
      return hit || fetch(e.request).then(function (res) {
        try {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) {
            if (e.request.url.startsWith(self.location.origin)) c.put(e.request, copy);
          });
        } catch (err) {}
        return res;
      }).catch(function () {
        return caches.match('./index.html');
      });
    })
  );
});
