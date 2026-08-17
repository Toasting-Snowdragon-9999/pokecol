/*
 * CardCol service worker.
 *
 * Hand-rolled runtime caching rather than a generated precache manifest. The
 * app's assets are content-hashed by Vite, so caching them on first sight is
 * both safe and permanent — which means there is nothing a build step needs to
 * tell this file, and no plugin to keep in sync with it.
 *
 * Three request classes, three strategies:
 *
 *   navigations   network-first, falling back to the cached shell. A binder you
 *                 can open on a train is the whole point of installing this.
 *   hashed assets cache-first, forever. The hash is the cache key.
 *   card art      cache-first with a cap. This is the expensive stuff — a filled
 *                 binder is a few hundred images — and it never changes once
 *                 printed, so it is exactly what wants keeping.
 *
 * API responses are deliberately NOT cached here: the app already stores
 * normalised cards in IndexedDB with its own TTLs, and a second cache layer
 * with different rules is how you end up serving data nobody can invalidate.
 */

const VERSION = "v1";
const SHELL_CACHE = `cardcol-shell-${VERSION}`;
const ASSET_CACHE = `cardcol-assets-${VERSION}`;
const IMAGE_CACHE = `cardcol-images-${VERSION}`;

/** Roughly a very full binder. Card art is ~160KB each at the size we request. */
const MAX_IMAGES = 900;

/** Hosts the six providers serve card art from. */
const IMAGE_HOSTS = new Set([
  "images.pokemontcg.io",
  "images.scrydex.com",
  "cards.scryfall.io",
  "svgs.scryfall.io",
  "images.ygoprodeck.com",
  "cards.lorcast.io",
  "optcgapi.com",
  "www.apitcg.com",
  "cdn.swu-db.com",
]);

const SHELL_URLS = ["/", "/icon.svg", "/icon-192.png", "/manifest.webmanifest"];

/**
 * Discover the built JS and CSS by reading the shell HTML.
 *
 * On a first visit the page's own asset requests go out before this worker is
 * controlling anything, so they never pass through the fetch handler and never
 * land in the cache — the app would then "work offline" only for as long as the
 * browser's HTTP cache happened to hold them, which is not a guarantee.
 *
 * Scraping the entry points out of `index.html` gets the same result a
 * build-time precache manifest would, without coupling this file to the build.
 */
async function precacheAppAssets(shellHtml) {
  const urls = new Set();
  for (const match of shellHtml.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)) {
    urls.add(match[1]);
  }
  if (urls.size === 0) return;

  const cache = await caches.open(ASSET_CACHE);
  await Promise.all([...urls].map((url) => cache.add(url).catch(() => undefined)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Individually, so one 404 can't fail the whole install.
      await Promise.all(SHELL_URLS.map((url) => cache.add(url).catch(() => undefined)));

      try {
        const shell = await cache.match("/");
        if (shell) await precacheAppAssets(await shell.clone().text());
      } catch {
        /* The app still works online; offline just starts one visit later. */
      }

      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, ASSET_CACHE, IMAGE_CACHE]);
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name.startsWith("cardcol-") && !keep.has(name)).map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

/** Let the page trigger an immediate update instead of waiting for a reload. */
self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") void self.skipWaiting();
});

/**
 * Trim to `max`, oldest-inserted first.
 *
 * `cache.keys()` returns insertion order, which is a decent proxy for "least
 * recently added" — good enough for artwork, and far cheaper than tracking
 * real access times in IndexedDB just to evict pictures.
 */
async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= max) return;
  await Promise.all(keys.slice(0, keys.length - max).map((key) => cache.delete(key)));
}

async function cacheFirst(request, cacheName, { cap } = {}) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;

  const response = await fetch(request);
  // Opaque responses (no-cors image loads) report status 0 but are still usable.
  if (response && (response.ok || response.type === "opaque")) {
    await cache.put(request, response.clone());
    if (cap) void trim(cacheName, cap);
  }
  return response;
}

async function networkFirstShell(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      // Keep the latest shell so the next offline start isn't stale.
      await cache.put("/", response.clone());
    }
    return response;
  } catch {
    // Any route resolves to the SPA shell; the router sorts out the rest.
    return (await cache.match("/")) ?? (await cache.match(request)) ?? Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (request.mode === "navigate") {
    event.respondWith(networkFirstShell(request));
    return;
  }

  if (url.origin === self.location.origin) {
    // Vite emits content-hashed files here, so a hit is always correct.
    if (url.pathname.startsWith("/assets/")) {
      event.respondWith(cacheFirst(request, ASSET_CACHE));
      return;
    }
    if (/\.(png|svg|webmanifest|woff2?)$/.test(url.pathname)) {
      event.respondWith(cacheFirst(request, SHELL_CACHE));
      return;
    }
    return;
  }

  if (IMAGE_HOSTS.has(url.hostname)) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE, { cap: MAX_IMAGES }));
  }
});
