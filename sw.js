/* Debate service worker — makes the app load instantly and work fully offline.
 *
 * Strategy: network-first, cache fallback (same as Yalla).
 *  - Online  → always fetch the latest file, and refresh the cache. Push a new version and
 *              everyone gets it the next time they open the app online.
 *  - Offline → serve the last version that was cached. The library + your progress keep working.
 *
 * Bump CACHE (v1 → v2 → …) on every deploy. Changing this file is what makes the browser notice a
 * new service worker; the new SW then re-fetches the shell with cache:"reload" and deletes the old
 * cache on activate, so the update lands on next open.
 */
const CACHE = "clue-v12";
const SHELL = ["./", "./index.html", "./app.css", "./app.js", "./manifest.webmanifest", "./icon-1024.png", "./knowledge.json", "./evidence.json", "./glossary.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting())
      .catch(() => {})
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  // Third-party libs we want available offline (KaTeX): cache-first, best-effort.
  // Opaque cross-origin responses can't be inspected, so just cache whatever comes back.
  if (/\/katex@/.test(req.url)) {
    e.respondWith(
      caches.match(req).then((hit) =>
        hit || fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        }).catch(() => caches.match(req))
      )
    );
    return;
  }
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((hit) => hit || caches.match("./index.html"))
      )
  );
});

/* Web Push — inert until a server (e.g. a Supabase scheduled function) sends a push.
 * Payload: { title, body, url, tag }. Shown as a notification; tapping it focuses the app.
 * Used later for "your review is due" / daily streak reminders. */
self.addEventListener("push", (e) => {
  let d = { title: "Clue", body: "Cards are due for review." };
  try { if (e.data) d = Object.assign(d, e.data.json()); } catch (_) {}
  e.waitUntil(self.registration.showNotification(d.title, {
    body: d.body, icon: "./icon-1024.png", badge: "./icon-1024.png",
    tag: d.tag || "clue", data: { url: d.url || "./" }
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "./";
  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
      for (const c of cs) { if ("focus" in c) return c.focus(); }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
