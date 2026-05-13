/**
 * Boot orchestration for cordis-online.
 *
 * Sequence (each step depends on the previous):
 *
 * 1. SW registration  — production only; dev relies on Vite to resolve bare
 *    specifiers and would fight a SW intercept.
 * 2. Polyfills        — `globalThis.process` / `Buffer` / `global` set in
 *                       `polyfills.ts`, imported at the top of `index.ts`
 *                       BEFORE this module loads.
 * 3. createClient()   — fresh cordis Context with `ClientService` installed.
 * 4. Bridge sockets   — `createSocketBridge()` paired BridgeSockets.
 * 5. Server-side plug — `LoggerService` + `BrowserLoader` + `OnlineWebUI` on
 *                       the same Context. `OnlineWebUI` is plugged with the
 *                       `bridge.server` socket in its config and accepts it
 *                       in `[Service.init]`.
 * 6. Activate         — Read current instance from localStorage; chdir the
 *                       loader into that instance's fs root; load cordis.yml.
 * 7. ctx.client.mount('#app').
 */

import { Context } from 'cordis'
import { connect, createClient, ClientService } from '@cordisjs/client'
import LoggerConsole from '@cordisjs/plugin-logger-console'
import { Loader } from '@cordisjs/plugin-loader'
import IncludePlugin from '@cordisjs/plugin-include'
import { createSocketBridge } from './socket.ts'
import { BrowserLoader } from './loader.ts'
import { OnlineWebUI } from './online-webui.ts'
import instancesPlugin from './instances/index.ts'
import { initialize, INSTANCES_ROOT } from './instances/utils.ts'

// Stylesheets and built-in client-app plugins. These live next to
// `@cordisjs/client` (under `packages/client/app/`) and are NOT exported by
// the package, so we import via aliases (set up in dev/build configs).
import 'virtual:uno.css'
import '@cordisjs/client/app/index.scss'
import home from '@cordisjs/client/app/home'
import layout from '@cordisjs/client/app/layout'
import settings from '@cordisjs/client/app/settings'
import status from '@cordisjs/client/app/status'
import styles from '@cordisjs/client/app/styles'
import theme from '@cordisjs/client/app/theme'

declare module 'cordis' {
  interface Context {
    online: OnlineRuntime
  }
}

interface OnlineRuntime {
  /** The currently activated instance id, or undefined if none. */
  instanceId?: string
}

export interface BootstrapOptions {
  /** Container element to mount Vue onto. Defaults to `'#app'`. */
  mount?: string | Element
}

export async function bootstrap(opts: BootstrapOptions = {}) {
  // 1. SW already registered before this function is called (see index.ts).

  // 2. Polyfills already imported at top of index.ts.

  // 3. Create the client (Vue + ClientService). Anchor `ctx.baseUrl` to the
  //     virtual fs root from the start so any relative path the loader or a
  //     plugin tries to resolve lands in OPFS instead of the page URL. It's
  //     refined to the instance directory once one is activated (step 6d).
  const ctx = createClient()
  ctx.baseUrl = 'file:///'

  // 3b. Plug the built-in client-app plugins — these mirror what
  //     `@cordisjs/client/app` plugs in the standard webui shell.
  ctx.plugin(home)
  ctx.plugin(layout)
  ctx.plugin(settings)
  ctx.plugin(status)
  ctx.plugin(styles)
  ctx.plugin(theme)

  // 4. In-process WS bridge.
  const bridge = createSocketBridge()

  // 5. Plug the server-side cordis stack onto the same Context.
  //
  //     OnlineWebUI receives the in-process socket directly via its plugin
  //     config — no carrier service, no Symbol on the loader. Browser has
  //     exactly one root ctx and one bridge for the lifetime of the page.
  await ctx.plugin(LoggerConsole)
  await ctx.plugin(BrowserLoader)
  await ctx.plugin(OnlineWebUI, { socket: bridge.server })

  // 6. Activate the current instance. `initialize()` may reload the page
  //    (e.g. when handling `?share=`); the code below only runs when we have
  //    an existing instance to enter.
  const instanceId = await initialize()
  ;(ctx as any).online = { instanceId }

  // 6b. Connect the client half of the bridge. ClientService is already on
  //     ctx (createClient added it); connect() will run on the same Context,
  //     dispatching messages received on bridge.client to the client-side
  //     RPC service.
  const opened = connect(ctx, () => bridge.client)
  bridge.client.__open()
  await opened

  // 6c. Plug client-side UI (instance picker pages + icons). Done AFTER
  //     connect() so the router-level state machine sees the freshly
  //     registered pages on its first navigation pass.
  await ctx.plugin(instancesPlugin)

  // 6d. If we have a current instance, point the loader at it and let the
  //     include plugin load the YAML. We pass an absolute fs path so the
  //     resolution doesn't depend on `ctx.loader.ctx.baseUrl` (`EntryTree`
  //     snapshots its parent's baseUrl at plug-time — `BrowserLoader` was
  //     plugged before the instance was selected, so its snapshot is still
  //     `file:///`). Setting the root ctx.baseUrl is still useful for
  //     downstream consumers that read it from the root.
  if (instanceId) {
    ctx.baseUrl = `file://${INSTANCES_ROOT}/${instanceId}/`
    await ctx.loader.create({
      name: '@cordisjs/plugin-include',
      config: {
        path: `${INSTANCES_ROOT}/${instanceId}/cordis.yml`,
        enableLogs: true,
      },
    }).catch((e: any) => {
      console.error('[online] failed to load instance config:', e)
    })
  }

  // 7. Mount Vue.
  ctx.client.mount(opts.mount ?? '#app')

  return ctx
}
