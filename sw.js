// Service worker: menyimpan semua berkas aplikasi supaya tetap jalan tanpa internet.
// Bagian di antara penanda diisi otomatis oleh tools/stamp-sw.mjs. Jalankan `npm run stamp` sebelum rilis.
// @stamp-start
const VERSION = '06a2309096a2';
const ASSETS = [
  './',
  './css/app.css',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-32.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './index.html',
  './js/agenda.js',
  './js/date.js',
  './js/ics.js',
  './js/main.js',
  './js/prayer.js',
  './js/quickadd.js',
  './js/reminders.js',
  './js/repeat.js',
  './js/sky.js',
  './js/store.js',
  './js/themes.js',
  './js/ui/calendar.js',
  './js/ui/dom.js',
  './js/ui/fun.js',
  './js/ui/gaya.js',
  './js/ui/ibadah.js',
  './js/ui/icons.js',
  './js/ui/look.js',
  './js/ui/rows.js',
  './js/ui/settings.js',
  './js/ui/sheet.js',
  './js/ui/tasks.js',
  './js/ui/toast.js',
  './js/ui/today.js',
  './manifest.webmanifest',
];
// @stamp-end

const CACHE = `istiqomah-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('istiqomah-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(request).catch(() => {
        if (request.mode === 'navigate') return caches.match('./index.html');
        throw new Error(`Berkas tidak tersedia saat offline: ${request.url}`);
      });
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list[0];
      if (open) return open.focus();
      return self.clients.openWindow('./');
    }),
  );
});
