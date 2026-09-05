/* Wamiro service worker (Phase D).
 * - Precache the app shell → the app is installable.
 * - Network-first navigations with shell fallback → soft-offline UX.
 * - Stale-while-revalidate for the announcements feed → announcements stay
 *   readable offline (the "offline-tolerant announcements feed").
 * - push → notification; notificationclick → open the target.
 */
const CACHE = "wamiro-shell-v1";
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
          caches.open(CACHE).then((cache) => cache.put("/", copy)).catch(() => {});
          return response;
        })
        .catch(async () => (await caches.match(req)) || (await caches.match("/")) || (await caches.match(OFFLINE_FALLBACK)) || Response.error()),
    );
    return;
  }
  // Static assets: cache-first after first paint.
  if (/\.(js|css|png|svg|woff2?)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
        return response;
      })),
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
