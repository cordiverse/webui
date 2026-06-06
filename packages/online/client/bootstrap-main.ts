/**
 * Main-thread bootstrap. Builds the Vue app + `@cordisjs/client` Context,
 * spawns the cordis-runtime Worker, wires them up over a
 * `WorkerBridgeSocket`, and mounts.
 *
 * Sequence:
 *
 *   1. createClient() — fresh `ClientService`-equipped Context, `ctx.baseUrl`
 *      anchored to the virtual fs root so any pre-instance code anchors in
 *      OPFS rather than the page URL.
 *   2. Plug the built-in client-app plugins (home/layout/settings/etc.) —
 *      same set the standard webui shell uses.
 *   3. initialize() — runs main-thread-only work: read localStorage for the
 *      current instance id, decode `?share=` if present (may `location.reload()`).
 *   4. Spawn the Worker. Pass the server-side `MessagePort` + `bootConfig`
 *      in the initial `postMessage`; the Worker assembles its own Context
 *      on the other side.
 *   5. connect(ctx, () => socket) — drive the client RPC service off our
 *      `WorkerBridgeSocket`, then `__open()` it to release any buffered
 *      `entry:init` from the worker.
 *   6. Plug the instances UI plugin (registers `/instances` route + icons).
 *   7. Mount Vue.
 */

import { connect, createClient } from '@cordisjs/client'
import { createWorkerSocketBridge } from './socket.ts'
import instancesPlugin from './instances/index.ts'
import { initialize, INSTANCES_ROOT } from './instances/utils.ts'

// Stylesheets and built-in client-app plugins. These live next to
// `@cordisjs/client` (under `packages/client/app/`) and are NOT exported by
// the package, so we import via aliases (set up in vite.config.ts).
import 'virtual:uno.css'
import '@cordisjs/client/app/index.scss'
import home from '@cordisjs/client/app/home'
import layout from '@cordisjs/client/app/layout'
import settings from '@cordisjs/client/app/settings'
import status from '@cordisjs/client/app/status'
import styles from '@cordisjs/client/app/styles'
import theme from '@cordisjs/client/app/theme'

export interface BootstrapOptions {
  /** Container element to mount Vue onto. Defaults to `'#app'`. */
  mount?: string | Element
}

export async function bootstrapMain(opts: BootstrapOptions = {}) {
  // 1.
  const ctx = createClient()
  ctx.baseUrl = 'file:///'

  // 2.
  ctx.plugin(home)
  ctx.plugin(layout)
  ctx.plugin(settings)
  ctx.plugin(status)
  ctx.plugin(styles)
  ctx.plugin(theme)

  // 3. May `location.reload()` via `activate()` when `?share=` is set —
  //    in that case nothing below runs.
  const instanceId = await initialize()

  // 4. Spawn the worker. `new URL(..., import.meta.url)` is Vite's
  //    canonical pattern — dev transforms on-the-fly, prod emits a
  //    separate chunk.
  const worker = new Worker(new URL('./worker/entry.ts', import.meta.url), { type: 'module' })

  const socket = createWorkerSocketBridge(worker, {
    instanceId,
    instancesRoot: INSTANCES_ROOT,
  })

  // 5. Wire the client RPC half onto the bridge, then flip the socket
  //    open so any buffered `entry:init` from the worker lands.
  const opened = connect(ctx, () => socket)
  socket.__open()
  await opened

  // 6. Plug client-side instance picker AFTER connect() so the router's
  //    state machine sees the freshly registered pages on its first
  //    navigation pass.
  await ctx.plugin(instancesPlugin)

  // 7.
  ctx.client.mount(opts.mount ?? '#app')

  return ctx
}
