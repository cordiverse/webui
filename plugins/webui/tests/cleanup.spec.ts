// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { createHarness } from './harness/index.ts'

describe('harness cleanup', () => {
  it('removes the container DOM and closes both ends of the bridge', async () => {
    const harness = await createHarness()
    expect(document.body.contains(harness.container)).toBe(true)
    await harness.cleanup()
    expect(document.body.contains(harness.container)).toBe(false)
    expect(harness.bridge.client.readyState).toBe(3) // CLOSED
    expect(harness.bridge.server.readyState).toBe(3)
  })

  it('does not leave pending timers behind', async () => {
    const harness = await createHarness()
    const before = process.hrtime.bigint()
    await harness.cleanup()
    const elapsedMs = Number(process.hrtime.bigint() - before) / 1e6
    expect(elapsedMs).toBeLessThan(100)
  })
})
