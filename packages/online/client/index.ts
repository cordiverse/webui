// Polyfills MUST be imported first — third-party CDN modules read
// `globalThis.process` at top-level evaluation time.
import './polyfills.ts'

import { bootstrap } from './bootstrap.ts'

// Service worker — production only. Dev relies on Vite for bare-specifier
// resolution. Registered before bootstrap() so subsequent dynamic imports of
// CDN URLs go through the SW.
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
await bootstrap()
