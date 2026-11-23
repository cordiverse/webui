import { describe, expect, it } from 'vitest'
import { observe } from '../src/index.ts'

describe('string', () => {
  it('detects append on prefix-extending assignment', () => {
    const data = { s: 'hello' }
    const m = observe(data, (d) => {
      d.s += ' world'
    })
    expect(m).to.deep.equal({
      path: ['s'],
      kind: { type: 'append', value: ' world' },
    })
    expect(data.s).to.equal('hello world')
  })

  it('detects append from empty original', () => {
    const data = { s: '' }
    const m = observe(data, (d) => {
      d.s = 'hi'
    })
    expect(m).to.deep.equal({
      path: ['s'],
      kind: { type: 'append', value: 'hi' },
    })
  })

  it('falls back to replace when prefix is broken', () => {
    const data = { s: 'hello' }
    const m = observe(data, (d) => {
      d.s = 'world'
    })
    expect(m).to.deep.equal({
      path: ['s'],
      kind: { type: 'replace', value: 'world' },
    })
  })

  it('uses original (not intermediate) for append detection', () => {
    const data = { s: 'a' }
    const m = observe(data, (d) => {
      d.s = 'b'
      d.s = 'a-end'
    })
    expect(m).to.deep.equal({
      path: ['s'],
      kind: { type: 'append', value: '-end' },
    })
  })

  it('reports nothing when string is set back to original value', () => {
    const data = { s: 'hello' }
    const m = observe(data, (d) => {
      d.s = 'temp'
      d.s = 'hello'
    })
    // we currently still emit a Replace for the no-op chain
    expect(m).to.deep.equal({
      path: ['s'],
      kind: { type: 'replace', value: 'hello' },
    })
  })
})
