// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createHarness, Harness } from './harness/index.ts'

describe('harness bootstrap', () => {
  let harness: Harness

  beforeEach(async () => {
    harness = await createHarness()
  })

  afterEach(async () => {
    await harness.cleanup()
  })

  it('exposes ctx.client with all six sub-services', () => {
    const c = harness.ctx.client
    expect(c).toBeTruthy()
    expect(c.action).toBeTruthy()
    expect(c.loader).toBeTruthy()
    expect(c.router).toBeTruthy()
    expect(c.setting).toBeTruthy()
    expect(c.theme).toBeTruthy()
    expect(c.rpc).toBeTruthy()
  })

  it('has a connected socket pointing at the bridge', () => {
    const sock = harness.ctx.client.socket.value as any
    expect(sock).toBeTruthy()
    expect(sock).toBe(harness.bridge.client)
  })

  it('mounts the Vue app onto its harness container', () => {
    expect((harness.container as any).__vue_app__).toBeTruthy()
  })

  it('resolves loader.initTask with a version', () => {
    expect(harness.ctx.client.loader.version).toBe('__test__')
  })
})
