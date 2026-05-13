/**
 * Worker-side runtime: package resolution, CDN fetching, transformImport.
 *
 * Lives next to `service-worker.ts` so the SW build can bundle it. Pure ESM
 * with one async dependency — `es-module-lexer`'s WASM init runs inside the
 * worker on first call.
 */

import { buildCdnUrls, buildSwUrl, parseSpecifier } from '../src/cdn.ts'
import { BUILTIN_SHIMS, MODULE_PREFIX, SINGLETONS } from '../src/constants.ts'
import { PackageManifest, pickDependencyVersion, resolveEntry } from '../src/resolve.ts'
import { detectCjs, readyTransform, transformImports } from '../src/transform.ts'

/**
 * `pkg@version` → its parsed manifest. Cached for the SW lifetime; the
 * Cache Storage layer separately persists across SW restarts.
 */
const manifestCache = new Map<string, Promise<PackageManifest>>()

/**
 * Build-time-injected map of singleton package names to their local-bundle
 * URLs. The build script replaces this constant via Vite `define`. At dev
 * time it is empty and singletons go through the CDN like any other package
 * (Vite already enforces single-instance via its dep optimizer).
 */
declare const __SINGLETON_URLS__: Record<string, string>
const singletonMap = new Map<string, string>(Object.entries(
  typeof __SINGLETON_URLS__ === 'undefined' ? {} : __SINGLETON_URLS__,
))

/**
 * Resolve a `<pkg>@<version>` to its parsed package.json manifest. Tries
 * jsdelivr first, falls back to unpkg. Memoised.
 */
async function loadPackageManifest(pkg: string, version: string): Promise<PackageManifest> {
  const key = `${pkg}@${version}`
  let pending = manifestCache.get(key)
  if (!pending) {
    pending = (async () => {
      const urls = buildCdnUrls(pkg, version, 'package.json')
      for (const url of urls) {
        const res = await fetch(url)
        if (res.ok) return res.json() as Promise<PackageManifest>
        if (res.status === 404) break
      }
      throw new Error(`failed to fetch package.json for ${pkg}@${version}`)
    })()
    manifestCache.set(key, pending)
  }
  return pending
}

/** Build the SW URL for a (pkg, version, sub-path) triple, applying
 *  conditional-exports resolution. */
async function resolveModuleFile(pkg: string, version: string, sub: string): Promise<string> {
  const manifest = await loadPackageManifest(pkg, version)
  const file = resolveEntry(manifest, sub)
  return file
}

/**
 * Top-level fetch handler. Routes:
 *
 * - `/-/modules/-stub/<name>` → throwing stub (Node-only API).
 * - `/-/modules/<pkg>[@<version>]/<rest>` → CDN fetch + rewrite.
 * - Anything else → fall through (the SW lets the network handle it).
 */
export async function handleModuleRequest(url: URL): Promise<Response> {
  if (!url.pathname.startsWith(MODULE_PREFIX)) {
    return fetch(url)
  }
  const tail = url.pathname.slice(MODULE_PREFIX.length)

  // Stub responses for Node-only APIs we can't shim.
  if (tail.startsWith('-stub/')) {
    const name = decodeURIComponent(tail.slice('-stub/'.length))
    const body = `const handler = { get() { throw new Error(${JSON.stringify(`'${name}' is not available in cordis-online`)}) } };\nexport default new Proxy({}, handler);\n`
    return new Response(body, {
      status: 200,
      headers: { 'content-type': 'application/javascript; charset=utf-8' },
    })
  }

  const { pkg, version: parsedVersion, rest } = parseSpecifier(tail)
  if (!pkg) return new Response('not found', { status: 404 })
  const version = parsedVersion ?? 'latest'

  // Singleton bypass — serve the host bundle's copy via redirect.
  const singletonUrl = singletonMap.get(pkg)
  if (singletonUrl) {
    return Response.redirect(new URL(singletonUrl, url.origin).href, 307)
  }

  // Resolve the package.json once so the lazy version pin can attach.
  const manifest = await loadPackageManifest(pkg, version)
  const resolvedVersion = manifest.version ?? version
  const file = rest ? resolveSubpath(manifest, rest) : resolveEntry(manifest, '')

  // Bare-name request (no `<rest>` segment) — redirect to the resolved entry
  // file's full URL so `import.meta.url` ends in a real-looking path. Without
  // this, relative imports inside the served module resolve against
  // `/-/modules/<pkg>` and lose the package segment (e.g. `import './foo'`
  // becomes `/-/modules/@scope/foo` instead of `/-/modules/@scope/pkg/lib/foo`).
  // We also pin the resolved version so the canonical URL is stable across
  // reloads. The browser refetches the redirected URL; this handler runs
  // again with `rest` set and serves the actual bytes.
  if (!rest) {
    const target = `${MODULE_PREFIX}${pkg}@${resolvedVersion}/${file}`
    return Response.redirect(new URL(target, url.origin).href, 302)
  }

  // Fetch the actual file from the CDN.
  const cdnUrls = buildCdnUrls(pkg, resolvedVersion, file)
  let body: string | undefined
  let contentType = 'application/javascript; charset=utf-8'
  for (const cdnUrl of cdnUrls) {
    const res = await fetch(cdnUrl)
    if (!res.ok) {
      if (res.status === 404) break
      continue
    }
    body = await res.text()
    const ct = res.headers.get('content-type')
    if (ct) contentType = ct
    break
  }
  if (body === undefined) {
    return new Response(`failed to fetch ${pkg}@${resolvedVersion}/${file}`, { status: 502 })
  }

  // Non-JS assets pass through unmodified.
  if (!/^\.(?:m?js)$/.test(extname(file))) {
    return new Response(body, {
      status: 200,
      headers: {
        'content-type': contentType,
        'cache-control': 'public, max-age=31536000, immutable',
        // CORP — required under COEP=require-corp so the page can use this
        // response (especially `.wasm` for @cordisjs/sqlite). jsdelivr
        // sometimes serves CORP and sometimes doesn't; we synthesise our
        // own here regardless.
        'cross-origin-resource-policy': 'cross-origin',
      },
    })
  }

  // CJS bail.
  if (detectCjs(file, body, manifest.type)) {
    const msg = `CJS not supported in cordis-online v1: ${pkg}@${resolvedVersion}/${file}`
    return new Response(
      `export default (() => { throw new Error(${JSON.stringify(msg)}) })()\n`,
      { status: 200, headers: { 'content-type': 'application/javascript; charset=utf-8' } },
    )
  }

  // Rewrite bare specifiers.
  await readyTransform()
  const transformed = transformImports(body, {
    singletons: singletonMap,
    resolveImport(specifier) {
      // Node builtin shim — handled by transformImports' internal logic.
      if (BUILTIN_SHIMS[specifier]) return { pkg: specifier, version: undefined }
      if (SINGLETONS.has(specifier) && singletonMap.has(specifier)) return null
      const dep = pickDependencyVersion(manifest, specifier)
      return { pkg: specifier, version: dep }
    },
  })

  return new Response(transformed, {
    status: 200,
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
      'cache-control': 'public, max-age=31536000, immutable',
      'cross-origin-resource-policy': 'cross-origin',
    },
  })
}

function resolveSubpath(manifest: PackageManifest, sub: string): string {
  // If `sub` already points at an explicit file (has a known extension), use
  // it directly. Otherwise, walk the exports map.
  if (/\.(?:m?js|cjs|json|css|wasm|svg|png|jpg|gif|ico)$/.test(sub)) {
    return sub
  }
  return resolveEntry(manifest, sub)
}

function extname(file: string): string {
  const i = file.lastIndexOf('.')
  if (i < 0) return ''
  const slash = file.lastIndexOf('/')
  if (slash > i) return ''
  return file.slice(i)
}

/** Make `buildSwUrl` available to consumers of this module (used by the SW
 *  for log messages / debug). */
export { buildSwUrl }
