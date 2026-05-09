// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { createSocketBridge } from './harness/bridge.ts'

describe('socket bridge', () => {
  it('relays messages bidirectionally after open', async () => {
    const { client, server } = createSocketBridge()
    const fromClient: string[] = []
    const fromServer: string[] = []
    server.addEventListener('message', e => fromClient.push(e.data))
    client.addEventListener('message', e => fromServer.push(e.data))

    client.__open()
    await Promise.resolve()

    client.send('hello')
    server.send('world')
    await new Promise(r => queueMicrotask(() => r(null)))

    expect(fromClient).toEqual(['hello'])
    expect(fromServer).toEqual(['world'])
  })

  it('buffers sends before open and flushes on open', async () => {
    const { client, server } = createSocketBridge()
    const seen: string[] = []
    server.addEventListener('message', e => seen.push(e.data))
    client.send('queued')
    expect(seen).toEqual([])
    client.__open()
    await new Promise(r => queueMicrotask(() => r(null)))
    await new Promise(r => queueMicrotask(() => r(null)))
    expect(seen).toEqual(['queued'])
  })

  it('close propagates by default', async () => {
    const { client, server } = createSocketBridge()
    client.__open()
    await Promise.resolve()
    let serverClosed = false
    server.addEventListener('close', () => { serverClosed = true })
    client.close()
    await new Promise(r => queueMicrotask(() => r(null)))
    expect(server.readyState).toBe(3)
    expect(serverClosed).toBe(true)
  })

  it('__suppressReconnect skips peer close event', async () => {
    const { client, server } = createSocketBridge()
    client.__open()
    await Promise.resolve()
    let serverClosed = false
    server.addEventListener('close', () => { serverClosed = true })
    client.__suppressReconnect = true
    client.close()
    await new Promise(r => queueMicrotask(() => r(null)))
    expect(server.readyState).toBe(3)
    expect(serverClosed).toBe(false)
  })
})
