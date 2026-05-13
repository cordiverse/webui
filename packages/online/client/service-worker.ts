/**
 * Service worker entry. Built as a separate Vite iife bundle (`dist/sw.js`)
 * and registered from `index.ts` in production.
 *
 * The SW intercepts requests under {@link MODULE_PREFIX} and serves
 * transformed module bodies fetched from a public npm CDN. Everything else
 * passes through to the network.
 */

/// <reference lib="WebWorker" />
declare const self: ServiceWorkerGlobalScope

import { MODULE_CACHE, MODULE_PREFIX } from '../src/constants.ts'
import { handleModuleRequest } from './sw-runtime.ts'

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (!url.pathname.startsWith(MODULE_PREFIX)) return

  event.respondWith((async () => {
    // GET-only caching. The cache key includes the full URL (which embeds
    // pkg + version + path), so cross-version collisions can't happen.
    const cache = await caches.open(MODULE_CACHE)
    const cached = await cache.match(event.request)
    if (cached) return cached

    try {
      const response = await handleModuleRequest(url)
      // Only cache successful responses with our `immutable` cache-control.
      if (response.status === 200) {
        cache.put(event.request, response.clone()).catch(() => {})
      }
      return response
    } catch (err) {
      return new Response(`SW error: ${(err as Error)?.message ?? String(err)}`, { status: 500 })
    }
  })())
})
