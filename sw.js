const CACHE_NAME = 'zarbig-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/extractor.html',
  '/assets/css/style.css',
  '/assets/js/main.js',
  '/assets/js/extractor.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        return response || fetch(event.request);
      })
  );
});