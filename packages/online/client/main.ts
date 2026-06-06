/**
 * Main-thread entry. Registers the service worker (prod only — dev
 * relies on Vite's `module-prefix` middleware), then hands off to
 * `bootstrapMain` which builds the Vue app and spawns the cordis-runtime
 * Worker.
 */

import './polyfills.ts'
import { bootstrapMain } from './bootstrap-main.ts'

async function registerServiceWorker(): Promise<void> {
  if (import.meta.env.DEV) return
  if (!('serviceWorker' in navigator)) {
    console.warn('[online] service workers not supported — CDN plugin loading will not work')
    return
  }
  try {
    await navigator.serviceWorker.register('/sw.js', { scope: '/' })
    await navigator.serviceWorker.ready
  } catch (err) {
    console.error('[online] service worker registration failed:', err)
  }
}

await registerServiceWorker()
await bootstrapMain()
