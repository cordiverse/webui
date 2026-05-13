import { init, parse } from 'es-module-lexer'
import { buildSwUrl, parseSpecifier } from './cdn.ts'
import { BUILTIN_SHIMS, MODULE_PREFIX, UNSHIMMABLE } from './constants.ts'

/**
 * Lazy initializer for the WASM lexer. Idempotent; resolves the first time
 * a caller awaits and is a no-op thereafter.
 */
export async function readyTransform(): Promise<void> {
  await init
}

export interface TransformOptions {
  /**
   * Resolve a bare specifier appearing inside the source to a `(pkg, version)`
   * pair. Typically reads from the importer's package.json dependency tree.
   * Return `null` to leave the import unchanged (caller is responsible for
   * making it resolvable via importmap or another mechanism).
   */
  resolveImport(specifier: string): { pkg: string; version?: string; rest?: string } | null
  /**
   * Names that should resolve to the host bundle rather than the CDN. The
   * rewriter emits the singleton URL (typically a relative `/assets/...` path)
   * instead of the SW module URL.
   */
  singletons?: Map<string, string>
  /**
   * Predicate. If returns true, the rewriter emits a redirect to a stub module
   * that throws on use. Defaults to the {@link UNSHIMMABLE} set.
   */
  isUnshimmable?(name: string): boolean
}

/**
 * Rewrite every bare import in `source` to a service-worker URL. Relative
 * imports (`./`, `../`) and absolute URLs are left alone.
 *
 * Dynamic `import('X')` calls with non-string-literal arguments (e.g.
 * `import(expr)`) are left alone — there's nothing to rewrite at this layer;
 * the runtime SW intercept will catch the resulting fetch.
 *
 * This function is synchronous and pure once {@link readyTransform} has
 * resolved.
 */
export function transformImports(source: string, opts: TransformOptions): string {
  const [imports] = parse(source)
  if (imports.length === 0) return source
  const singletons = opts.singletons ?? new Map<string, string>()
  const isUnshimmable = opts.isUnshimmable ?? ((name: string) => UNSHIMMABLE.has(name))

  let output = ''
  let lastIndex = 0
  for (const imp of imports) {
    const { n, s, e, t } = imp
    if (!n) continue
    if (isRelativeOrAbsolute(n)) continue
    const target = rewriteSpecifier(n, opts.resolveImport, singletons, isUnshimmable)
    if (target === null) continue
    // `t === 2` means dynamic `import('foo')` — the lexer reports `s..e` as
    // the inside of the parens INCLUDING the quotes for a string literal. We
    // emit a JSON-stringified replacement to preserve quoting.
    const replacement = t === 2 ? JSON.stringify(target) : target
    output += source.slice(lastIndex, s) + replacement
    lastIndex = e
  }
  output += source.slice(lastIndex)
  return output
}

function isRelativeOrAbsolute(spec: string): boolean {
  if (spec.startsWith('./') || spec.startsWith('../') || spec === '.' || spec === '..') return true
  if (spec.startsWith('/')) return true
  // URL-scheme check — explicitly exclude `node:` which is a Node-builtin
  // marker, not an actual URL.
  if (spec.startsWith('node:')) return false
  if (/^[a-z][a-z0-9+\-.]*:/i.test(spec)) return true
  return false
}

function rewriteSpecifier(
  specifier: string,
  resolveImport: TransformOptions['resolveImport'],
  singletons: Map<string, string>,
  isUnshimmable: (name: string) => boolean,
): string | null {
  // 1. Singleton override wins over everything — lets the caller pin e.g.
  //    a host-bundled `crypto-browserify` even though `crypto` is otherwise
  //    treated as unshimmable.
  const singletonUrl = singletons.get(specifier)
  if (singletonUrl !== undefined) return singletonUrl

  // Strip leading `node:` for builtin handling.
  const stripped = specifier.startsWith('node:') ? specifier.slice(5) : specifier

  // 2. Node builtin → @cordisjs/* shim.
  if (BUILTIN_SHIMS[stripped]) {
    const shim = BUILTIN_SHIMS[stripped]
    const parsed = parseSpecifier(shim)
    return buildSwUrl(parsed.pkg, parsed.version, parsed.rest)
  }

  // 3. Unshimmable Node builtin → stub. Anything with a `node:` prefix that
  //    we don't explicitly shim falls into this bucket too.
  if (isUnshimmable(stripped) || stripped !== specifier) {
    return `${MODULE_PREFIX}-stub/${encodeURIComponent(stripped)}`
  }

  // 4. Defer to the caller's resolver for the (pkg, version) pin.
  const parsed = parseSpecifier(specifier)
  const resolved = resolveImport(parsed.pkg)
  if (resolved === null) return null
  const version = parsed.version ?? resolved.version
  const rest = parsed.rest || resolved.rest || ''
  return buildSwUrl(resolved.pkg, version, rest)
}

/**
 * Best-effort detection of CJS vs ESM. Used at SW level to bail on CJS with
 * a clear error (v1 limitation — pre-bundled ESM only).
 */
export function detectCjs(filename: string, body: string, type: string | undefined): boolean {
  if (type === 'module') return false
  if (filename.endsWith('.mjs')) return false
  if (filename.endsWith('.cjs')) return true
  const head = body.slice(0, 512)
  if (/\b(require|module\.exports|exports\.)/.test(head)) return true
  return false
}
