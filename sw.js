// sw.js
// Change the cache name when updating to cause cache refresh on progressive web apps


const CACHE_NAME = 'tetris-cache-Aug-15-2025-09:37';
const FILES_TO_CACHE = [
  '/tetris/',
  '/tetris/index.html',
  'index.html',
  'howler.min.js',
  'main.js',
  'tetromino.js',
  'tetrisIcon.png',
  'images/church.png',
  'images/controls.png',
  'images/gameOver.png',
  'images/soundOff.png',
  'images/soundOn.png',
  'images/tetrisLogo.png',
  'sounds/tetrisSprite.ac3',
  'sounds/tetrisSprite.m4a',
  'sounds/tetrisSprite.mp3',
  'sounds/tetrisSprite.ogg'
];

// Install & cache files
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      for (const file of FILES_TO_CACHE) {
        try {
          await cache.add(file);
          console.log('✅ Cached:', file);
        } catch (err) {
          console.warn('❌ Failed to cache:', file, err);
        }
      }
    })
  );
});


// Activate & remove old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      await clients.claim(); // <-- this is the correct usage
      const keys = await caches.keys();
      await Promise.all(keys.map(key => {
        if (key !== CACHE_NAME) return caches.delete(key);
      }));
    })()
  );
});


// Serve cached files or fetch from network
self.addEventListener('fetch', event => {
  // Always fetch fresh for HTML navigation requests
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/tetris/index.html'))
    );
    return;
  }

  // Otherwise serve from cache or fall back to network
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});
