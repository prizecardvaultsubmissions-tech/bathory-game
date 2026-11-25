const CACHE_NAME = "csejte-blood-ledger-v8-woods";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/style.css",
  "./js/audio.js",
  "./js/lore.js",
  "./js/map.js",
  "./js/stage_woods.js",
  "./js/stage_courtyard.js",
  "./js/stage2.js",
  "./js/stage3.js",
  "./js/render_woods_courtyard.js",
  "./js/render_stage3.js",
  "./js/render3d.js",
  "./js/textures.js",
  "./js/textures_hd.js",
  "./js/quality.js",
  "./js/characters.js",
  "./js/vendor/three.module.min.js",
  "./js/vendor/BufferGeometryUtils.js",
  "./js/monsters.js",
  "./js/weapons.js",
  "./js/enemy.js",
  "./js/game.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first so new builds reach phones right away; cache is the offline fallback.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res && res.ok && new URL(event.request.url).origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
