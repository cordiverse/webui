// Mount helper for loader-webui client component tests.
//
// Uses the real `@cordisjs/client` harness instead of the now-removed shim.
// We bring up a full ClientService (with real RouterService), instantiate
// Manager directly with the test Data, and mount the requested component
// against the same Cordis Context.
//
// `send` and `kRoute`/`kRouter` shim symbols are gone; tree.spec.ts assertions
// that referred to them have been migrated to use real RouterService and
// per-entry method spies instead.

import { mount, type ComponentMountingOptions, type VueWrapper } from '@vue/test-utils'
import { ref, type Component, type Ref } from 'vue'
import { Context } from 'cordis'
import { createHarness, type Harness } from '../../../webui/tests/harness/index.ts'
import Manager from '../../client/index'
import type { Data } from '../../src'

export interface MountOptions {
  data: Data
  /** Initial router location (e.g. `/plugins/e1/config`). Defaults to `/`. */
  initialRoute?: string
  /** Extra props forwarded to the mounted component. */
  props?: Record<string, any>
}

export interface MountResult<C> {
  wrapper: VueWrapper<any>
  ctx: Context
  manager: Manager
  data: Ref<Data>
  router: { currentRoute: { value: { path: string } } }
  harness: Harness
  /** Cleanup — call in `afterEach` for deterministic test isolation. */
  cleanup: () => Promise<void>
}

export async function mountWithManager<C extends Component>(
  component: C,
  options: MountOptions,
): Promise<MountResult<C>> {
  const { data, initialRoute = '/', props = {} } = options
  const dataRef = ref(data) as Ref<Data>

  const harness = await createHarness()
  const { kContext, kRoute, kRouter } = harness

  // Tree.vue uses `useRpc<Data>()` which reads `ctx.$entry.data`. We attach
  // a synthetic $entry so the component sees `dataRef` directly without
  // round-tripping through the WS entry:init/delta channel.
  ;(harness.ctx as any).$entry = {
    data: dataRef,
    done: ref(true),
    state: {},
    fibers: {},
  }

  const manager = new Manager(harness.ctx, dataRef)

  // Drive the real RouterService onto the requested initial route. Routes are
  // registered when components mount (Activity.setup); a manual push() before
  // mount won't have any matched record, but the currentRoute path string is
  // what the spec asserts on.
  if (initialRoute !== '/') {
    try { await harness.ctx.client.router.router.push(initialRoute) } catch {}
  }

  const wrapper = mount(component, {
    props,
    global: {
      provide: {
        [kContext]: harness.ctx,
        [kRouter]: harness.ctx.client.router.router,
        [kRoute]: harness.ctx.client.router.router.currentRoute,
      },
    },
  } as ComponentMountingOptions<C>)

  return {
    wrapper,
    ctx: harness.ctx,
    manager,
    data: dataRef,
    router: harness.ctx.client.router.router as any,
    harness,
    cleanup: async () => {
      wrapper.unmount()
      await harness.cleanup()
    },
  }
}
