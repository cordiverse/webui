import { describe, expect, it } from 'vitest'
import { apply, observe } from '../src/index.ts'

describe('apply', () => {
  it('applies replace at root', () => {
    const out = apply({ a: 1 }, { path: [], kind: { type: 'replace', value: { a: 2 } } })
    expect(out).to.deep.equal({ a: 2 })
  })

  it('applies replace at nested path', () => {
    const data = { foo: { bar: 1 } }
    apply(data, { path: ['foo', 'bar'], kind: { type: 'replace', value: 9 } })
    expect(data).to.deep.equal({ foo: { bar: 9 } })
  })

  it('applies append on string', () => {
    const data = { s: 'hi' }
    apply(data, { path: ['s'], kind: { type: 'append', value: '!' } })
    expect(data.s).to.equal('hi!')
  })

  it('applies append on array', () => {
    const data: { arr: number[] } = { arr: [1, 2] }
    apply(data, { path: ['arr'], kind: { type: 'append', value: [3, 4] } })
    expect(data.arr).to.deep.equal([1, 2, 3, 4])
  })

  it('applies truncate on string', () => {
    const data = { s: 'hello world' }
    apply(data, { path: ['s'], kind: { type: 'truncate', count: 6 } })
    expect(data.s).to.equal('hello')
  })

  it('applies truncate on array', () => {
    const data: { arr: number[] } = { arr: [1, 2, 3, 4] }
    apply(data, { path: ['arr'], kind: { type: 'truncate', count: 2 } })
    expect(data.arr).to.deep.equal([1, 2])
  })

  it('applies delete on object key', () => {
    const data: { a?: number; b: number } = { a: 1, b: 2 }
    apply(data, { path: ['a'], kind: { type: 'delete' } })
    expect('a' in data).to.equal(false)
    expect(data.b).to.equal(2)
  })

  it('applies indexed array element replace', () => {
    const data: { arr: number[] } = { arr: [1, 2, 3] }
    apply(data, { path: ['arr', 1], kind: { type: 'replace', value: 99 } })
    expect(data.arr).to.deep.equal([1, 99, 3])
  })

  it('applies a batch in order', () => {
    const data: { a: number; b: number; c: string } = { a: 1, b: 2, c: '' }
    apply(data, {
      path: [],
      kind: {
        type: 'batch',
        items: [
          { path: ['a'], kind: { type: 'replace', value: 10 } },
          { path: ['b'], kind: { type: 'replace', value: 20 } },
          { path: ['c'], kind: { type: 'append', value: 'hi' } },
        ],
      },
    })
    expect(data).to.deep.equal({ a: 10, b: 20, c: 'hi' })
  })

  it('applies nested batch with shared parent path', () => {
    const data: { foo: { x: number; y: string } } = { foo: { x: 1, y: 'a' } }
    apply(data, {
      path: ['foo'],
      kind: {
        type: 'batch',
        items: [
          { path: ['x'], kind: { type: 'replace', value: 9 } },
          { path: ['y'], kind: { type: 'append', value: 'b' } },
        ],
      },
    })
    expect(data.foo).to.deep.equal({ x: 9, y: 'ab' })
  })

  it('round-trips with observe', () => {
    const source = { foo: { bar: [1, 2] }, msg: 'hi' }
    const replica = JSON.parse(JSON.stringify(source))
    const m = observe(source, (d) => {
      d.foo.bar.push(3)
      d.msg += '!'
    })!
    apply(replica, m)
    expect(replica).to.deep.equal(source)
  })

  it('throws on bad path', () => {
    expect(() =>
      apply({ a: 1 }, { path: ['b', 'c'], kind: { type: 'replace', value: 0 } }),
    ).to.throw(TypeError)
  })

  it('throws on incompatible append', () => {
    expect(() =>
      apply({ s: 'hi' }, { path: ['s'], kind: { type: 'append', value: [1] } }),
    ).to.throw(TypeError)
  })
})
