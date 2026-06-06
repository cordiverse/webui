/**
 * Worker entry. Hosts the server half of cordis-online: a fresh cordis
 * `Context`, the browser-flavoured `Loader`, and `OnlineWebUI` — same plugin
 * tree as the prod-cordis Node deployment, just running in a dedicated
 * Worker instead of a Node process.
 *
 * Communication with the main thread (Vue + `@cordisjs/client`) goes
 * through a `WorkerBridgeSocket` wrapping a `MessagePort` that main
 * transferred at startup. The socket implements the same `BridgeSocket`
 * contract `@cordisjs/plugin-webui` expects, so `OnlineWebUI.accept`
 * doesn't know it isn't talking to a real WebSocket.
 *
 * Boot:
 *
 *   1. polyfills (process / global etc.)
 *   2. await `init` envelope from main → port + bootConfig
 *   3. build Context, plug LoggerConsole + BrowserLoader + OnlineWebUI
 *   4. socket.__open() — flush any buffered `entry:init`
 *   5. if `bootConfig.instanceId` is set, ask the loader to load
 *      `cordis.yml` from that instance's OPFS directory.
 */

import '../polyfills.ts'
import { Context } from 'cordis'
import LoggerConsole from '@cordisjs/plugin-logger-console'
import { acceptWorkerSocketBridge } from '../socket.ts'
import { BrowserLoader } from './loader.ts'
import { OnlineWebUI } from './online-webui.ts'

async function boot() {
  const { socket, bootConfig } = await acceptWorkerSocketBridge()
  const { instanceId, instancesRoot } = bootConfig

  const ctx = new Context()
  // Anchor every pre-instance fs lookup to the OPFS root (not the worker's
  // synthetic `blob:` script URL). Refined to the instance directory once
  // one is selected (below) — see also the original main-thread bootstrap
  // for the same baseUrl reasoning.
  ctx.baseUrl = 'file:///'

  await ctx.plugin(LoggerConsole)
  await ctx.plugin(BrowserLoader)
  await ctx.plugin(OnlineWebUI, { socket })

  // Flush server → main now that all plugins have registered. `WebUI.accept`
  // sent `entry:init` synchronously while the socket was still CONNECTING;
  // that frame has been sitting in the outbox.
  socket.__open()

  if (instanceId) {
    ctx.baseUrl = `file://${instancesRoot}/${instanceId}/`
    // `EntryTree` snapshots its parent's baseUrl at plug-time, and the
    // root loader plugged before the instance was selected, so its
    // snapshot is still `file:///`. Pass an absolute path here to dodge
    // the stale snapshot — same trick the old main-thread bootstrap used.
    await ctx.loader.create({
      name: '@cordisjs/plugin-include',
      config: {
        path: `${instancesRoot}/${instanceId}/cordis.yml`,
        enableLogs: true,
      },
    }).catch((e: any) => {
      console.error('[online/worker] failed to load instance config:', e)
    })
  }
}

boot().catch((err) => {
  console.error('[online/worker] boot failed:', err)
})
