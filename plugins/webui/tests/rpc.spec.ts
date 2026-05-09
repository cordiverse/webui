// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createHarness, Harness } from './harness/index.ts'

async function flush(times = 5) {
  for (let i = 0; i < times; i++) await Promise.resolve()
}

describe('entry-method RPC end-to-end', () => {
  let harness: Harness

  beforeEach(async () => {
    harness = await createHarness()
  })

  afterEach(async () => {
    await harness.cleanup()
  })

  async function addEntryAndWait<T extends object>(data: T) {
    const entry = harness.ctx.webui.addEntry({ base: '', prod: '' } as any, data)
    await flush()
    const $entry = harness.ctx.client.loader.entries[entry.id]
    if (!$entry) throw new Error(`entry ${entry.id} not synced to client after flush`)
    return { serverEntry: entry, clientData: $entry.data }
  }

  it('round-trips a simple async method call', async () => {
    const { clientData } = await addEntryAndWait({
      async double(n: number) { return n * 2 },
    })
    const result = await clientData.value.double(21)
    expect(result).toBe(42)
  })

  it('rejects with the server-thrown error message', async () => {
    const { clientData } = await addEntryAndWait({
      async boom() { throw new Error('kaboom') },
    })
    await expect(clientData.value.boom()).rejects.toThrow('kaboom')
  })

  it('rejects unknown method with descriptive error from server', async () => {
    const { serverEntry } = await addEntryAndWait({
      async known() { return 'ok' },
    })
    await expect(
      harness.ctx.client.rpc.call(serverEntry.id, 'absent', []),
    ).rejects.toThrow(/no such method/)
  })

  it('routes concurrent calls by sn without crosstalk', async () => {
    const { clientData } = await addEntryAndWait({
      async slow(n: number, ms: number) {
        await new Promise(r => setTimeout(r, ms))
        return n
      },
    })
    const [a, b, c] = await Promise.all([
      clientData.value.slow(1, 30),
      clientData.value.slow(2, 10),
      clientData.value.slow(3, 20),
    ])
    expect([a, b, c]).toEqual([1, 2, 3])
  })

  it('rejects in-flight pending calls when socket disconnects', async () => {
    const { clientData } = await addEntryAndWait({
      async hang() { return new Promise(() => {}) },
    })
    const pending = clientData.value.hang()
    // Simulate disconnect by clearing socket.value (what data.ts's reconnect
    // path does on close); RpcService watches this ref and drains pending.
    harness.ctx.client.socket.value = undefined as any
    await expect(pending).rejects.toThrow(/socket disconnected/)
  })
})
