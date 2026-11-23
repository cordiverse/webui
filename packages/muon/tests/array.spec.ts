import { describe, expect, it } from 'vitest'
import { observe } from '../src/index.ts'

describe('array', () => {
  it('detects push as append', () => {
    const data: { arr: number[] } = { arr: [1, 2] }
    const m = observe(data, (d) => {
      d.arr.push(3, 4)
    })
    expect(m).to.deep.equal({
      path: ['arr'],
      kind: { type: 'append', value: [3, 4] },
    })
    expect(data.arr).to.deep.equal([1, 2, 3, 4])
  })

  it('detects pop as truncate', () => {
    const data: { arr: number[] } = { arr: [1, 2, 3] }
    const m = observe(data, (d) => {
      d.arr.pop()
    })
    expect(m).to.deep.equal({
      path: ['arr'],
      kind: { type: 'truncate', count: 1 },
    })
    expect(data.arr).to.deep.equal([1, 2])
  })

  it('treats length= as truncate', () => {
    const data: { arr: number[] } = { arr: [1, 2, 3, 4] }
    const m = observe(data, (d) => {
      d.arr.length = 2
    })
    expect(m).to.deep.equal({
      path: ['arr'],
      kind: { type: 'truncate', count: 2 },
    })
    expect(data.arr).to.deep.equal([1, 2])
  })

  it('treats indexed in-bounds write as replace', () => {
    const data: { arr: number[] } = { arr: [1, 2, 3] }
    const m = observe(data, (d) => {
      d.arr[1] = 99
    })
    expect(m).to.deep.equal({
      path: ['arr', 1],
      kind: { type: 'replace', value: 99 },
    })
  })

  it('treats indexed past-end with gap as invalidating', () => {
    const data: { arr: number[] } = { arr: [1] }
    const m = observe(data, (d) => {
      d.arr[5] = 9
    })
    expect(m?.path).to.deep.equal(['arr'])
    expect(m?.kind.type).to.equal('replace')
  })

  it('falls back to replace on splice', () => {
    const data: { arr: number[] } = { arr: [1, 2, 3] }
    const m = observe(data, (d) => {
      d.arr.splice(1, 1)
    })
    expect(m?.path).to.deep.equal(['arr'])
    expect(m?.kind.type).to.equal('replace')
    expect(data.arr).to.deep.equal([1, 3])
  })

  it('falls back to replace on shift', () => {
    const data: { arr: number[] } = { arr: [1, 2, 3] }
    const m = observe(data, (d) => {
      d.arr.shift()
    })
    expect(m?.path).to.deep.equal(['arr'])
    expect(m?.kind.type).to.equal('replace')
  })

  it('combines pop then push as truncate + append', () => {
    const data: { arr: number[] } = { arr: [1, 2, 3] }
    const m = observe(data, (d) => {
      d.arr.pop()
      d.arr.push(99)
    })
    expect(m).to.deep.equal({
      path: ['arr'],
      kind: {
        type: 'batch',
        items: [
          { path: [], kind: { type: 'truncate', count: 1 } },
          { path: [], kind: { type: 'append', value: [99] } },
        ],
      },
    })
    expect(data.arr).to.deep.equal([1, 2, 99])
  })

  it('push then pop nets to nothing', () => {
    const data: { arr: number[] } = { arr: [1, 2, 3] }
    const m = observe(data, (d) => {
      d.arr.push(99)
      d.arr.pop()
    })
    expect(m).to.equal(null)
    expect(data.arr).to.deep.equal([1, 2, 3])
  })

  it('multiple pops collapse to truncate', () => {
    const data: { arr: number[] } = { arr: [1, 2, 3, 4] }
    const m = observe(data, (d) => {
      d.arr.pop()
      d.arr.pop()
    })
    expect(m).to.deep.equal({
      path: ['arr'],
      kind: { type: 'truncate', count: 2 },
    })
  })

  it('captures nested mutation on existing element', () => {
    const data: { arr: { x: number }[] } = { arr: [{ x: 1 }] }
    const m = observe(data, (d) => {
      d.arr[0].x = 9
    })
    expect(m).to.deep.equal({
      path: ['arr', 0, 'x'],
      kind: { type: 'replace', value: 9 },
    })
  })

  it('appends are subsumed by trailing append slice', () => {
    const data: { arr: { x: number }[] } = { arr: [] }
    const m = observe(data, (d) => {
      d.arr.push({ x: 1 })
      d.arr[0].x = 2
    })
    expect(m).to.deep.equal({
      path: ['arr'],
      kind: { type: 'append', value: [{ x: 2 }] },
    })
  })
})
