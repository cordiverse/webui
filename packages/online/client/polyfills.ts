/**
 * Browser-side bootstrap shims. Loaded first by `client/index.ts`, before
 * any CDN-served module gets a chance to evaluate. Several plugin packages
 * read `globalThis.process` at top-level — those reads must see at least
 * a minimal object, not `undefined`.
 *
 * Vite's `define` covers `process.env.NODE_ENV` for the local bundle, but
 * third-party CDN code reads `process` as an object — without this shim,
 * any module probing `process.platform` or `process.env` at the top level
 * throws. The shim is intentionally minimal; if a plugin needs more, it can
 * import `process` itself (the SW will route to a real polyfill package).
 */

const g = globalThis as any

g.process ??= {
  env: { NODE_ENV: 'production', CORDIS_ENV: 'browser' },
  cwd: () => '/',
  platform: 'browser',
  argv: [],
  versions: {},
  nextTick: (fn: (...args: any[]) => void, ...args: any[]) => queueMicrotask(() => fn(...args)),
}

g.global ??= globalThis
