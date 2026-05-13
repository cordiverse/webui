/**
 * Stub for `node:module`. The cordis loader imports `createRequire` for its
 * internal-module-loader path, which is dead code in browser
 * (`process.execArgv.includes('--expose-internals')` is always false). The
 * import is unavoidable at top level, so we provide a stub that throws on
 * use to satisfy bundler symbol resolution.
 */

export function createRequire(): never {
  throw new Error('node:module createRequire is not available in cordis-online')
}

export type LoadHookContext = any

export default { createRequire }
