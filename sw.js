const CACHE_NAME = 'hustle-planner-v1';
const SHELL_ASSETS = [
  '/class-hustle-balancer/',
  '/class-hustle-balancer/index.html',
  '/class-hustle-balancer/manifest.json',
  '/class-hustle-balancer/icon-192x192.png',
  '/class-hustle-balancer/icon-512x512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});

self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Hustle Planner';
  const options = {
    body: data.body || 'You have an update.',
    icon: '/class-hustle-balancer/icon-192x192.png',
    badge: '/class-hustle-balancer/icon-192x192.png',
    tag: data.tag || 'hustle-default',
    renotify: true,
    data: { url: data.url || '/class-hustle-balancer/' }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes('/class-hustle-balancer/') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(event.notification.data.url);
    })
  );
});
