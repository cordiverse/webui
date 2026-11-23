import { describe, expect, it } from 'vitest'
import { observe } from '../src/index.ts'

describe('basic', () => {
  it('throws when root is not a tracked container', () => {
    expect(() => observe(42 as unknown as object, () => {})).to.throw(TypeError)
  })

  it('mutates the original data in place', () => {
    const data = { x: 1, y: { z: [1, 2] } }
    observe(data, (d) => {
      d.x = 100
      d.y.z.push(3)
    })
    expect(data).to.deep.equal({ x: 100, y: { z: [1, 2, 3] } })
  })

  it('two consecutive observe calls report only the latest changes', () => {
    const data: { messages: number[] } = { messages: [] }
    const a = observe(data, (d) => {
      d.messages.push(1)
    })
    const b = observe(data, (d) => {
      d.messages.push(2, 3)
    })
    expect(a).to.deep.equal({ path: ['messages'], kind: { type: 'append', value: [1] } })
    expect(b).to.deep.equal({ path: ['messages'], kind: { type: 'append', value: [2, 3] } })
    expect(data.messages).to.deep.equal([1, 2, 3])
  })
})
