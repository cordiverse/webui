import { describe, expect, it } from 'vitest'
import { apply, BatchTree, MutationError, observe } from '../src/index.ts'
import type { Mutation } from '../src/index.ts'

describe('batch', () => {
  it('wraps multiple sibling mutations', () => {
    const data = { a: 1, b: 2, c: 3 }
    const m = observe(data, (d) => {
      d.a = 10
      d.b = 20
    })
    expect(m).to.deep.equal({
      path: [],
      kind: {
        type: 'batch',
        items: [
          { path: ['a'], kind: { type: 'replace', value: 10 } },
          { path: ['b'], kind: { type: 'replace', value: 20 } },
        ],
      },
    })
  })

  it('combines nested mutations across paths', () => {
    const data = { foo: { x: 1 }, bar: [1, 2] }
    const m = observe(data, (d) => {
      d.foo.x = 9
      d.bar.push(3)
    })
    expect(m?.kind.type).to.equal('batch')
    if (m?.kind.type !== 'batch') return
    expect(m.kind.items).to.have.lengthOf(2)
    expect(m.kind.items).to.deep.include({
      path: ['foo', 'x'],
      kind: { type: 'replace', value: 9 },
    })
    expect(m.kind.items).to.deep.include({
      path: ['bar'],
      kind: { type: 'append', value: [3] },
    })
  })

  it('collapses when every key of the parent is replaced', () => {
    const data = { a: 1, b: 2 }
    const m = observe(data, (d) => {
      d.a = 10
      d.b = 20
    })
    // both keys replaced -> single Replace of the whole object
    // (collapse implemented in flush)
    expect(m).to.deep.equal({
      path: [],
      kind: { type: 'replace', value: { a: 10, b: 20 } },
    })
  })

  it('does not collapse when only some keys are replaced', () => {
    const data = { a: 1, b: 2, c: 3 }
    const m = observe(data, (d) => {
      d.a = 10
      d.b = 20
    })
    expect(m?.kind.type).to.equal('batch')
  })
})

const replace = (path: (string | number)[], value: any): Mutation => ({
  path, kind: { type: 'replace', value },
})
const append = (path: (string | number)[], value: any): Mutation => ({
  path, kind: { type: 'append', value },
})
const truncate = (path: (string | number)[], count: number): Mutation => ({
  path, kind: { type: 'truncate', count },
})
const del = (path: (string | number)[]): Mutation => ({
  path, kind: { type: 'delete' },
})
const batch = (path: (string | number)[], items: Mutation[]): Mutation => ({
  path, kind: { type: 'batch', items },
})

describe('BatchTree', () => {
  it('empty dump returns null', () => {
    const b = new BatchTree()
    expect(b.dump()).to.equal(null)
  })

  it('single replace', () => {
    const b = new BatchTree()
    b.load(replace(['foo', 'bar'], 1))
    expect(b.dump()).to.deep.equal(replace(['foo', 'bar'], 1))
  })

  it('replace after replace keeps latest', () => {
    const b = new BatchTree()
    b.load(replace(['foo', 'bar'], 1))
    b.load(replace(['foo', 'bar'], 2))
    expect(b.dump()).to.deep.equal(replace(['foo', 'bar'], 2))
  })

  it('clones the loaded value so later source mutation does not leak', () => {
    const b = new BatchTree()
    const source = { a: 1 }
    b.load(replace(['k'], source))
    source.a = 999
    expect(b.dump()).to.deep.equal(replace(['k'], { a: 1 }))
  })

  it('append after replace folds into the replaced value', () => {
    const b = new BatchTree()
    b.load(replace(['foo', 'bar'], { qux: '1' }))
    b.load(append(['foo', 'bar', 'qux'], '2'))
    expect(b.dump()).to.deep.equal(replace(['foo', 'bar'], { qux: '12' }))
  })

  it('replace after append wins', () => {
    const b = new BatchTree()
    b.load(append(['foo', 'bar', 'qux'], '2'))
    b.load(replace(['foo', 'bar'], { qux: '1' }))
    expect(b.dump()).to.deep.equal(replace(['foo', 'bar'], { qux: '1' }))
  })

  it('merges two append strings on same path', () => {
    const b = new BatchTree()
    b.load(batch(['foo'], [append(['bar'], '1'), append(['bar'], '2')]))
    expect(b.dump()).to.deep.equal(append(['foo', 'bar'], '12'))
  })

  it('basic batch of siblings', () => {
    const b = new BatchTree()
    b.load(append(['bar'], '2'))
    b.load(append(['qux'], '1'))
    expect(b.dump()).to.deep.equal(batch([], [
      append(['bar'], '2'),
      append(['qux'], '1'),
    ]))
  })

  it('nested batch with shared parent', () => {
    const b = new BatchTree()
    b.load(append(['foo', 'bar'], '2'))
    b.load(append(['foo', 'qux'], '1'))
    expect(b.dump()).to.deep.equal(batch(['foo'], [
      append(['bar'], '2'),
      append(['qux'], '1'),
    ]))
  })

  it('merges two truncates on same path', () => {
    const b = new BatchTree()
    b.load(batch(['foo'], [truncate(['bar'], 1), truncate(['bar'], 2)]))
    expect(b.dump()).to.deep.equal(truncate(['foo', 'bar'], 3))
  })

  it('truncate after append trims the appended tail (string)', () => {
    const b = new BatchTree()
    b.load(append(['foo', 'bar', 'qux'], '42'))
    b.load(truncate(['foo', 'bar', 'qux'], 1))
    expect(b.dump()).to.deep.equal(append(['foo', 'bar', 'qux'], '4'))
  })

  it('truncate equal to append cancels out', () => {
    const b = new BatchTree()
    b.load(append(['foo', 'bar', 'qux'], '42'))
    b.load(truncate(['foo', 'bar', 'qux'], 2))
    expect(b.dump()).to.equal(null)
  })

  it('truncate exceeding append becomes residual truncate', () => {
    const b = new BatchTree()
    b.load(append(['foo', 'bar', 'qux'], '42'))
    b.load(truncate(['foo', 'bar', 'qux'], 3))
    expect(b.dump()).to.deep.equal(truncate(['foo', 'bar', 'qux'], 1))
  })

  it('append after truncate produces [truncate, append] sibling pair', () => {
    const b = new BatchTree()
    b.load(truncate(['foo', 'bar', 'qux'], 3))
    b.load(append(['foo', 'bar', 'qux'], 'Hello, World!'))
    b.load(truncate(['foo', 'bar', 'qux'], 1))
    expect(b.dump()).to.deep.equal(batch(['foo', 'bar', 'qux'], [
      truncate([], 3),
      append([], 'Hello, World'),
    ]))
  })

  it('delete after delete dedupes', () => {
    const b = new BatchTree()
    b.load(del(['foo']))
    b.load(del(['foo']))
    expect(b.dump()).to.deep.equal(del(['foo']))
  })

  it('delete after truncate overrides', () => {
    const b = new BatchTree()
    b.load(truncate(['foo', 'bar', 'qux'], 3))
    b.load(del(['foo', 'bar']))
    expect(b.dump()).to.deep.equal(del(['foo', 'bar']))
  })

  it('replace after delete overrides', () => {
    const b = new BatchTree()
    b.load(del(['foo']))
    b.load(replace(['foo'], {}))
    expect(b.dump()).to.deep.equal(replace(['foo'], {}))
  })

  it('append after delete is an error', () => {
    const b = new BatchTree()
    b.load(del(['foo']))
    expect(() => b.load(append(['foo'], 'test'))).to.throw(MutationError)
  })

  it('mixed string/number children on same parent is an index error', () => {
    const b = new BatchTree()
    b.load(replace(['foo', 'bar'], 1))
    expect(() => b.load(replace(['foo', 0], 2))).to.throw(MutationError)
  })

  it('dump empties the tree (subsequent dumps return null)', () => {
    const b = new BatchTree()
    b.load(replace(['k'], 1))
    expect(b.dump()).to.deep.equal(replace(['k'], 1))
    expect(b.dump()).to.equal(null)
  })

  it('end-to-end: apply(source, batch.dump()) yields the same result as applying each mutation', () => {
    const source1: any = { foo: { bar: 'ab', list: [1, 2] } }
    const source2: any = { foo: { bar: 'ab', list: [1, 2] } }
    const b = new BatchTree()
    const muts: Mutation[] = [
      append(['foo', 'bar'], 'c'),
      append(['foo', 'bar'], 'd'),
      append(['foo', 'list'], [3]),
      truncate(['foo', 'list'], 1),
    ]
    for (const m of muts) {
      apply(source1, m)
      b.load(m)
    }
    const merged = b.dump()!
    apply(source2, merged)
    expect(source1).to.deep.equal(source2)
  })
})
