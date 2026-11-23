// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createHarness, Harness } from './harness/index.ts'

describe('cross-spec isolation (closure-ified createClient)', () => {
  let harness: Harness

  beforeEach(async () => { harness = await createHarness() })
  afterEach(async () => { await harness.cleanup() })

  it('two independent harness instances do not share Action state', async () => {
    const other = await createHarness()
    try {
      harness.ctx.client.action.action('demo.shared', () => {})
      expect((harness.ctx.client.action as any).actions['demo.shared']).toBeTruthy()
      expect((other.ctx.client.action as any).actions['demo.shared']).toBeFalsy()
    } finally {
      await other.cleanup()
    }
  })

  it('socket refs are distinct instances', async () => {
    const other = await createHarness()
    try {
      const a = harness.ctx.client.socket.value
      const b = other.ctx.client.socket.value
      expect(a).toBeTruthy()
      expect(b).toBeTruthy()
      expect(a).not.toBe(b)
    } finally {
      await other.cleanup()
    }
  })
})
