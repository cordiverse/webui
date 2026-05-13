import { CDN_ENDPOINTS, MODULE_PREFIX } from './constants.ts'

/**
 * Parse a package specifier into `{ scope, name, version, rest }`.
 *
 * Inputs are CDN-style: `pkg`, `@scope/pkg`, `pkg@1.2.3`, `@scope/pkg@1.2.3/sub`.
 * The version is optional; callers fall back to `latest` or to whatever the
 * importer's `dependencies` field says.
 */
export interface ParsedSpecifier {
  /** Full package name including scope (e.g. `@cordisjs/client`). */
  pkg: string
  /** Version pin, or undefined if the input had no `@<version>` segment. */
  version?: string
  /** Path remainder after `pkg[@version]/`, with no leading slash. */
  rest: string
}

export function parseSpecifier(input: string): ParsedSpecifier {
  let pkg: string
  let rest: string
  if (input.startsWith('@')) {
    const slash1 = input.indexOf('/')
    if (slash1 < 0) {
      pkg = input
      rest = ''
    } else {
      const slash2 = input.indexOf('/', slash1 + 1)
      if (slash2 < 0) {
        pkg = input
        rest = ''
      } else {
        pkg = input.slice(0, slash2)
        rest = input.slice(slash2 + 1)
      }
    }
  } else {
    const slash = input.indexOf('/')
    if (slash < 0) {
      pkg = input
      rest = ''
    } else {
      pkg = input.slice(0, slash)
      rest = input.slice(slash + 1)
    }
  }
  let version: string | undefined
  const at = pkg.lastIndexOf('@')
  if (at > 0) {
    version = pkg.slice(at + 1)
    pkg = pkg.slice(0, at)
  }
  return { pkg, version, rest }
}

/**
 * Build the SW URL for a (pkg, version, rest) triple. Used by the rewriter
 * to emit the new specifier inside transformed module source.
 */
export function buildSwUrl(pkg: string, version: string | undefined, rest = ''): string {
  const v = version ? `@${version}` : ''
  const tail = rest ? `/${rest}` : ''
  return `${MODULE_PREFIX}${encodeURI(pkg)}${v}${tail}`
}

/**
 * Build a CDN URL for the given package + version + path. Tries jsdelivr first,
 * unpkg as fallback (caller fetches in order and uses the first non-5xx).
 */
export function buildCdnUrls(pkg: string, version: string, rest = ''): string[] {
  const tail = rest ? `/${rest}` : ''
  return CDN_ENDPOINTS.map(base => `${base}/${pkg}@${version}${tail}`)
}
