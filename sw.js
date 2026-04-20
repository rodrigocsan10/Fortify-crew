/* Fortify — assets em cache; HTML da app sempre rede primeiro (atualiza sem “ficar preso”). */
/* Bump CACHE ao mudar precache (manifest/ícones). */
var CACHE = 'fortify-crew-v3';
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
  var req = e.request;
  var url;
  try {
    url = new URL(req.url);
  } catch (err) {
    return;
  }
  var sameOrigin = url.origin === self.location.origin;
  var path = url.pathname || '';
  var wantsHtml =
    req.mode === 'navigate' || (req.headers.get('accept') || '').indexOf('text/html') !== -1;
  var isAppDocument =
    wantsHtml &&
    sameOrigin &&
    (path === '/' || path === '' || /index\.html$/i.test(path));

  if (isAppDocument) {
    e.respondWith(
      fetch(req).then(function (res) {
        try {
          if (res.ok) {
            var copy = res.clone();
            caches.open(CACHE).then(function (c) {
              c.put('./index.html', copy).catch(function () {});
            });
          }
        } catch (err2) {}
        return res;
      }).catch(function () {
        return caches.match('./index.html').then(function (hit) {
          return hit || caches.match('/');
        });
      })
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(function (hit) {
      return hit || fetch(req).then(function (res) {
        try {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) {
            if (req.url.indexOf(self.location.origin) === 0) c.put(req, copy);
          });
        } catch (err3) {}
        return res;
      }).catch(function () {
        return caches.match('./index.html');
      });
    })
  );
});
