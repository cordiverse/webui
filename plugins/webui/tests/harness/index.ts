import { Context } from 'cordis'
import { mount, VueWrapper } from '@vue/test-utils'
import LoggerConsole from '@cordisjs/plugin-logger-console'
import { createSocketBridge, SocketBridge } from '../../src/bridge.ts'
import { TestWebUI } from './test-webui.ts'
import type { Component } from 'vue'

export interface HarnessOptions {
  plugins?: Array<[plugin: any, config?: any]>
}

export interface Harness {
  ctx: Context
  bridge: SocketBridge
  container: HTMLElement
  /** Vue inject keys re-exported from `@cordisjs/client` so consumers don't
   * have to import the package separately (which can mis-resolve through
   * vite-tsconfig-paths in some workspaces). */
  kContext: any
  kRoute: any
  kRouter: any
  loadEntry: (entryId: string, apply: (ctx: Context, data: any) => void) => Promise<{ ctx: Context }>
  mount: (component: Component, options?: { entryCtx?: Context; props?: any }) => VueWrapper<any>
  cleanup: () => Promise<void>
}

export async function createHarness(opts: HarnessOptions = {}): Promise<Harness> {
  const containerId = `harness-${Math.random().toString(36).slice(2, 8)}`
  const container = document.createElement('div')
  container.id = containerId
  document.body.appendChild(container)

  // Defer import so vi.mock('element-plus') hoists ahead of the createClient
  // chain; createClient internally runs `app.use(Element)` and we want the
  // mock module to win.
  const Client = await import('@cordisjs/client')
  const { createClient, connect, kContext, kRoute, kRouter } = Client

  const ctx = createClient()
  const bridge = createSocketBridge()

  await ctx.plugin(TestWebUI, { socket: bridge.server })

  for (const [plugin, config] of opts.plugins ?? []) {
    await ctx.plugin(plugin, config)
  }

  const openP = connect(ctx, () => bridge.client)
  bridge.client.__open()
  await openP
  // Mount onto the per-harness container so concurrent instances don't fight
  // for #app. mount is sync now — router.ready runs fire-and-forget in the
  // ClientService constructor; if it errors under happy-dom (e.g. unset
  // global.uiPath), the warning lands in console but doesn't block paint.
  ctx.client.mount(container)

  return {
    ctx,
    bridge,
    container,
    kContext,
    kRoute,
    kRouter,
    async loadEntry(entryId, applyFn) {
      const $entry = ctx.client.loader.entries[entryId]
      if (!$entry) throw new Error(`no such entry: ${entryId}`)
      const childCtx = ctx.extend({ $entry })
      const fiber = await childCtx.plugin(applyFn, $entry.data.value)
      $entry.fibers['__test__'] = fiber as any
      $entry.done.value = true
      return { ctx: childCtx }
    },
    mount(component, { entryCtx, props } = {}) {
      return mount(component, {
        props,
        global: {
          provide: { [kContext as any]: entryCtx ?? ctx },
        },
      })
    },
    async cleanup() {
      bridge.client.__suppressReconnect = true
      bridge.client.close()
      bridge.server.close()
      try { ctx.client.app.unmount() } catch {}
      container.remove()
    },
  }
}
