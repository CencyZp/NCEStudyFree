/* NCE StudyFree service worker：离线缓存与按册数据更新。 */
const CACHE = 'nce-study-v3';
const CORE = [
  './',
  './index.html',
  './404.html',
  './css/styles.css',
  './manifest.webmanifest',
  './js/app.js',
  './js/router.js',
  './js/store.js',
  './js/srs.js',
  './js/exercises.js',
  './js/ui.js',
  './js/tts.js',
  './js/recorder.js',
  './js/views/home.js',
  './js/views/book.js',
  './js/views/lesson.js',
  './js/views/review.js',
  './js/views/stats.js',
  './js/views/settings.js',
  './js/views/search.js',
  './data/books.js',
  './data/search-index.js',
  './data/book1.js',
  './data/book2.js',
  './data/book3.js',
  './data/book4.js',
  './assets/icons/favicon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // 逐个缓存，个别资源缺失不影响整体安装
      await Promise.all(CORE.map((url) => cache.add(url).catch(() => {})));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            // 只清理本项目自己的旧缓存，避免影响同源（cencyzp.github.io）其它项目
            .filter((key) => key.startsWith('nce-study-') && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('./index.html').then((response) => response || caches.match('./'))),
    );
    return;
  }

  const isData = url.pathname.includes('/data/');
  if (isData) {
    // 课程数据：先给缓存，同时后台更新
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            if (response.ok) caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
            return response;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
    return;
  }

  // 静态资源：先给缓存保证离线，同时后台回源更新，下次访问即为新版本
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok && response.type === 'basic') {
            caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
