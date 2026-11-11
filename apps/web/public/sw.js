/*
 * OpenWalk service worker.
 *
 * Makes the app usable with no network after the first online visit. It does not
 * ship a fixed list of files to pre-cache (built filenames carry content hashes
 * that change every build); instead it caches responses as they are fetched, and
 * the page hands it an explicit list of files to pre-fetch so "ready for offline"
 * is definite rather than incidental.
 *
 * One special case: the basemap is a .pmtiles file the map reads with HTTP range
 * requests ("give me bytes 40000-40512"). The Cache API cannot replay ranges, so
 * this worker caches the whole file once and answers each range request itself by
 * slicing the cached bytes into a 206 Partial Content response.
 */

// Filled in at build time with a fingerprint of everything the app serves: its
// code and pages and each site's data. Any change to those changes this file,
// which is how the browser notices a new worker. In development the worker is
// not registered, so the literal placeholder never runs.
const VERSION = '__BUILD_ID__';
const CACHE = `openwalk-${VERSION}`;

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Remove caches left by previous versions of the worker.
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith('openwalk-') && name !== CACHE)
          .map((name) => caches.delete(name)),
      );
      // Take control of already-open pages so offline works without a reload.
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') {
    // The person accepted an update: replace the old worker now.
    self.skipWaiting();
    return;
  }
  if (data.type === 'CACHE_OFFLINE' && Array.isArray(data.urls)) {
    // The page knows exactly which files this site needs; pre-fetch them so the
    // app is usable offline, then report back so the UI can confirm.
    event.waitUntil(
      (async () => {
        const ok = await cacheAll(data.urls);
        if (event.source) event.source.postMessage({ type: 'OFFLINE_READY', ok });
      })(),
    );
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // never touch other origins

  if (url.pathname.endsWith('.pmtiles')) {
    event.respondWith(serveRange(request));
    return;
  }
  if (request.mode === 'navigate') {
    event.respondWith(serveNavigation(request));
    return;
  }
  event.respondWith(cacheFirst(request));
});

/**
 * Store a response, dropping the content-encoding header. fetch() hands back a
 * body that is already decoded, so keeping "content-encoding: gzip" would make
 * the browser decode the stored (already-plain) bytes a second time — which
 * fails, and is why a cached script or stylesheet would not load offline.
 */
async function put(cache, key, response) {
  if (!response.ok) return;
  if (!response.headers.has('content-encoding')) {
    await cache.put(key, response);
    return;
  }
  const body = await response.blob();
  const headers = new Headers(response.headers);
  headers.delete('content-encoding');
  headers.delete('content-length');
  await cache.put(
    key,
    new Response(body, { status: response.status, statusText: response.statusText, headers }),
  );
}

/** Cache-first: a stored copy wins; otherwise fetch, store a copy, and return it. */
async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  await put(cache, request, response.clone());
  return response;
}

/**
 * The cache key for a page. A site's map (/s/<site>/) and its share links
 * (/p/<site>/<place>) are one document, served per site so that it carries the
 * site's own name and manifest; any other route is the plain app shell.
 */
function pageKey(url) {
  const match = /^\/(?:s|p)\/([a-z0-9-]+)(?:\/|$)/.exec(url.pathname);
  return match ? `/s/${match[1]}/` : '/index.html';
}

/**
 * Pages: try the network first so a fresh page is picked up online, and fall
 * back to the stored copy when offline. Each site's page is stored under one
 * stable key, so every route within the site reuses it.
 */
async function serveNavigation(request) {
  const cache = await caches.open(CACHE);
  const key = pageKey(new URL(request.url));
  try {
    const response = await fetch(request);
    await put(cache, key, response.clone());
    return response;
  } catch (err) {
    const page =
      (await cache.match(key)) ||
      (await cache.match('/index.html')) ||
      (await cache.match(request));
    if (page) return page;
    throw err;
  }
}

/** Pre-fetch a set of URLs into the cache. Resolves true only if all succeeded. */
async function cacheAll(urls) {
  const cache = await caches.open(CACHE);
  const results = await Promise.all(
    urls.map(async (raw) => {
      try {
        const key = pmtilesKey(raw) || raw;
        const response = await fetch(key);
        if (response.ok) {
          await put(cache, key, response);
          return true;
        }
      } catch (err) {
        // Treated as a failure below.
        void err;
      }
      return false;
    }),
  );
  return results.every(Boolean);
}

// --- pmtiles range handling -------------------------------------------------

/** The clean cache key for a .pmtiles file: its URL with no query or range. */
function pmtilesKey(rawUrl) {
  const url = new URL(rawUrl, self.location.origin);
  if (!url.pathname.endsWith('.pmtiles')) return null;
  return url.origin + url.pathname;
}

/**
 * Serve a byte range of a .pmtiles file from a single cached copy of the whole
 * file. The file is fetched and cached once; every range request is answered by
 * slicing the cached bytes into a 206 response built here.
 */
async function serveRange(request) {
  const cache = await caches.open(CACHE);
  const key = pmtilesKey(request.url);

  let full = await cache.match(key);
  if (!full) {
    const fetched = await fetch(key); // whole file, no Range header
    await put(cache, key, fetched.clone());
    full = fetched;
  }

  const range = request.headers.get('range');
  if (!range) return full; // not a range request: hand back the whole file

  const buffer = await full.arrayBuffer();
  const total = buffer.byteLength;
  const match = /bytes=(\d+)-(\d*)/.exec(range);
  if (!match) return full;
  const start = Number(match[1]);
  const end = match[2] ? Math.min(Number(match[2]), total - 1) : total - 1;
  const slice = buffer.slice(start, end + 1);
  return new Response(slice, {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Content-Length': String(slice.byteLength),
      'Accept-Ranges': 'bytes',
    },
  });
}
