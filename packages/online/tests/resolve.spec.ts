import { describe, it, expect } from 'vitest'
import { resolveEntry, pickDependencyVersion } from '../src/resolve.ts'
import { parseSpecifier } from '../src/cdn.ts'

describe('parseSpecifier', () => {
  it('parses an unscoped package without version', () => {
    expect(parseSpecifier('cosmokit')).toEqual({ pkg: 'cosmokit', version: undefined, rest: '' })
  })
  it('parses an unscoped package with version', () => {
    expect(parseSpecifier('cosmokit@1.2.3')).toEqual({ pkg: 'cosmokit', version: '1.2.3', rest: '' })
  })
  it('parses an unscoped package with sub-path', () => {
    expect(parseSpecifier('cosmokit/utils')).toEqual({ pkg: 'cosmokit', version: undefined, rest: 'utils' })
  })
  it('parses a scoped package', () => {
    expect(parseSpecifier('@cordisjs/client')).toEqual({ pkg: '@cordisjs/client', version: undefined, rest: '' })
  })
  it('parses a scoped package with version and sub-path', () => {
    expect(parseSpecifier('@cordisjs/client@0.8.0/lib')).toEqual({ pkg: '@cordisjs/client', version: '0.8.0', rest: 'lib' })
  })
})

describe('resolveEntry', () => {
  it('falls back to index.js when nothing is declared', () => {
    expect(resolveEntry({ name: 'x' })).toBe('index.js')
  })

  it('uses main when only main is set', () => {
    expect(resolveEntry({ main: './lib/index.js' })).toBe('lib/index.js')
  })

  it('prefers module over main', () => {
    expect(resolveEntry({ main: 'lib/index.cjs', module: 'lib/index.mjs' })).toBe('lib/index.mjs')
  })

  it('walks exports["."] conditional order', () => {
    expect(resolveEntry({
      exports: {
        '.': { browser: './browser.js', import: './import.js', default: './default.js' },
      },
    })).toBe('browser.js')
  })

  it('falls through condition order to import', () => {
    expect(resolveEntry({
      exports: {
        '.': { import: './esm.js', require: './cjs.js' },
      },
    })).toBe('esm.js')
  })

  it('handles a root-conditional exports object (no subpath keys)', () => {
    expect(resolveEntry({
      exports: { browser: './b.js', import: './i.js' },
    })).toBe('b.js')
  })

  it('resolves a sub-path via exports map', () => {
    expect(resolveEntry({
      exports: {
        '.': './main.js',
        './sub': './sub.js',
      },
    }, 'sub')).toBe('sub.js')
  })

  it('matches subpath patterns with a single *', () => {
    expect(resolveEntry({
      exports: {
        './lib/*': './dist/lib/*.js',
      },
    }, 'lib/util')).toBe('dist/lib/util.js')
  })

  it('handles a string-form exports field', () => {
    expect(resolveEntry({ exports: './out.js' })).toBe('out.js')
  })
})

describe('pickDependencyVersion', () => {
  it('reads from dependencies first', () => {
    expect(pickDependencyVersion({ dependencies: { foo: '^1.0.0' } }, 'foo')).toBe('^1.0.0')
  })
  it('falls back to peerDependencies', () => {
    expect(pickDependencyVersion({ peerDependencies: { foo: '^2.0.0' } }, 'foo')).toBe('^2.0.0')
  })
  it('returns undefined if not declared', () => {
    expect(pickDependencyVersion({}, 'foo')).toBeUndefined()
  })
})
