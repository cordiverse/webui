import { describe, expect, it } from 'vitest'
import { observe } from '../src/index.ts'

describe('delete', () => {
  it('records delete on object key', () => {
    const data: { a?: number; b: number } = { a: 1, b: 2 }
    const m = observe(data, (d) => {
      delete d.a
    })
    expect(m).to.deep.equal({ path: ['a'], kind: { type: 'delete' } })
  })

  it('treats array index delete as invalidating', () => {
    const data: { arr: (number | undefined)[] } = { arr: [1, 2, 3] }
    const m = observe(data, (d) => {
      delete d.arr[1]
    })
    expect(m?.path).to.deep.equal(['arr'])
    expect(m?.kind.type).to.equal('replace')
  })

  it('drops nested tracker when key is set', () => {
    const data = { foo: { bar: 1 } as any }
    const m = observe(data, (d) => {
      d.foo.bar = 5     // create child tracker
      d.foo = { other: 1 }   // replace it
    })
    expect(m).to.deep.equal({
      path: ['foo'],
      kind: { type: 'replace', value: { other: 1 } },
    })
  })
})
