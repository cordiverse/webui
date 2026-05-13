import { describe, it, expect, beforeAll } from 'vitest'
import { readyTransform, transformImports } from '../src/transform.ts'

beforeAll(() => readyTransform())

describe('transformImports', () => {
  const resolveImport = (name: string) => ({ pkg: name, version: '1.2.3' })

  it('rewrites bare static import to the SW URL', () => {
    const out = transformImports(`import { foo } from 'cosmokit'\n`, { resolveImport })
    expect(out).toBe(`import { foo } from '/-/modules/cosmokit@1.2.3'\n`)
  })

  it('preserves the sub-path after the package name', () => {
    const out = transformImports(`import x from '@cordisjs/components/form'\n`, { resolveImport })
    expect(out).toBe(`import x from '/-/modules/@cordisjs/components@1.2.3/form'\n`)
  })

  it('leaves relative imports untouched', () => {
    const src = `import x from './local.js'\nimport y from '../other.js'\n`
    expect(transformImports(src, { resolveImport })).toBe(src)
  })

  it('leaves absolute / URL imports untouched', () => {
    const src = `import a from '/already-absolute.js'\nimport b from 'https://example.com/mod.js'\n`
    expect(transformImports(src, { resolveImport })).toBe(src)
  })

  it('rewrites dynamic import() with a JSON-quoted target', () => {
    const out = transformImports(`const m = await import('cosmokit')\n`, { resolveImport })
    expect(out).toBe(`const m = await import("/-/modules/cosmokit@1.2.3")\n`)
  })

  it('rewrites re-exports', () => {
    const out = transformImports(`export { default } from 'cordis'\n`, { resolveImport })
    expect(out).toBe(`export { default } from '/-/modules/cordis@1.2.3'\n`)
  })

  it('maps node:fs → @cordisjs/fs', () => {
    const out = transformImports(`import fs from 'node:fs'\n`, { resolveImport })
    expect(out).toContain('/-/modules/@cordisjs/fs')
  })

  it('maps fs/promises → @cordisjs/fs/promises', () => {
    const out = transformImports(`import fs from 'fs/promises'\n`, { resolveImport })
    expect(out).toContain('/-/modules/@cordisjs/fs/promises')
  })

  it('redirects unshimmable node builtins to a stub URL', () => {
    const out = transformImports(`import net from 'net'\n`, { resolveImport })
    expect(out).toContain('/-/modules/-stub/net')
  })

  it('redirects unknown node: prefixed builtins to a stub URL', () => {
    const out = transformImports(`import x from 'node:crypto'\n`, { resolveImport })
    expect(out).toContain('/-/modules/-stub/crypto')
  })

  it('honours singleton overrides over everything else', () => {
    const out = transformImports(`import { ref } from 'vue'\n`, {
      resolveImport,
      singletons: new Map([['vue', '/assets/vue-abcd.js']]),
    })
    expect(out).toBe(`import { ref } from '/assets/vue-abcd.js'\n`)
  })

  it('returns source unchanged when there are no imports', () => {
    const src = `console.log('hello')\n`
    expect(transformImports(src, { resolveImport })).toBe(src)
  })

  it('skips specifiers when resolveImport returns null', () => {
    const src = `import x from 'unknown-pkg'\n`
    expect(transformImports(src, { resolveImport: () => null })).toBe(src)
  })
})
