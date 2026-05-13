/**
 * Shared constants for `@cordisjs/online`. Imported by both the Node-side
 * build scripts and the in-browser service worker; keep zero runtime
 * dependencies so the SW bundle stays tiny.
 */

export const MODULE_PREFIX = '/-/modules/'
export const MODULE_CACHE = 'online-modules'
export const META_CACHE = 'online-meta'

/**
 * Singletons MUST resolve to the host bundle, not the CDN. The SW intercepts
 * requests for these names and returns a redirect to the host-bundled URL
 * (configured by the build).
 */
export const SINGLETONS = new Set<string>([
  'vue',
  '@vueuse/core',
  'cordis',
  '@cordisjs/client',
  '@cordisjs/components',
  '@cordisjs/muon',
  '@cordisjs/plugin-loader',
  '@cordisjs/plugin-logger-console',
  '@cordisjs/plugin-webui',
  '@cordisjs/online',
  'schemastery',
  'element-plus',
])

/**
 * Node-builtin shim mapping. Keys cover both `name` and `node:name` forms;
 * the rewriter strips the `node:` prefix before lookup.
 */
export const BUILTIN_SHIMS: Record<string, string> = {
  'fs': '@cordisjs/fs',
  'fs/promises': '@cordisjs/fs/promises',
  'path': '@cordisjs/path',
  'path/posix': '@cordisjs/path/posix',
  'path/win32': '@cordisjs/path/win32',
  'url': '@cordisjs/url',
  'os': '@cordisjs/os',
  'sqlite': '@cordisjs/sqlite',
  'process': '@cordisjs/online/shim/process',
  'buffer': '@cordisjs/online/shim/buffer',
}

/**
 * Node modules with no viable browser shim. Requests get routed to a stub
 * module that throws on any access — surfaces a clear "X is not available"
 * error instead of a cryptic "Cannot read property of undefined".
 */
export const UNSHIMMABLE = new Set<string>([
  'child_process',
  'cluster',
  'net',
  'tls',
  'worker_threads',
  'http',
  'https',
  'http2',
  'dgram',
  'readline',
  'repl',
  'v8',
  'vm',
  'inspector',
  'perf_hooks',
])

/** CDN endpoints, tried in order on each request. */
export const CDN_ENDPOINTS = [
  'https://cdn.jsdelivr.net/npm',
  'https://unpkg.com',
] as const
