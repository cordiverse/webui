import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { Context } from 'cordis'
import Loader from '@cordisjs/plugin-loader'
import { WebSocket } from 'ws'
import { pathToFileURL } from 'node:url'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { startMarketMock, MockServer } from './helpers/registry.ts'
import { Fixture, getFreePort, resetTmp, setupFixture } from './helpers/fixture.ts'

function waitFor(cond: () => any, timeout = 8000, interval = 100): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const t0 = Date.now()
    const iv = setInterval(() => {
      try {
        if (cond()) {
          clearInterval(iv)
          resolve()
          return
        }
      } catch {}
      if (Date.now() - t0 > timeout) {
        clearInterval(iv)
        reject(new Error('waitFor timed out'))
      }
    }, interval)
  })
}

async function bootCordis(cwd: string): Promise<Context> {
  const ctx = new Context()
  ;(ctx as any).baseUrl = pathToFileURL(cwd + '/').href
  await (ctx as any).plugin(Loader)
  await (ctx as any).loader.create({
    name: '@cordisjs/plugin-include',
    config: { path: './cordis.yml' },
  })
  await waitFor(() => (ctx as any).webui && (ctx as any).market && (ctx as any).installer, 60_000)
  return ctx
}

async function openClient(serverPort: number) {
  const ws = new WebSocket(`ws://127.0.0.1:${serverPort}/api`)
  const messages: any[] = []
  ws.on('message', (data) => {
    try { messages.push(JSON.parse(data.toString())) } catch {}
  })
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve())
    ws.once('error', reject)
  })
  return { ws, messages }
}

describe('@cordisjs/plugin-market E2E', () => {
  let mock: MockServer

  beforeAll(async () => {
    resetTmp()
    mock = await startMarketMock()
  })

  afterAll(async () => {
    await mock?.close().catch(() => {})
  })

  describe('installing a new dependency', () => {
    let ctx: Context
    let fixture: Fixture
    let serverPort: number

    beforeAll(async () => {
      serverPort = await getFreePort()
      fixture = await setupFixture({
        marketEndpoint: `http://127.0.0.1:${mock.port}/index.json`,
        serverPort,
      })
      ctx = await bootCordis(fixture.cwd)
    }, 180_000)

    afterAll(async () => {
      try { (ctx as any)?.root?.dispose?.() } catch {}
    })

    it('reflects the freshly installed dependency in WS broadcast', async () => {
      const { ws, messages } = await openClient(serverPort)
      await waitFor(() => messages.some((m) => m.type === 'entry:init'), 10_000)

      const res = await fetch(`http://127.0.0.1:${serverPort}/api/market/install`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify([{ '@cordisjs/plugin-server-echo': '^1.0.0' }]),
      })
      expect(res.status).to.equal(200)

      await waitFor(
        () => messages.some((m) => JSON.stringify(m).includes('@cordisjs/plugin-server-echo')),
        120_000,
      )

      expect(existsSync(join(fixture.cwd, 'node_modules/@cordisjs/plugin-server-echo'))).to.be.true
      ws.close()
    }, 180_000)

    it('loader-webui packages list gains the newly installed entry', async () => {
      const { ws, messages } = await openClient(serverPort)
      await waitFor(() => messages.some((m) => m.type === 'entry:init'), 10_000)

      // Identify loader-webui's entry id: it's the unique one whose data
      // payload carries a `packages` dict.
      let loaderEntryId: string | undefined
      for (const m of messages) {
        if (m.type !== 'entry:init') continue
        for (const id in m.body?.entries ?? {}) {
          if (m.body.entries[id]?.data?.packages) loaderEntryId = id
        }
      }
      expect(loaderEntryId, 'loader-webui entry not found in entry:init').to.be.a('string')

      const baseline = messages.length

      const res = await fetch(`http://127.0.0.1:${serverPort}/api/market/install`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify([{ '@cordisjs/plugin-server-echo': '^1.0.0' }]),
      })
      expect(res.status).to.equal(200)

      // After install, expect an entry:delta from loader-webui's entry
      // whose payload references the newly installed plugin.
      await waitFor(() => messages.slice(baseline).some((m) =>
        m.type === 'entry:delta'
        && m.body?.id === loaderEntryId
        && JSON.stringify(m.body ?? {}).includes('@cordisjs/plugin-server-echo'),
      ), 60_000)

      ws.close()
    }, 180_000)
  })
})
