// Minimal service worker so browsers offer "Install app". Network first, falling back to the last copy when offline.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  // .bin = encrypted art/audio: js/assets.js keeps its own decrypted copies, so a second (ciphertext) copy here would only take space
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin) || /\.bin$/.test(new URL(e.request.url).pathname)) return;
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open('tism').then(c => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request)));
});
