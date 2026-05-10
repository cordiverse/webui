// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createHarness, Harness } from './harness/index.ts'

async function flush(times = 5) {
  for (let i = 0; i < times; i++) await Promise.resolve()
}

describe('entry data sync via muon delta', () => {
  let harness: Harness

  beforeEach(async () => { harness = await createHarness() })
  afterEach(async () => { await harness.cleanup() })

  it('initial data is observable on the client', async () => {
    const entry = harness.ctx.webui.addEntry({ baseUrl: '', manifest: '' } as any, { count: 7 })
    await flush()
    const $entry = harness.ctx.client.loader.entries[entry.id]
    expect($entry.data.value.count).toBe(7)
  })

  it('mutate() pushes a delta that updates the client value', async () => {
    const entry = harness.ctx.webui.addEntry({ baseUrl: '', manifest: '' } as any, { x: 1 })
    await flush()
    const $entry = harness.ctx.client.loader.entries[entry.id]
    expect($entry.data.value.x).toBe(1)

    entry.mutate(d => { d.x = 99 })
    await flush()
    expect($entry.data.value.x).toBe(99)
  })

  it('preserves injected methods after a root-level value update', async () => {
    const entry = harness.ctx.webui.addEntry({ baseUrl: '', manifest: '' } as any, {
      n: 0,
      async ping() { return 'pong' },
    })
    await flush()
    const $entry = harness.ctx.client.loader.entries[entry.id]
    expect(typeof $entry.data.value.ping).toBe('function')

    entry.mutate(d => { d.n = 5 })
    await flush()
    expect($entry.data.value.n).toBe(5)
    // Methods are non-enumerable; defineProperty should still leave them callable.
    expect(typeof $entry.data.value.ping).toBe('function')
    await expect($entry.data.value.ping()).resolves.toBe('pong')
  })
})
