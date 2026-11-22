const CACHE = 'reading-room-v2.4.3-series-catalog';
const COVER_CACHE = 'reading-room-cover-images-v1';
const COVER_LIMIT = 160;
const APP_SHELL = ['/', '/index.html', '/style.css', '/design-tokens.css', '/app.js', '/catalog.js', '/goodreads-import.js', '/import-enrichment.js', '/library-view.js', '/book-detail-metadata.js', '/db.js', '/reading-metrics.js', '/reading-habits.js', '/reading-replay.js', '/reading-replay-view.js', '/replay-ready.js', '/session-start-suggestion.js', '/calendar-week.js', '/tracking-start.js', '/reading-history.js', '/session-clock.js', '/session-book-picker.js', '/session-page-progress.js', '/friend-feed.js', '/friend-comparison.js', '/friend-comparison-view.js', '/book-chart-colors.js', '/chapter-sourcing.js', '/series-insights.js', '/series-catalog.js', '/tbr-transitions.js', '/library-drilldown.js', '/config.js', '/manifest.webmanifest', '/assets/icon.svg', '/assets/icon-192.png', '/assets/icon-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== COVER_CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Covers load only as images enter the viewport (native loading=lazy).
  // Cross-origin HTTPS covers are cached on demand for subsequent scrolls.
  // Opaque responses are expected for no-cors <img> requests.
  if (req.destination === 'image' && url.protocol === 'https:' && url.origin !== location.origin) {
    event.respondWith((async () => {
      const cache = await caches.open(COVER_CACHE);
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const response = await fetch(req);
        if (response.ok || response.type === 'opaque') {
          await cache.put(req,response.clone());
          const keys=await cache.keys();
          if(keys.length>COVER_LIMIT) await Promise.all(keys.slice(0,keys.length-COVER_LIMIT).map(key=>cache.delete(key)));
        }
        return response;
      } catch(err) { return cached || Response.error(); }
    })());
    return;
  }
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  if (req.url.includes('config.js')) {
    event.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }
  event.respondWith(fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req)));
});
