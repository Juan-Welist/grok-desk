/* Minimal shell worker. Never cache desk data (R2, /d/, state, chart, screen). */
const CACHE = "grok-desk-shell-v3";
const SHELL = [
  "./",
  "./index.html",
  "./css/app.css",
  "./js/data.js",
  "./js/odometer.js",
  "./js/chart.js",
  "./js/screens.js",
  "./js/app.js",
  "./manifest.json",
  "./apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

function isDataRequest(url) {
  const u = new URL(url);
  if (u.hostname.endsWith("r2.dev") || u.hostname.includes("r2.cloudflarestorage.com")) return true;
  if (u.pathname.includes("/d/")) return true;
  const base = u.pathname.split("/").pop() || "";
  if (/^(state|chart|activity|orders|account|bots|settings|coins)\.json$/.test(base)) return true;
  if (base === "screen.jpg") return true;
  return false;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (isDataRequest(event.request.url)) {
    event.respondWith(fetch(event.request, { cache: "no-store" }));
    return;
  }
  event.respondWith(
    caches.match(event.request).then((hit) => {
      if (hit) return hit;
      return fetch(event.request);
    })
  );
});
