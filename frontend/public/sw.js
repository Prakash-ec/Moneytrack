const VERSION = 'moneytrack-v2'
const STATIC_CACHE = `${VERSION}-static`
const PAGE_CACHE = `${VERSION}-pages`
const SHELL_URLS = [
  '/',
  '/offline.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
]

async function cacheAppShell() {
  const cache = await caches.open(STATIC_CACHE)
  await cache.addAll(SHELL_URLS)

  try {
    const indexResponse = await fetch('/index.html', { cache: 'reload' })
    if (!indexResponse.ok) return
    const html = await indexResponse.clone().text()
    await cache.put('/index.html', indexResponse)

    const pending = []
    const seen = new Set()
    const addAssets = (text) => {
      for (const match of text.matchAll(
        /assets\/[A-Za-z0-9._-]+\.(?:js|css|woff2|png|svg)/g,
      )) {
        const url = `/${match[0]}`
        if (!seen.has(url) && !pending.includes(url)) pending.push(url)
      }
    }

    addAssets(html)
    while (pending.length > 0) {
      const batch = pending.splice(0, 8)
      await Promise.allSettled(
        batch.map(async (url) => {
          if (seen.has(url)) return
          seen.add(url)
          const response = await fetch(url, { cache: 'reload' })
          if (!response.ok) return
          await cache.put(url, response.clone())
          if (/\.(?:js|css)$/.test(url)) {
            addAssets(await response.text())
          }
        }),
      )
    }
  } catch {
    // A cached shell is still useful even if optional assets were not precached.
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(cacheAppShell().then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('moneytrack-') && key !== STATIC_CACHE && key !== PAGE_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

function isCacheableAsset(url) {
  return (
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/icons/') ||
    ['/favicon.svg', '/manifest.webmanifest'].includes(url.pathname)
  )
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Financial API responses are never cached.
  if (url.pathname.startsWith('/api/')) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(PAGE_CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        })
        .catch(async () => {
          return (
            (await caches.match(request)) ||
            (await caches.match('/')) ||
            (await caches.match('/offline.html'))
          )
        }),
    )
    return
  }

  if (isCacheableAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        })
      }),
    )
  }
})
