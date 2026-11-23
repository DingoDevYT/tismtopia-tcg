// Minimal service worker so browsers offer "Install app". Network first, falling back to the last copy when offline.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open('tism').then(c => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request)));
});
