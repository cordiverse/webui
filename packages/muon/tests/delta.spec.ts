import { describe, expect, it } from 'vitest'
import { DeltaState, observe } from '../src/index.ts'
import type { Delta, Mutation } from '../src/index.ts'

describe('delta', () => {
  it('dumps a single replace at root', () => {
    const state = new DeltaState()
    const delta = state.dump({ path: [], kind: { type: 'replace', value: 42 } })
    // default state has p='' and o='SET', so both are omitted
    expect(delta).to.deep.equal({ v: 42 })
  })

  it('omits unchanged path and op on consecutive dumps', () => {
    const state = new DeltaState()
    const a = state.dump({ path: ['foo'], kind: { type: 'replace', value: 1 } })
    const b = state.dump({ path: ['foo'], kind: { type: 'replace', value: 2 } })
    // SET is the default op, so it's omitted on the first dump
    expect(a).to.deep.equal({ p: ['foo'], v: 1 })
    expect(b).to.deep.equal({ v: 2 })
  })

  it('emits new path when only path changes', () => {
    const state = new DeltaState()
    state.dump({ path: ['foo'], kind: { type: 'replace', value: 1 } })
    const b = state.dump({ path: ['bar'], kind: { type: 'replace', value: 2 } })
    expect(b).to.deep.equal({ p: ['bar'], v: 2 })
  })

  it('emits new op when only op changes', () => {
    const state = new DeltaState()
    state.dump({ path: ['s'], kind: { type: 'replace', value: 'a' } })
    const b = state.dump({ path: ['s'], kind: { type: 'append', value: 'b' } })
    expect(b).to.deep.equal({ o: 'APPEND', v: 'b' })
  })

  it('keeps numeric path segments as numbers', () => {
    const state = new DeltaState()
    const d = state.dump({
      path: ['arr', 2, 'x'],
      kind: { type: 'replace', value: 9 },
    })
    expect(d.p).to.deep.equal(['arr', 2, 'x'])
  })

  it('keeps path segments containing slashes intact', () => {
    const send = new DeltaState()
    const recv = new DeltaState()
    const m: Mutation = {
      path: ['routes', 'GET {/*path}'],
      kind: { type: 'replace', value: { id: 'GET {/*path}' } },
    }
    const d = send.dump(m)
    expect(d.p).to.deep.equal(['routes', 'GET {/*path}'])
    expect(recv.load(d)).to.deep.equal(m)
  })

  it('roundtrips replace/append/truncate/delete', () => {
    const send = new DeltaState()
    const recv = new DeltaState()
    const muts: Mutation[] = [
      { path: ['s'], kind: { type: 'replace', value: 'hi' } },
      { path: ['s'], kind: { type: 'append', value: '!' } },
      { path: ['arr'], kind: { type: 'truncate', count: 2 } },
      { path: ['k'], kind: { type: 'delete' } },
    ]
    for (const m of muts) {
      const d = send.dump(m)
      expect(recv.load(d)).to.deep.equal(m)
    }
  })

  it('roundtrips a batch and resets inner state per dump', () => {
    const send = new DeltaState()
    const recv = new DeltaState()
    const m: Mutation = {
      path: ['root'],
      kind: {
        type: 'batch',
        items: [
          { path: ['a'], kind: { type: 'replace', value: 1 } },
          { path: ['a'], kind: { type: 'replace', value: 2 } },
          { path: ['b'], kind: { type: 'append', value: 'x' } },
        ],
      },
    }
    const d = send.dump(m)
    expect(d.o).to.equal('BATCH')
    expect(recv.load(d)).to.deep.equal(m)
  })

  it('delete delta carries no v field', () => {
    const send = new DeltaState()
    const d = send.dump({ path: ['k'], kind: { type: 'delete' } })
    expect(d).to.deep.equal({ p: ['k'], o: 'DELETE' })
    expect('v' in d).to.equal(false)
  })

  it('integrates with observe over multiple frames', () => {
    const data = { messages: [] as string[], n: 0 }
    const send = new DeltaState()
    const recv = new DeltaState()

    const m1 = observe(data, (d) => {
      d.messages.push('hello')
      d.n = 1
    })!
    const d1 = send.dump(m1)
    expect(recv.load(d1)).to.deep.equal(m1)

    const m2 = observe(data, (d) => {
      d.messages.push('world')
    })!
    const d2 = send.dump(m2)
    // path 'messages' is new (previous was a batch at root) so include p
    expect(d2.o).to.equal('APPEND')
    expect(recv.load(d2)).to.deep.equal(m2)
  })

  it('decodes empty path correctly', () => {
    const recv = new DeltaState()
    const m = recv.load({ p: [], o: 'SET', v: { a: 1 } } satisfies Delta)
    expect(m).to.deep.equal({ path: [], kind: { type: 'replace', value: { a: 1 } } })
  })

  it('snapshot/restore lets a late receiver stay in sync', () => {
    const send = new DeltaState()
    // warm up sender cursor
    send.dump({ path: ['foo'], kind: { type: 'append', value: 'a' } })
    send.dump({ path: ['foo'], kind: { type: 'append', value: 'b' } })

    // new client joins: server ships snapshot + current value
    const recv = new DeltaState()
    recv.restore(send.snapshot())

    const d = send.dump({ path: ['foo'], kind: { type: 'append', value: 'c' } })
    expect(recv.load(d)).to.deep.equal({
      path: ['foo'],
      kind: { type: 'append', value: 'c' },
    })
  })

  it('snapshot returns default state for a fresh DeltaState', () => {
    const s = new DeltaState()
    expect(s.snapshot()).to.deep.equal({ p: [], o: 'SET' })
  })

  it('restore is idempotent and survives mixed ops', () => {
    const send = new DeltaState()
    send.dump({ path: ['a'], kind: { type: 'replace', value: 1 } })
    send.dump({ path: ['b'], kind: { type: 'append', value: [1] } })
    send.dump({ path: ['c'], kind: { type: 'truncate', count: 2 } })

    const recv = new DeltaState()
    recv.restore(send.snapshot())
    const d = send.dump({ path: ['c'], kind: { type: 'truncate', count: 1 } })
    expect(recv.load(d)).to.deep.equal({
      path: ['c'],
      kind: { type: 'truncate', count: 1 },
    })
  })
})
