/**
 * Resolve a `package.json#exports` field into a concrete sub-path for the
 * browser. Mirrors Node's "exports" resolution algorithm but with a fixed
 * condition order tailored to ESM-in-browser:
 *
 *   browser > module > import > default > require (last resort)
 *
 * We intentionally rank `module` above `import` because some packages publish
 * a Node-only file under `import` (e.g. it imports `node:fs`) and a true
 * browser-ESM file under `module`. Within Node these conditions are mutually
 * exclusive; here we have to pick what looks most likely to work in the
 * browser, and `module` is the older convention that browser-targeted packages
 * still use.
 */

export type ExportsField = string | { [key: string]: ExportsField } | null

export interface PackageManifest {
  name?: string
  version?: string
  type?: 'module' | 'commonjs'
  main?: string
  module?: string
  browser?: string | Record<string, string | false>
  exports?: ExportsField
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
}

const DEFAULT_CONDITIONS = ['browser', 'module', 'import', 'default', 'require'] as const

function resolveConditional(node: ExportsField, conditions: readonly string[] = DEFAULT_CONDITIONS): string | undefined {
  if (node === null || node === undefined) return undefined
  if (typeof node === 'string') return node
  if (Array.isArray(node)) {
    for (const item of node as ExportsField[]) {
      const r = resolveConditional(item, conditions)
      if (r) return r
    }
    return undefined
  }
  for (const cond of conditions) {
    if (cond in node) {
      const r = resolveConditional(node[cond], conditions)
      if (r) return r
    }
  }
  return undefined
}

/**
 * Resolve the entry path for a (manifest, subpath) pair.
 * - subpath is the path AFTER the package name, with no leading slash
 *   (`''` for the package root, `'lib/sub.js'` for a sub-import).
 * - returns the relative path inside the package tarball, with a leading
 *   slash stripped (caller prepends the CDN base + `pkg@version/`).
 */
export function resolveEntry(manifest: PackageManifest, subpath = ''): string {
  const exports = manifest.exports
  if (exports !== undefined && exports !== null) {
    if (typeof exports === 'string') {
      if (!subpath) return stripDotSlash(exports)
      return joinSubpath(stripDotSlash(exports), subpath)
    }
    if (typeof exports === 'object' && !Array.isArray(exports)) {
      // Detect "subpath exports" (keys all start with `./`) vs "conditional
      // exports at root" (keys are conditions like `browser`/`import`).
      const keys = Object.keys(exports)
      const isSubpathMap = keys.length > 0 && keys.every(k => k.startsWith('.') || k.startsWith('#'))
      if (isSubpathMap) {
        const wanted = subpath ? `./${subpath}` : '.'
        // Exact match first.
        if (exports[wanted]) {
          const r = resolveConditional(exports[wanted])
          if (r) return stripDotSlash(r)
        }
        // Pattern match — `./foo/*` style.
        for (const k of keys) {
          if (!k.includes('*')) continue
          const re = patternToRegExp(k)
          const match = re.exec(wanted)
          if (!match) continue
          const target = exports[k]
          const resolved = resolveConditional(target)
          if (!resolved) continue
          return stripDotSlash(resolved.replace(/\*/g, match[1] ?? ''))
        }
        // Fall back to root.
        if (!subpath || subpath === '.') {
          const r = exports['.']
          if (r) {
            const rr = resolveConditional(r)
            if (rr) return stripDotSlash(rr)
          }
        }
      } else {
        // Root-conditional shape: { browser, import, default, ... }
        const r = resolveConditional(exports)
        if (r) return subpath ? joinSubpath(stripDotSlash(r), subpath) : stripDotSlash(r)
      }
    }
  }

  // Fall through to top-level fields (no `exports` or unmatched).
  if (subpath) return subpath

  if (typeof manifest.browser === 'string') return stripDotSlash(manifest.browser)
  if (manifest.module) return stripDotSlash(manifest.module)
  if (manifest.main) return stripDotSlash(manifest.main)
  return 'index.js'
}

function stripDotSlash(p: string): string {
  if (p.startsWith('./')) return p.slice(2)
  if (p.startsWith('/')) return p.slice(1)
  return p
}

function joinSubpath(entry: string, sub: string): string {
  // When `exports` is a single string (or root-conditional), and the caller
  // asked for a subpath, the package didn't declare it — fall back to
  // returning the subpath literally (the CDN will 404 if it's invalid).
  void entry
  return sub
}

function patternToRegExp(pattern: string): RegExp {
  // Convert `./foo/*` → /^\.\/foo\/(.*)$/.  Only one `*` is allowed per the
  // npm exports spec.
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace('*', '(.*)')
  return new RegExp(`^${escaped}$`)
}

/**
 * Pull a dependency's version range from an importer's package.json. Walks
 * dependencies → peerDependencies → optionalDependencies. Returns undefined
 * if not declared (caller falls back to `latest`).
 */
export function pickDependencyVersion(importer: PackageManifest, dep: string): string | undefined {
  return importer.dependencies?.[dep]
    ?? importer.peerDependencies?.[dep]
    ?? importer.optionalDependencies?.[dep]
}
