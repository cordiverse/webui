import { describe, expect, it } from 'vitest'
import { observe } from '../src/index.ts'

describe('object', () => {
  it('returns null when nothing changes', () => {
    const data = { a: 1, b: { c: 2 } }
    expect(observe(data, () => {})).to.equal(null)
  })

  it('replaces a primitive field', () => {
    const data = { a: 1 }
    const m = observe(data, (d) => {
      d.a = 2
    })
    expect(m).to.deep.equal({ path: ['a'], kind: { type: 'replace', value: 2 } })
    expect(data.a).to.equal(2)
  })

  it('records nested replacement', () => {
    const data = { foo: { bar: 1 } }
    const m = observe(data, (d) => {
      d.foo.bar = 9
    })
    expect(m).to.deep.equal({
      path: ['foo', 'bar'],
      kind: { type: 'replace', value: 9 },
    })
    expect(data.foo.bar).to.equal(9)
  })

  it('records deletion', () => {
    const data: { a?: number; b: number } = { a: 1, b: 2 }
    const m = observe(data, (d) => {
      delete d.a
    })
    expect(m).to.deep.equal({ path: ['a'], kind: { type: 'delete' } })
    expect('a' in data).to.equal(false)
  })

  it('replaces a whole sub-object', () => {
    const data: { foo: { bar: number; baz?: number } } = { foo: { bar: 1 } }
    const m = observe(data, (d) => {
      d.foo = { bar: 5, baz: 6 }
    })
    expect(m).to.deep.equal({
      path: ['foo'],
      kind: { type: 'replace', value: { bar: 5, baz: 6 } },
    })
  })

  it('captures in-place mutation after assignment', () => {
    const data: { foo: { bar: number; baz?: number } } = { foo: { bar: 1 } }
    const m = observe(data, (d) => {
      d.foo = { bar: 5 }
      d.foo.baz = 6
    })
    expect(m).to.deep.equal({
      path: ['foo'],
      kind: { type: 'replace', value: { bar: 5, baz: 6 } },
    })
    expect(data.foo).to.deep.equal({ bar: 5, baz: 6 })
  })
})
