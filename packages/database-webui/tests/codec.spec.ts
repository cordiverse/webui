import { describe, it, expect, beforeAll } from 'vitest'
import { Context } from 'cordis'
import Database, { Type } from '@cordisjs/plugin-database'
import { isNullable } from 'cosmokit'
import { Codec } from '../src/codec.ts'

let db: Database
let codec: Codec

function field(name: string): Type {
  return db.tables['webui_codec' as never].fields[name]!.type
}

function transfer(value: any, type: Type) {
  return codec.decode(JSON.parse(JSON.stringify(codec.encode(value, type))), type)
}

beforeAll(async () => {
  const ctx = new Context()
  await ctx.plugin(Database)
  db = ctx.model
  db.define('bigint2' as never, {
    type: 'string',
    dump: (value: any) => isNullable(value) ? value : value.toString(),
    load: (value: any) => isNullable(value) ? value : BigInt(value),
  } as any)
  db.define('state' as never, {
    type: 'string',
    // handles only null explicitly, so a missing field must not reach it
    dump: (value: any) => value === 'unset' ? null : value.toString(),
    load: (value: any) => value === null ? 'unset' : value,
  } as any)
  db.define('point' as never, {
    type: 'object',
    inner: { x: 'bigint', y: 'bigint2' },
  } as any)
  db.extend('webui_codec' as never, {
    id: 'unsigned',
    int64: 'bigint',
    big: 'bigint2',
    timestamp: 'timestamp',
    point: 'point',
    embed: { type: 'object', inner: { big: 'bigint2', list: { type: 'array', inner: 'bigint' } } },
    pk: 'primary',
    state: 'state',
    items: 'array',
    tags: 'list',
    binary: 'binary',
  } as any)
  codec = new Codec(db.types)
})

describe('database-webui codec', () => {
  it('restores bigint values', () => {
    expect(transfer(2n ** 64n, field('int64'))).toBe(2n ** 64n)
  })

  it('restores values of registered types', () => {
    expect(transfer(7n, field('big'))).toBe(7n)
    expect(transfer({ x: 1n, y: 2n }, field('point'))).toEqual({ x: 1n, y: 2n })
  })

  it('passes null through registered types', () => {
    expect(codec.encode('unset', field('state'))).toBe(null)
    expect(codec.decode(null, field('state'))).toBe('unset')
  })

  it('keeps fields omitted from a row', () => {
    expect(codec.encode(undefined, field('state'))).toBe(undefined)
  })

  it('restores date values', () => {
    const date = new Date('2024-01-02T03:04:05.678Z')
    expect(transfer(date, field('timestamp'))).toEqual(date)
  })

  it('restores values nested in typed object fields', () => {
    const value = { big: 1n, list: [2n, 3n] }
    expect(transfer(value, field('embed'))).toEqual(value)
  })

  it('transfers object primary keys in their string form', () => {
    class ObjectId {
      constructor(private hex: string) {}
      toString() { return this.hex }
    }
    expect(transfer(new ObjectId('65a1b2c3d4e5f60718293a4b'), field('pk'))).toBe('65a1b2c3d4e5f60718293a4b')
  })

  it('rejects bigint input that is not an exact integer', () => {
    expect(() => codec.decode('1.5', field('int64'))).toThrow()
    expect(() => codec.decode(9007199254740993, field('int64'))).toThrow()
    expect(codec.decode(42, field('int64'))).toBe(42n)
  })

  it('validates the underlying type of registered types', () => {
    expect(() => codec.decode({ x: '1', y: 9007199254740993 }, field('point'), 'point')).toThrow(/^point\.y: /)
  })

  it('rejects invalid base64 and accepts empty binary values', () => {
    expect(() => codec.decode('!!!', field('binary'))).toThrow()
    expect(new Uint8Array(codec.decode('', field('binary')))).toHaveLength(0)
    expect([...new Uint8Array(transfer(new Uint8Array([1, 2, 3]), field('binary')))]).toEqual([1, 2, 3])
  })

  it('rejects malformed dates', () => {
    expect(() => codec.decode('not a date', field('timestamp'))).toThrow()
  })

  it('rejects containers of the wrong shape with their path', () => {
    expect(() => codec.decode([1], field('embed'), 'embed')).toThrow(/^embed: /)
    expect(() => codec.decode({ list: {} }, field('embed'), 'embed')).toThrow(/^embed\.list: /)
    expect(() => codec.decode({}, field('items'), 'items')).toThrow(/^items: /)
    expect(() => codec.decode({ label: 'new' }, field('tags'), 'tags')).toThrow(/^tags: /)
  })
})
