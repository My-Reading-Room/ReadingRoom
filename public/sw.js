/* My Reading Room service worker (#13).
 *
 * Deliberately small. It caches ONLY static, content-hashed build assets and
 * icons, so a shared device never holds anyone's library offline:
 *   - page loads (navigations): always the network; offline → /offline.html
 *   - /_next/static/* and app icons: cache first (immutable, hashed names)
 *   - everything else (RSC payloads, Server Actions, /api, Supabase, covers):
 *     not touched; the browser handles it normally.
 * Sign-out deletes every cache and unregisters this worker.
 */
const VERSION = "rr-static-v1";
const OFFLINE = "/offline.html";
const PRECACHE = [OFFLINE, "/icon.svg", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

const isStatic = (url) =>
  url.pathname.startsWith("/_next/static/") || ["/icon.svg", "/icon-192.png", "/icon-512.png"].includes(url.pathname);

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    // Never cache HTML: it contains the signed-in reader's data.
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE)));
    return;
  }
  if (isStatic(url)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            if (response.ok && response.type === "basic") {
              const copy = response.clone();
              caches.open(VERSION).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});
