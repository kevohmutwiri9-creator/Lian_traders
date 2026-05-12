// Basic service worker for Lian Traders
const CACHE_NAME = 'lian-traders-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/static/css/',
  '/static/js/',
  '/assets/lian_traders.png'
];

self.addEventListener('install', (event) => {
  // Service worker installed
});

self.addEventListener('fetch', (event) => {
  // Handle fetch requests
  event.respondWith(
    fetch(event.request).catch(() => {
      // Return offline page or cached response
      return caches.match(event.request);
    })
  );
});