/* global self, caches, fetch, URL */

const STATIC_CACHE = 'omaxe-static-v1'
const RUNTIME_CACHE = 'omaxe-runtime-v1'
const OFFLINE_URL = '/offline.html'

const precacheUrls = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg', '/icon-maskable.svg', OFFLINE_URL]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(precacheUrls)).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key)),
      ),
    ).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const responseClone = response.clone()
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, responseClone))
          return response
        })
        .catch(async () => {
          const cached = await caches.match(request)
          if (cached) return cached
          return caches.match(OFFLINE_URL)
        }),
    )
    return
  }

  if (['script', 'style', 'font', 'image'].includes(request.destination)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const networkFetch = fetch(request)
          .then((response) => {
            const responseClone = response.clone()
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, responseClone))
            return response
          })
          .catch(() => cached)

        return cached || networkFetch
      }),
    )
  }
})
