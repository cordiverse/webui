// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Context, Service } from 'cordis'
import { createHarness, Harness } from './harness/index.ts'

async function until(predicate: () => boolean) {
  for (let i = 0; i < 50; i++) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  throw new Error('condition not met')
}

class Counter extends Service {
  value = 0

  constructor(ctx: Context) {
    super(ctx, 'counter')
  }

  async add(delta: number) {
    return this.value += delta
  }

  async fail() {
    throw Object.assign(new Error('denied'), { code: 'PermissionDenied' })
  }

  Scale = class {
    constructor(public factor: number) {}

    apply(value: number) {
      return value * this.factor
    }
  }

  async* count(limit: number) {
    for (let i = 0; i < limit; i++) yield i
  }

  async scale(factor: number) {
    return {
      factor,
      apply(value: number) {
        return value * this.factor
      },
    }
  }
}

declare module 'cordis' {
  interface Context {
    counter: Counter
    later: { ping(): string }
  }
}

describe('host services', () => {
  let harness: Harness

  beforeEach(async () => {
    harness = await createHarness()
  })

  afterEach(async () => {
    await harness.cleanup()
  })

  const provided = (name: string) => harness.ctx.get(`host:${name}`) !== undefined

  async function useCounter() {
    const fiber = await harness.ctx.use(Counter)
    await until(() => provided('counter'))
    return fiber
  }

  it('calls a method of a service of the host', async () => {
    await useCounter()
    expect(await harness.ctx.host.counter.add(2)).toBe(2)
    expect(await harness.ctx.host.counter.add(3)).toBe(5)
  })

  it('follows the availability of the service', async () => {
    const fiber = await useCounter()
    let running = false
    harness.ctx.inject(['host:counter'], (ctx) => {
      running = true
      ctx.effect(() => () => running = false)
    })
    await until(() => running)
    await fiber.dispose()
    await until(() => !provided('counter'))
    expect(running).toBe(false)
  })

  it('provides a service again that reappears while it is withdrawn', async () => {
    const fiber = await useCounter()
    let runs = 0
    let cleaning = false
    harness.ctx.inject(['host:counter'], (ctx) => {
      runs++
      ctx.effect(() => async () => {
        cleaning = true
        await new Promise(resolve => setTimeout(resolve, 20))
      })
    })
    await until(() => runs === 1)
    await fiber.dispose()
    await until(() => cleaning)
    await harness.ctx.use(Counter)
    await until(() => runs === 2)
    expect(await harness.ctx.host.counter.add(1)).toBe(1)
  })

  it('reads the value of a service at each call', async () => {
    let provider!: Context
    await harness.ctx.use((ctx: Context) => {
      provider = ctx
      ctx.provide('later')
    })
    await until(() => provided('later'))
    provider.set('later', { ping: () => 'pong' })
    expect(await harness.ctx.host.later.ping()).toBe('pong')
  })

  it('evaluates a chain of calls and reads on the host', async () => {
    await useCounter()
    const { counter } = harness.ctx.host
    expect(await counter.scale(3).apply(2)).toBe(6)
    expect(await counter.scale(3).factor).toBe(3)
    expect(await new counter.Scale(3).apply(2)).toBe(6)
    await counter.add(4)
    expect(await counter.value).toBe(4)
  })

  it('resolves an async iterable to the array of its items', async () => {
    await useCounter()
    expect(await harness.ctx.host.counter.count(3)).toEqual([0, 1, 2])
  })

  it('sends an expression once however often it is awaited', async () => {
    await useCounter()
    const result = harness.ctx.host.counter.add(1)
    expect(await result).toBe(1)
    expect(await result).toBe(1)
    expect(await result.then(value => value + 1)).toBe(2)
    expect(await harness.ctx.host.counter.value).toBe(1)
  })

  it('rejects a function or an expression as an argument without sending it', async () => {
    await useCounter()
    const { counter } = harness.ctx.host
    await expect(counter.add(counter.value as any)).rejects.toThrow(/await it first/)
    await expect(counter.add({ delta: counter.value } as any)).rejects.toThrow(/await it first/)
    await expect(counter.add((() => 1) as any)).rejects.toThrow(/cannot send a function/)
    expect(await counter.add(await counter.value)).toBe(0)
  })

  it('rejects with the code of the error', async () => {
    await useCounter()
    await expect(harness.ctx.host.counter.fail()).rejects.toMatchObject({
      message: 'denied',
      code: 'PermissionDenied',
    })
  })

  it('rejects a missing service or method', async () => {
    await useCounter()
    const { rpc } = harness.ctx.client
    await expect(rpc.invoke('absent', ['add', []])).rejects.toMatchObject({ code: 'service-unavailable' })
    await expect(rpc.invoke('counter', ['absent', []])).rejects.toMatchObject({ code: 'method-unavailable' })
    await expect(rpc.invoke('counter', ['value', []])).rejects.toMatchObject({ code: 'method-unavailable' })
    await expect(rpc.invoke('counter', ['constructor'])).rejects.toMatchObject({ code: 'member-unavailable' })
    await expect(rpc.invoke('counter', ['absent', 'value'])).rejects.toMatchObject({ code: 'member-unavailable' })
    await expect(rpc.invoke('counter', ['value', { new: [] }])).rejects.toMatchObject({ code: 'method-unavailable' })
  })

  it('is not taken as a thenable', async () => {
    await useCounter()
    expect(await harness.ctx.host.counter).toBe(harness.ctx.host.counter)
  })
})
