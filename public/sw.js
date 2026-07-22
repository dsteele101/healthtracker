/* Health Tracker service worker.
 *
 * Scope is deliberately narrow: cache the app shell so the PWA launches without
 * a network, and get out of the way of everything else. Entry data lives in
 * IndexedDB and syncs through /api/*, so the service worker must never try to
 * cache or replay those requests.
 */

const VERSION = 'v1'
const SHELL_CACHE = `shell-${VERSION}`
const ASSET_CACHE = `assets-${VERSION}`

// Best-effort precache. Icons are stable; '/' gives us an offline launch.
const SHELL_URLS = ['/', '/icon-192.png', '/icon-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE)
      // Individually, so one failure (e.g. installing while offline) doesn't
      // abort the whole install the way cache.addAll would.
      await Promise.allSettled(SHELL_URLS.map((url) => cache.add(url)))
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, ASSET_CACHE])
      const names = await caches.keys()
      await Promise.all(names.filter((n) => !keep.has(n)).map((n) => caches.delete(n)))
      await self.clients.claim()
    })(),
  )
})

/* Cloudflare Access sits in front of this app. When a session expires, a request
 * for a page returns a redirect to the Access login origin rather than our HTML.
 * Caching that would pin a login page in place of the app shell and leave the
 * installed PWA permanently broken — so anything redirected or cross-origin is
 * served through but never stored. */
function isCacheable(request, response) {
  if (!response || !response.ok) return false
  if (response.redirected) return false
  if (response.type === 'opaque' || response.type === 'opaqueredirect') return false
  try {
    return new URL(response.url || request.url).origin === self.location.origin
  } catch {
    return false
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event

  // Never interfere with writes, and never cache them.
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // API traffic is the sync layer's business. It needs real network results
  // (including failures) to decide whether to keep rows queued.
  if (url.pathname.startsWith('/api/')) return

  // Content-hashed build output never changes under a given URL.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request, ASSET_CACHE))
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(navigationHandler(request))
    return
  }

  event.respondWith(staleWhileRevalidate(request, ASSET_CACHE))
})

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request)
  if (cached) return cached

  const response = await fetch(request)
  if (isCacheable(request, response)) {
    const cache = await caches.open(cacheName)
    cache.put(request, response.clone())
  }
  return response
}

async function navigationHandler(request) {
  // Network-first: the app shell is small and we'd rather have fresh markup.
  try {
    const response = await fetch(request)
    if (isCacheable(request, response)) {
      const cache = await caches.open(SHELL_CACHE)
      cache.put('/', response.clone())
    }
    // A redirect (expired Access session) is returned to the browser so it can
    // follow the login flow — it just doesn't get written to the cache above.
    return response
  } catch {
    // Offline. Any cached shell will do; the client renders from IndexedDB.
    const cached = (await caches.match(request)) || (await caches.match('/'))
    if (cached) return cached
    return new Response(
      '<!doctype html><meta charset="utf-8"><title>Offline</title>' +
        '<body style="font-family:system-ui;padding:2rem">' +
        '<h1>Offline</h1><p>The app shell has not been cached yet. ' +
        'Open this page once while online to install it.</p>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    )
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cached = await caches.match(request)

  const network = fetch(request)
    .then(async (response) => {
      if (isCacheable(request, response)) {
        const cache = await caches.open(cacheName)
        cache.put(request, response.clone())
      }
      return response
    })
    .catch(() => undefined)

  if (cached) return cached

  const response = await network
  if (response) return response
  return new Response('', { status: 504, statusText: 'Offline' })
}
