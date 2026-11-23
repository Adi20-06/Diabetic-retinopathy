/* DR Triage service worker: lets the app open with no internet.
   It saves page "shells" plus the app's code and styles. It never touches API calls or patient data. */
const VERSION = "v1";
const PAGES = `dr-pages-${VERSION}`, STATIC = `dr-static-${VERSION}`;
const PRECACHE = ["/offline.html", "/icon-192.png", "/icon-512.png"];
const WAIT_MS = 4000;                       // on a bad connection, give up waiting for the network after 4 s and use the saved page

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(STATIC).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== PAGES && k !== STATIC) await caches.delete(k);   // old versions
    const c = await caches.open(STATIC), keys = await c.keys();
    for (const r of keys.slice(0, Math.max(0, keys.length - 600)))                                  // stop it growing forever
      if (!PRECACHE.some((p) => r.url.endsWith(p))) await c.delete(r);
    await self.clients.claim();
  })());
});

const pageKey = (href) => { const u = new URL(href); return new Request(u.origin + u.pathname); };   // /x?id=1 and /x share one saved shell
const cacheable = (res) => res && res.ok && res.type === "basic" && !res.redirected;               // never save a login redirect as a page

self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;   // API and data: never cached
  if (url.pathname.startsWith("/_next/static/") || PRECACHE.includes(url.pathname)) e.respondWith(staticFirst(req));
  else if (req.mode === "navigate") e.respondWith(pageFirst(req));
});

async function staticFirst(req) {
  const c = await caches.open(STATIC), hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (cacheable(res)) c.put(req, res.clone());
  return res;
}

async function pageFirst(req) {
  const cache = await caches.open(PAGES);
  const net = fetch(req).then((res) => { if (cacheable(res)) cache.put(pageKey(req.url), res.clone()); return res; });
  net.catch(() => {});
  try {
    const res = await Promise.race([net, new Promise((r) => setTimeout(() => r(null), WAIT_MS))]);
    if (res) return res;
  } catch (_) { /* offline: fall through to the saved copy */ }
  const hit = await cache.match(pageKey(req.url));
  if (hit) return hit;
  try { return await net; } catch (_) { return (await caches.match("/offline.html")) || Response.error(); }
}

self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "warm") e.waitUntil(warm(e.data.urls || []));
});

/** Visit the portal's pages once while online and save them, with every script and style they use. */
async function warm(urls) {
  const pages = await caches.open(PAGES), stat = await caches.open(STATIC), assets = new Set();
  for (const u of urls) {
    try {
      const href = new URL(u, self.location.origin).href;
      const res = await fetch(href, { credentials: "same-origin", headers: { Accept: "text/html" } });
      if (!cacheable(res)) continue;
      await pages.put(pageKey(href), res.clone());
      const found = (await res.text()).match(/static\/(?:chunks|css|media)\/[^"'\\\s<>)]+/g);
      if (found) found.forEach((m) => assets.add("/_next/" + m));
    } catch (_) {}
  }
  const list = [...assets];
  for (let i = 0; i < list.length; i += 6)
    await Promise.allSettled(list.slice(i, i + 6).map(async (a) => {
      if (await stat.match(a)) return;
      const r = await fetch(a);
      if (cacheable(r)) await stat.put(a, r);
    }));
}