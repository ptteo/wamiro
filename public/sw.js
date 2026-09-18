/* Wamiro service worker (Phase D).
 * - Precache the app shell → the app is installable.
 * - Network-first navigations with shell fallback → soft-offline UX.
 * - Stale-while-revalidate for the announcements feed → announcements stay
 *   readable offline (the "offline-tolerant announcements feed").
 * - push → notification; notificationclick → open the target.
 *
 * Caching policy fix (was: cache-first for every .js/.css chunk with a
 * versionless cache). Old builds left zombie chunk URLs in the cache; after a
 * redeploy Next lazy-loads a client island whose chunk is still served stale,
 * the module resolves to `undefined`, and React throws
 * "Lazy element type must resolve to a class or function". Static assets are
 * now network-first (cache is the offline fallback only), navigations are
 * cached under their own URL, and the cache name is bumped to v2 so every
 * existing client purges the old entries on activate.
 */
const CACHE = "wamiro-shell-v2";
const SHELL_URLS = ["/", "/login", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const OFFLINE_FALLBACK = "/login";

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.status === 200 && response.type === "basic") {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);
  return cached || network;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) {
    // Offline-tolerant announcements feed; everything else passes through.
    if (url.pathname.startsWith("/api/v1/announcements")) {
      event.respondWith(staleWhileRevalidate(req));
    }
    return;
  }
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((response) => {
          const copy = response.clone();
          // Cache under the request's own URL — a single "/" key made every
          // navigation resolve to whatever page was cached first.
          caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
          return response;
        })
        .catch(
          async () =>
            (await caches.match(req)) ||
            (await caches.match(OFFLINE_FALLBACK)) ||
            Response.error(),
        ),
    );
    return;
  }
  // Static assets: network-first with cache fallback. Cache-first here is what
  // served stale JS chunks after deploys and crashed lazy islands; the network
  // is authoritative whenever the user is online (the overwhelmingly common
  // case), and the cache only rescues offline loads.
  if (/\.(js|css|png|svg|woff2?)$/.test(url.pathname)) {
    event.respondWith(
      fetch(req)
        .then((response) => {
          if (response && (response.ok || response.type === "opaque")) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => caches.match(req).then((hit) => hit || Response.error())),
    );
  }
});

self.addEventListener("push", (event) => {
  let data = { title: "Wamiro", body: "", url: "/" };
  try {
    if (event.data) {
      const parsed = event.data.json();
      data = { title: "Wamiro", body: "", url: "/", ...parsed };
    }
  } catch {
    /* non-JSON payload — keep defaults */
  }
  event.waitUntil(
    self.registration
      .showNotification(data.title, {
        body: data.body || "Something needs your attention in Wamiro.",
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        data: { url: data.url || "/" },
        tag: `wamiro-${Date.now()}`,
      })
      .catch(() => {}),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
      return undefined;
    }),
  );
});
